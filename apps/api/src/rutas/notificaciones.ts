import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ErrorDominio, type Reloj, type UnidadDeTrabajo } from '@asotracmet/domain';
import { FiltroNotificacionesSchema, PreferenciasNotificacionSchema } from '@asotracmet/shared';
import { actorDe, exigir, sesionDe } from '../auth/plugin.js';
import type { ResumenAvisos } from '../notificaciones/avisos.js';
import type { RepositorioNotificaciones } from '../notificaciones/tipos.js';
import type { WorkerNotificaciones } from '../notificaciones/worker.js';
import type { RepositorioUsuarios } from '../usuarios.js';

export interface DepsNotificaciones {
  notificaciones: RepositorioNotificaciones;
  usuarios: RepositorioUsuarios;
  worker: WorkerNotificaciones;
  /** Los tres jobs de avisos con la fecha local de la operación. */
  correrAvisos: () => Promise<ResumenAvisos>;
  uow: UnidadDeTrabajo;
  reloj: Reloj;
}

const IdParam = z.object({ id: z.string().min(1) });

/**
 * Bandeja y preferencias del usuario (spec §11) más el disparo manual del worker y de los jobs de
 * avisos (§14). La bandeja es personal: cualquier rol lee y marca solo lo suyo.
 */
export function rutasNotificaciones(app: FastifyInstance, deps: DepsNotificaciones): void {
  const { notificaciones, usuarios, reloj } = deps;

  app.get('/api/v1/me/notificaciones', async (req, reply) => {
    const { usuario } = sesionDe(req);
    const filtro = FiltroNotificacionesSchema.parse(req.query);
    return reply.send(
      await notificaciones.deUsuario(usuario.id, {
        soloNoLeidas: filtro.noLeidas,
        limite: filtro.limite,
      }),
    );
  });

  app.post('/api/v1/me/notificaciones/:id/leer', async (req, reply) => {
    const { usuario } = sesionDe(req);
    const { id } = IdParam.parse(req.params);
    const marcada = await notificaciones.marcarLeida(id, usuario.id, reloj.ahora().toISOString());
    if (!marcada) throw new ErrorDominio('NOT_FOUND', 'Aviso no encontrado');
    return reply.send({ ok: true });
  });

  app.get('/api/v1/me/preferencias', async (req, reply) => {
    const { usuario } = sesionDe(req);
    return reply.send(usuario.preferencias);
  });

  app.patch('/api/v1/me/preferencias', async (req, reply) => {
    const { usuario } = sesionDe(req);
    const nuevas = PreferenciasNotificacionSchema.parse(req.body ?? {});
    await usuarios.fijarPreferencias(usuario.id, nuevas);
    // Auditado sin PII: el celular no va al log, solo si existe.
    const resumen = (p: typeof nuevas) => ({
      correo: p.correo,
      whatsapp: p.whatsapp,
      celular: p.celular !== null,
    });
    await deps.uow.ejecutar(null, (tx) =>
      tx.auditar({
        actorId: usuario.id,
        actorRol: usuario.rol,
        accion: 'preferencias.cambiar',
        entidad: 'usuarios',
        entidadId: usuario.id,
        before: resumen(usuario.preferencias),
        after: resumen(nuevas),
      }),
    );
    return reply.send(nuevas);
  });

  // --- Jobs (§14): disparo manual; en producción corre el scheduler de index.ts ---
  app.post('/api/v1/jobs/notificar', { preHandler: exigir('cola', 'U') }, async (_req, reply) => {
    return reply.send(await deps.worker.procesar());
  });

  app.post('/api/v1/jobs/avisos', { preHandler: exigir('cola', 'U') }, async (req, reply) => {
    actorDe(req);
    return reply.send(await deps.correrAvisos());
  });
}
