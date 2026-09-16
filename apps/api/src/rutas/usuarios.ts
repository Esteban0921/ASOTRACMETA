import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ErrorDominio,
  type Actor,
  type GeneradorIds,
  type UnidadDeTrabajo,
} from '@asotracmet/domain';
import {
  ActualizarUsuarioSchema,
  AsignarVehiculosSchema,
  CambiarRolSchema,
  CrearUsuarioSchema,
} from '@asotracmet/shared';
import { hashPassword } from '../auth/passwords.js';
import { actorDe, exigir } from '../auth/plugin.js';
import type { RepositorioAuth } from '../auth/sesiones.js';
import type { Consultas } from '../consultas/tipos.js';
import { usuarioPublico, type RepositorioUsuarios, type Usuario } from '../usuarios.js';

export interface DepsUsuarios {
  usuarios: RepositorioUsuarios;
  auth: RepositorioAuth;
  uow: UnidadDeTrabajo;
  consultas: Consultas;
  ids: GeneradorIds;
}

const IdParam = z.object({ id: z.string().min(1) });

/**
 * IAM (spec §3.1, §8.2): un rol primario por usuario; `member` entra con enlace y tiene placas,
 * los roles internos pueden tener contraseña. Solo superadmin crea y modifica; los admins leen.
 * Cada cambio queda en audit (sin contraseñas ni secretos).
 */
export function rutasUsuarios(app: FastifyInstance, deps: DepsUsuarios): void {
  const { usuarios, auth, uow, consultas, ids } = deps;

  const auditar = (
    actor: Actor,
    accion: string,
    usuarioId: string,
    before: unknown,
    after: unknown,
  ) =>
    uow.ejecutar(null, (tx) =>
      tx.auditar({
        actorId: actor.id,
        actorRol: actor.rol,
        accion,
        entidad: 'usuarios',
        entidadId: usuarioId,
        before,
        after,
      }),
    );

  async function exigirVehiculos(vehiculoIds: readonly string[]): Promise<void> {
    if (vehiculoIds.length === 0) return;
    const existentes = await consultas.vehiculos({ vehiculoIds, enmascarar: true });
    const faltan = vehiculoIds.filter((id) => !existentes.some((v) => v.id === id));
    if (faltan.length > 0) {
      throw new ErrorDominio('VALIDATION_ERROR', 'Hay placas que no existen', { faltan });
    }
  }

  async function usuarioOr404(id: string): Promise<Usuario> {
    const usuario = await usuarios.porId(id);
    if (!usuario) throw new ErrorDominio('NOT_FOUND', 'Usuario no existe');
    return usuario;
  }

  app.get('/api/v1/usuarios', { preHandler: exigir('usuarios', 'R') }, async (_req, reply) =>
    reply.send((await usuarios.listar()).map(usuarioPublico)),
  );

  app.get('/api/v1/usuarios/:id', { preHandler: exigir('usuarios', 'R') }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    return reply.send(usuarioPublico(await usuarioOr404(id)));
  });

  app.post('/api/v1/usuarios', { preHandler: exigir('usuarios', 'C') }, async (req, reply) => {
    const entrada = CrearUsuarioSchema.parse(req.body);
    const actor = actorDe(req);
    const email = entrada.email.trim().toLowerCase();
    if (await usuarios.porEmail(email)) {
      throw new ErrorDominio('EMAIL_EN_USO', 'Ya existe un usuario con ese correo');
    }
    if (entrada.rol === 'member' && entrada.password) {
      throw new ErrorDominio(
        'VALIDATION_ERROR',
        'Los asociados entran con enlace, no con contraseña',
      );
    }
    if (entrada.rol !== 'member' && (entrada.vehiculoIds?.length ?? 0) > 0) {
      throw new ErrorDominio('VALIDATION_ERROR', 'Solo un asociado tiene placas asignadas');
    }
    await exigirVehiculos(entrada.vehiculoIds ?? []);
    const nuevo: Usuario = {
      id: ids.nuevo(),
      email,
      nombre: entrada.nombre,
      rol: entrada.rol,
      passwordHash: entrada.password ? hashPassword(entrada.password) : null,
      totpSecretEnc: null,
      activo: true,
      asociadoId: entrada.asociadoId ?? null,
      vehiculoIds: entrada.vehiculoIds ?? [],
    };
    await usuarios.crear(nuevo);
    await auditar(actor, 'usuario.crear', nuevo.id, null, usuarioPublico(nuevo));
    return reply.status(201).send(usuarioPublico(nuevo));
  });

  app.patch('/api/v1/usuarios/:id', { preHandler: exigir('usuarios', 'U') }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const cambios = ActualizarUsuarioSchema.parse(req.body);
    const actor = actorDe(req);
    const usuario = await usuarioOr404(id);
    if (cambios.activo === false && usuario.id === actor.id) {
      throw new ErrorDominio('VALIDATION_ERROR', 'No puedes desactivar tu propia cuenta');
    }
    if (cambios.password && usuario.rol === 'member') {
      throw new ErrorDominio(
        'VALIDATION_ERROR',
        'Los asociados entran con enlace, no con contraseña',
      );
    }
    const actualizado: Usuario = {
      ...usuario,
      nombre: cambios.nombre ?? usuario.nombre,
      activo: cambios.activo ?? usuario.activo,
      asociadoId: cambios.asociadoId === undefined ? usuario.asociadoId : cambios.asociadoId,
      passwordHash:
        cambios.password === undefined
          ? usuario.passwordHash
          : cambios.password === null
            ? null
            : hashPassword(cambios.password),
    };
    await usuarios.actualizar(actualizado);
    // Un usuario desactivado deja de entrar en la siguiente petición, no en el próximo login.
    if (cambios.activo === false) await auth.revocarSesionesDe(usuario.id);
    await auditar(
      actor,
      'usuario.actualizar',
      usuario.id,
      usuarioPublico(usuario),
      usuarioPublico(actualizado),
    );
    return reply.send(usuarioPublico(actualizado));
  });

  // Solo superadmin (spec §8.2): es el único rol con U sobre `usuarios` en la matriz RBAC.
  app.post(
    '/api/v1/usuarios/:id/roles',
    { preHandler: exigir('usuarios', 'U') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const { rol } = CambiarRolSchema.parse(req.body);
      const actor = actorDe(req);
      const usuario = await usuarioOr404(id);
      if (usuario.id === actor.id && rol !== usuario.rol) {
        throw new ErrorDominio('VALIDATION_ERROR', 'No puedes cambiar tu propio rol');
      }
      const pasaAMember = rol === 'member';
      const actualizado: Usuario = {
        ...usuario,
        rol,
        // Un asociado no tiene contraseña ni TOTP; un rol interno no tiene placas.
        passwordHash: pasaAMember ? null : usuario.passwordHash,
        totpSecretEnc: pasaAMember ? null : usuario.totpSecretEnc,
        vehiculoIds: pasaAMember ? usuario.vehiculoIds : [],
      };
      await usuarios.actualizar(actualizado);
      // Los permisos cambian: las sesiones abiertas con el rol anterior dejan de valer.
      await auth.revocarSesionesDe(usuario.id);
      await auditar(actor, 'usuario.rol', usuario.id, { rol: usuario.rol }, { rol });
      return reply.send(usuarioPublico(actualizado));
    },
  );

  // Scope `member` (spec §3.3): las placas que el asociado ve y sobre las que puede actuar.
  app.post(
    '/api/v1/usuarios/:id/vehiculos',
    { preHandler: exigir('usuarios', 'U') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const { vehiculoIds } = AsignarVehiculosSchema.parse(req.body);
      const actor = actorDe(req);
      const usuario = await usuarioOr404(id);
      if (usuario.rol !== 'member') {
        throw new ErrorDominio('VALIDATION_ERROR', 'Solo un asociado tiene placas asignadas');
      }
      await exigirVehiculos(vehiculoIds);
      const actualizado: Usuario = { ...usuario, vehiculoIds: [...new Set(vehiculoIds)] };
      await usuarios.actualizar(actualizado);
      await auditar(
        actor,
        'usuario.vehiculos',
        usuario.id,
        { vehiculoIds: usuario.vehiculoIds },
        { vehiculoIds: actualizado.vehiculoIds },
      );
      return reply.send(usuarioPublico(actualizado));
    },
  );
}
