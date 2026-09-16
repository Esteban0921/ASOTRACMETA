import type { FastifyInstance } from 'fastify';
import type { UnidadDeTrabajo } from '@asotracmet/domain';
import {
  FiltroAuditSchema,
  MODULO_AUDIT,
  ParametrosSchema,
  PatchParametrosSchema,
  veEnmascarado,
} from '@asotracmet/shared';
import { actorDe, exigir } from '../auth/plugin.js';
import type { Consultas } from '../consultas/tipos.js';

export interface DepsCatalogos {
  uow: UnidadDeTrabajo;
  consultas: Consultas;
}

/** Catálogos de lectura, parámetros y auditoría (spec §8.3, §8.5, §10). */
export function rutasCatalogos(app: FastifyInstance, deps: DepsCatalogos): void {
  const { uow, consultas } = deps;

  app.get('/api/v1/clientes', { preHandler: exigir('catalogos', 'R') }, async (_req, reply) =>
    reply.send(await consultas.clientes()),
  );

  app.get('/api/v1/destinos', { preHandler: exigir('catalogos', 'R') }, async (_req, reply) =>
    reply.send(await consultas.destinos()),
  );

  app.get(
    '/api/v1/motivos-declinacion',
    { preHandler: exigir('catalogos', 'R') },
    async (_req, reply) => reply.send(await consultas.motivosDeclinacion()),
  );

  app.get(
    '/api/v1/vehiculos',
    { preHandler: exigir('vehiculos', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const actor = actorDe(req);
      return reply.send(
        await consultas.vehiculos({
          vehiculoIds: actor.rol === 'member' ? (actor.vehiculoIds ?? []) : undefined,
          enmascarar: veEnmascarado(actor.rol, 'asociados'),
        }),
      );
    },
  );

  app.get('/api/v1/parametros', { preHandler: exigir('parametros', 'R') }, async (_req, reply) =>
    reply.send(await consultas.parametros()),
  );

  app.patch('/api/v1/parametros', { preHandler: exigir('parametros', 'U') }, async (req, reply) => {
    const cambios = PatchParametrosSchema.parse(req.body);
    const actor = actorDe(req);
    const nuevos = await uow.ejecutar(null, async (tx) => {
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
    return reply.send(
      await consultas.audit({
        entidad: filtro.entidad,
        entidadId: filtro.id,
        limite: filtro.limite,
        entidadesPermitidas: alcance === 'todo' ? null : alcance === 'nada' ? [] : alcance,
      }),
    );
  });
}
