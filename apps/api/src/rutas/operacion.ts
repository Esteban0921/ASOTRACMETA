import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ErrorDominio,
  type GeneradorIds,
  type MotorCola,
  type Reloj,
  type Requerimiento,
  type UnidadDeTrabajo,
} from '@asotracmet/domain';
import {
  ClaseColaParamSchema,
  CrearRequerimientoSchema,
  DeclinarOfertaSchema,
  FiltroColaSchema,
  FiltroOfertasSchema,
  FiltroRequerimientosSchema,
  FiltroTrsSchema,
  MotivoSchema,
  OverrideColaSchema,
  ResetColaSchema,
} from '@asotracmet/shared';
import { actorDe, exigir, exigirReauth, sesionDe } from '../auth/plugin.js';
import type { Consultas } from '../consultas/tipos.js';
import { vistaPosicion } from '../vistas.js';

export interface DepsOperacion {
  uow: UnidadDeTrabajo;
  consultas: Consultas;
  motor: MotorCola;
  reloj: Reloj;
  ids: GeneradorIds;
  /** Observabilidad (spec §15): latencia de `ofrecer` y conteo de declinaciones. */
  metricas?: { ofrecer(latenciaMs: number, ok: boolean): void; declinacion(): void };
}

const IdParam = z.object({ id: z.string().min(1) });
const ACCIONES_INTERVENCION = ['cola.override', 'cola.reset'] as const;

/** Rutas de operación (spec §8.4 y §8.5). El motor decide; la API solo orquesta. */
export function rutasOperacion(app: FastifyInstance, deps: DepsOperacion): void {
  const { uow, consultas, motor } = deps;
  const idempotencia = new Map<string, { status: number; body: unknown }>();

  // --- Colas -----------------------------------------------------------------
  app.get('/api/v1/colas/:clase', { preHandler: exigir('cola', 'R') }, async (req, reply) => {
    const { clase } = ClaseColaParamSchema.parse(req.params);
    const { clienteId } = FiltroColaSchema.parse(req.query);
    const actor = actorDe(req);
    const posiciones = await motor.snapshotCola(clase, clienteId);
    const cabezaElegible = posiciones.find((p) => p.elegibilidad.elegible)?.vehiculoId ?? null;
    return reply.send({
      claseCola: clase,
      clienteId: clienteId ?? null,
      total: posiciones.length,
      cabezaElegible,
      posiciones: posiciones.map((p) => vistaPosicion(actor, p)),
    });
  });

  // Intervenciones sobre la cola (§21): visibles para todo el que puede leer la cola, veedor incluido.
  app.get(
    '/api/v1/colas/:clase/intervenciones',
    { preHandler: exigir('cola', 'R') },
    async (req, reply) => {
      const { clase } = ClaseColaParamSchema.parse(req.params);
      return reply.send(
        await consultas.audit({
          entidad: 'cola',
          entidadId: clase,
          acciones: ACCIONES_INTERVENCION,
          limite: 50,
          entidadesPermitidas: null,
        }),
      );
    },
  );

  // `cola.override` (§7.1.5): solo superadmin, con motivo y re-autenticación reciente.
  app.post(
    '/api/v1/colas/:clase/override',
    { preHandler: [exigir('cola', 'U'), exigirReauth(deps.reloj)] },
    async (req, reply) => {
      const { clase } = ClaseColaParamSchema.parse(req.params);
      const entrada = OverrideColaSchema.parse(req.body);
      const actor = actorDe(req);
      await motor.override({ claseCola: clase, ...entrada, actor });
      const posiciones = await motor.snapshotCola(clase);
      return reply.send({
        claseCola: clase,
        total: posiciones.length,
        posiciones: posiciones.map((p) => vistaPosicion(actor, p)),
      });
    },
  );

  // Reset de cola por clase (§9.2): confirmación literal + re-autenticación; con el segundo
  // factor si `reset_cola_requiere_2fa` (§10).
  app.post(
    '/api/v1/colas/:clase/reset',
    { preHandler: [exigir('cola', 'U'), exigirReauth(deps.reloj)] },
    async (req, reply) => {
      const { clase } = ClaseColaParamSchema.parse(req.params);
      const entrada = ResetColaSchema.parse(req.body);
      const actor = actorDe(req);
      const { sesion } = sesionDe(req);
      const parametros = await consultas.parametros();
      if (parametros.reset_cola_requiere_2fa && sesion.reauthFactor !== 'totp') {
        throw new ErrorDominio(
          'REAUTH_REQUERIDA',
          'El reset de cola exige confirmar con el segundo factor',
        );
      }
      await motor.resetCola({
        claseCola: clase,
        orden: entrada.orden,
        motivo: entrada.motivo,
        actor,
      });
      const posiciones = await motor.snapshotCola(clase);
      return reply.send({
        claseCola: clase,
        total: posiciones.length,
        posiciones: posiciones.map((p) => vistaPosicion(actor, p)),
      });
    },
  );

  // --- Requerimientos --------------------------------------------------------
  app.get(
    '/api/v1/requerimientos',
    { preHandler: exigir('requerimientos', 'R') },
    async (req, reply) => {
      const filtro = FiltroRequerimientosSchema.parse(req.query);
      return reply.send(await consultas.requerimientos(filtro));
    },
  );

  app.post(
    '/api/v1/requerimientos',
    { preHandler: exigir('requerimientos', 'C') },
    async (req, reply) => {
      const entrada = CrearRequerimientoSchema.parse(req.body);
      const actor = actorDe(req);
      const requerimiento = await uow.ejecutar(null, async (tx) => {
        if (!(await tx.cliente(entrada.clienteId))) {
          throw new ErrorDominio('NOT_FOUND', 'Cliente no existe');
        }
        const nuevo: Requerimiento = {
          id: deps.ids.nuevo(),
          clienteId: entrada.clienteId,
          destinoId: entrada.destinoId ?? null,
          claseCola: entrada.claseCola,
          fechaServicio: entrada.fechaServicio,
          cantidadCupos: entrada.cantidadCupos,
          observaciones: entrada.observaciones ?? null,
          estado: 'abierto',
          creadoPor: actor.id,
          creadoEn: deps.reloj.ahora().toISOString(),
        };
        await tx.guardarRequerimiento(nuevo);
        await tx.auditar({
          actorId: actor.id,
          actorRol: actor.rol,
          accion: 'requerimiento.crear',
          entidad: 'requerimientos',
          entidadId: nuevo.id,
          before: null,
          after: nuevo,
        });
        return nuevo;
      });
      return reply.status(201).send(await consultas.requerimientoPorId(requerimiento.id));
    },
  );

  // --- Ofertas (motor) -------------------------------------------------------
  app.post(
    '/api/v1/requerimientos/:id/ofertas',
    { preHandler: exigir('ofertas', 'C') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const actor = actorDe(req);
      const clave = req.headers['idempotency-key'];
      const claveIdem = typeof clave === 'string' && clave ? `${actor.id}:${id}:${clave}` : null;
      if (claveIdem) {
        const previa = idempotencia.get(claveIdem);
        if (previa) return reply.status(previa.status).send(previa.body);
      }
      const inicio = Date.now();
      let oferta;
      try {
        oferta = await motor.ofrecer({ requerimientoId: id, actor });
      } catch (error) {
        deps.metricas?.ofrecer(Date.now() - inicio, false);
        throw error;
      }
      deps.metricas?.ofrecer(Date.now() - inicio, true);
      const body = await consultas.ofertaPorId(oferta.id);
      if (claveIdem) idempotencia.set(claveIdem, { status: 201, body });
      return reply.status(201).send(body);
    },
  );

  app.get('/api/v1/ofertas', { preHandler: exigir('ofertas', 'R') }, async (req, reply) => {
    const filtro = FiltroOfertasSchema.parse(req.query);
    return reply.send(await consultas.ofertas(filtro));
  });

  app.post(
    '/api/v1/ofertas/:id/aceptar',
    { preHandler: exigir('ofertas', 'A', { permitirOwn: true }) },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const { oferta, tr } = await motor.aceptar({ ofertaId: id, actor: actorDe(req) });
      return reply.send({
        oferta: await consultas.ofertaPorId(oferta.id),
        tr: await consultas.trPorId(tr.id),
      });
    },
  );

  app.post(
    '/api/v1/ofertas/:id/declinar',
    { preHandler: exigir('ofertas', 'A', { permitirOwn: true }) },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const entrada = DeclinarOfertaSchema.parse(req.body);
      const { oferta, siguiente } = await motor.declinar({
        ofertaId: id,
        ...entrada,
        actor: actorDe(req),
      });
      deps.metricas?.declinacion();
      return reply.send({
        oferta: await consultas.ofertaPorId(oferta.id),
        siguiente: siguiente ? ((await consultas.ofertaPorId(siguiente.id)) ?? null) : null,
      });
    },
  );

  app.post(
    '/api/v1/ofertas/:id/anular',
    { preHandler: exigir('ofertas', 'A') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const { motivo } = MotivoSchema.parse(req.body);
      const oferta = await motor.anular({ ofertaId: id, motivo, actor: actorDe(req) });
      return reply.send(await consultas.ofertaPorId(oferta.id));
    },
  );

  // --- TR --------------------------------------------------------------------
  app.get(
    '/api/v1/trs',
    { preHandler: exigir('trs', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const filtro = FiltroTrsSchema.parse(req.query);
      const actor = actorDe(req);
      return reply.send(
        await consultas.trs({
          ...filtro,
          vehiculoIds: actor.rol === 'member' ? (actor.vehiculoIds ?? []) : undefined,
        }),
      );
    },
  );

  app.get(
    '/api/v1/trs/:id',
    { preHandler: exigir('trs', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const actor = actorDe(req);
      const tr = await consultas.trPorId(id);
      if (!tr) throw new ErrorDominio('NOT_FOUND', 'TR no existe');
      if (actor.rol === 'member' && !(actor.vehiculoIds ?? []).includes(tr.vehiculoId)) {
        throw new ErrorDominio('FORBIDDEN_OWN_SCOPE', 'El TR no pertenece a tus placas');
      }
      return reply.send(tr);
    },
  );

  app.post('/api/v1/trs/:id/cancelar', { preHandler: exigir('trs', 'A') }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const { motivo } = MotivoSchema.parse(req.body);
    const { tr, siguiente } = await motor.cancelarTr({ trId: id, motivo, actor: actorDe(req) });
    return reply.send({
      tr: await consultas.trPorId(tr.id),
      siguiente: siguiente ? ((await consultas.ofertaPorId(siguiente.id)) ?? null) : null,
    });
  });

  app.post(
    '/api/v1/trs/:id/no-tramitar',
    { preHandler: exigir('trs', 'A') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const { motivo } = MotivoSchema.parse(req.body);
      const tr = await motor.noTramitar({ trId: id, motivo, actor: actorDe(req) });
      return reply.send(await consultas.trPorId(tr.id));
    },
  );

  // --- Vista del asociado (§8.5 /me/*) ---------------------------------------
  app.get(
    '/api/v1/me/cola',
    { preHandler: exigir('cola', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const actor = actorDe(req);
      return reply.send(await consultas.posicionesDeVehiculos(actor.vehiculoIds ?? []));
    },
  );

  app.get(
    '/api/v1/me/ofertas',
    { preHandler: exigir('ofertas', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const actor = actorDe(req);
      return reply.send(await consultas.ofertas({ vehiculoIds: actor.vehiculoIds ?? [] }));
    },
  );

  app.get(
    '/api/v1/me/trs',
    { preHandler: exigir('trs', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const actor = actorDe(req);
      return reply.send(await consultas.trs({ vehiculoIds: actor.vehiculoIds ?? [] }));
    },
  );

  // --- Jobs (§14): disparo manual por superadmin; en producción corre el scheduler ---
  app.post(
    '/api/v1/jobs/expirar-ofertas',
    { preHandler: exigir('cola', 'U') },
    async (req, reply) => {
      const expiradas = await motor.expirarOfertas(actorDe(req));
      return reply.send({ expiradas: expiradas.length });
    },
  );
}
