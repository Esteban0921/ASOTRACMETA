import type { FastifyInstance } from 'fastify';
import type { AlmacenMemoria } from '@asotracmet/domain';
import {
  FiltroAuditSchema,
  MODULO_AUDIT,
  ParametrosSchema,
  PatchParametrosSchema,
  enmascararDocumento,
  veEnmascarado,
} from '@asotracmet/shared';
import { actorDe, exigir } from '../auth/plugin.js';

export interface DepsCatalogos {
  almacen: AlmacenMemoria;
}

/** Catálogos de lectura, parámetros y auditoría (spec §8.3, §8.5, §10). */
export function rutasCatalogos(app: FastifyInstance, deps: DepsCatalogos): void {
  const { almacen } = deps;

  app.get('/api/v1/clientes', { preHandler: exigir('catalogos', 'R') }, async (_req, reply) =>
    reply.send(almacen.estado.clientes),
  );

  app.get('/api/v1/destinos', { preHandler: exigir('catalogos', 'R') }, async (_req, reply) =>
    reply.send(almacen.estado.destinos.filter((d) => d.activo)),
  );

  app.get(
    '/api/v1/motivos-declinacion',
    { preHandler: exigir('catalogos', 'R') },
    async (_req, reply) => reply.send(almacen.estado.motivosDeclinacion.filter((m) => m.activo)),
  );

  app.get(
    '/api/v1/vehiculos',
    { preHandler: exigir('vehiculos', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const actor = actorDe(req);
      const propias = actor.rol === 'member' ? new Set(actor.vehiculoIds ?? []) : null;
      const enmascarar = veEnmascarado(actor.rol, 'asociados');
      const lista = almacen.estado.vehiculos
        .filter((v) => !propias || propias.has(v.id))
        .map((v) => {
          const asociado = almacen.estado.asociados.find((a) => a.id === v.asociadoId);
          return {
            ...v,
            asociado: asociado
              ? {
                  id: asociado.id,
                  nombre:
                    asociado.razonSocial ??
                    `${asociado.nombres} ${asociado.apellidos ?? ''}`.trim(),
                  documento: enmascarar
                    ? enmascararDocumento(asociado.documento)
                    : asociado.documento,
                }
              : null,
            habilitaciones: almacen.estado.habilitaciones
              .filter((h) => h.vehiculoId === v.id)
              .map((h) => ({
                clienteId: h.clienteId,
                cliente: almacen.estado.clientes.find((c) => c.id === h.clienteId)?.codigo ?? null,
                apto: h.apto,
                motivoBloqueo: h.motivoBloqueo,
              })),
          };
        });
      return reply.send(lista);
    },
  );

  app.get('/api/v1/parametros', { preHandler: exigir('parametros', 'R') }, async (_req, reply) =>
    reply.send(almacen.estado.parametros),
  );

  app.patch('/api/v1/parametros', { preHandler: exigir('parametros', 'U') }, async (req, reply) => {
    const cambios = PatchParametrosSchema.parse(req.body);
    const actor = actorDe(req);
    const nuevos = await almacen.ejecutar(null, async (tx) => {
      const antes = await tx.parametros();
      const despues = ParametrosSchema.parse({ ...antes, ...cambios });
      await tx.guardarParametros(despues);
      await tx.auditar({
        actorId: actor.id,
        actorRol: actor.rol,
        accion: 'parametros.cambiar',
        entidad: 'parametros',
        entidadId: Object.keys(cambios).join(','),
        before: Object.fromEntries(
          Object.keys(cambios).map((k) => [k, antes[k as keyof typeof antes]]),
        ),
        after: cambios,
      });
      return despues;
    });
    return reply.send(nuevos);
  });

  app.get('/api/v1/audit', { preHandler: exigir('audit_log', 'R') }, async (req, reply) => {
    const filtro = FiltroAuditSchema.parse(req.query);
    const actor = actorDe(req);
    const alcance = MODULO_AUDIT[actor.rol];
    const lista = almacen.estado.auditoria
      .filter((e) => alcance === 'todo' || (alcance !== 'nada' && alcance.includes(e.entidad)))
      .filter((e) => !filtro.entidad || e.entidad === filtro.entidad)
      .filter((e) => !filtro.id || e.entidadId === filtro.id)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, filtro.limite);
    return reply.send(lista);
  });
}
