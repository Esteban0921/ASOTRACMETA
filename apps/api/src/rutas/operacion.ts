import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ErrorDominio,
  type AlmacenMemoria,
  type GeneradorIds,
  type MotorCola,
  type Reloj,
  type Requerimiento,
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
} from '@asotracmet/shared';
import { actorDe, exigir } from '../auth/plugin.js';
import { vistaOferta, vistaPosicion, vistaRequerimiento, vistaTr } from '../vistas.js';

export interface DepsOperacion {
  almacen: AlmacenMemoria;
  motor: MotorCola;
  reloj: Reloj;
  ids: GeneradorIds;
}

const IdParam = z.object({ id: z.string().min(1) });

/** Rutas de operación (spec §8.4 y §8.5). El motor decide; la API solo orquesta. */
export function rutasOperacion(app: FastifyInstance, deps: DepsOperacion): void {
  const { almacen, motor } = deps;
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

  // --- Requerimientos --------------------------------------------------------
  app.get(
    '/api/v1/requerimientos',
    { preHandler: exigir('requerimientos', 'R') },
    async (req, reply) => {
      const filtro = FiltroRequerimientosSchema.parse(req.query);
      const lista = almacen.estado.requerimientos
        .filter((r) => !filtro.estado || r.estado === filtro.estado)
        .filter((r) => !filtro.fecha || r.fechaServicio === filtro.fecha)
        .sort((a, b) => a.fechaServicio.localeCompare(b.fechaServicio))
        .map((r) => vistaRequerimiento(almacen.estado, r));
      return reply.send(lista);
    },
  );

  app.post(
    '/api/v1/requerimientos',
    { preHandler: exigir('requerimientos', 'C') },
    async (req, reply) => {
      const entrada = CrearRequerimientoSchema.parse(req.body);
      const actor = actorDe(req);
      const requerimiento = await almacen.ejecutar(null, async (tx) => {
        if (!(await tx.cliente(entrada.clienteId)))
          throw new ErrorDominio('NOT_FOUND', 'Cliente no existe');
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
      return reply.status(201).send(vistaRequerimiento(almacen.estado, requerimiento));
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
      const oferta = await motor.ofrecer({ requerimientoId: id, actor });
      const body = vistaOferta(almacen.estado, oferta);
      if (claveIdem) idempotencia.set(claveIdem, { status: 201, body });
      return reply.status(201).send(body);
    },
  );

  app.get('/api/v1/ofertas', { preHandler: exigir('ofertas', 'R') }, async (req, reply) => {
    const filtro = FiltroOfertasSchema.parse(req.query);
    const lista = almacen.estado.ofertas
      .filter((o) => !filtro.estado || o.estado === filtro.estado)
      .filter((o) => !filtro.requerimientoId || o.requerimientoId === filtro.requerimientoId)
      .sort((a, b) => b.ofrecidaEn.localeCompare(a.ofrecidaEn))
      .map((o) => vistaOferta(almacen.estado, o));
    return reply.send(lista);
  });

  app.post(
    '/api/v1/ofertas/:id/aceptar',
    { preHandler: exigir('ofertas', 'A', { permitirOwn: true }) },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const { oferta, tr } = await motor.aceptar({ ofertaId: id, actor: actorDe(req) });
      return reply.send({
        oferta: vistaOferta(almacen.estado, oferta),
        tr: vistaTr(almacen.estado, tr),
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
      return reply.send({
        oferta: vistaOferta(almacen.estado, oferta),
        siguiente: siguiente ? vistaOferta(almacen.estado, siguiente) : null,
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
      return reply.send(vistaOferta(almacen.estado, oferta));
    },
  );

  // --- TR ----------------------------------------------------------------------
  app.get(
    '/api/v1/trs',
    { preHandler: exigir('trs', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const filtro = FiltroTrsSchema.parse(req.query);
      const actor = actorDe(req);
      const propias = actor.rol === 'member' ? new Set(actor.vehiculoIds ?? []) : null;
      const lista = almacen.estado.trs
        .filter((t) => !propias || propias.has(t.vehiculoId))
        .filter((t) => !filtro.estado || t.estado === filtro.estado)
        .filter((t) => !filtro.desde || t.fechaAsignacion >= filtro.desde)
        .filter((t) => !filtro.hasta || t.fechaAsignacion <= filtro.hasta)
        .map((t) => vistaTr(almacen.estado, t))
        .filter((t) => !filtro.placa || t.placa === filtro.placa)
        .sort((a, b) => b.codigo.localeCompare(a.codigo));
      return reply.send(lista);
    },
  );

  app.get(
    '/api/v1/trs/:id',
    { preHandler: exigir('trs', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const actor = actorDe(req);
      const tr = almacen.estado.trs.find((t) => t.id === id);
      if (!tr) throw new ErrorDominio('NOT_FOUND', 'TR no existe');
      if (actor.rol === 'member' && !(actor.vehiculoIds ?? []).includes(tr.vehiculoId)) {
        throw new ErrorDominio('FORBIDDEN_OWN_SCOPE', 'El TR no pertenece a tus placas');
      }
      return reply.send(vistaTr(almacen.estado, tr));
    },
  );

  app.post('/api/v1/trs/:id/cancelar', { preHandler: exigir('trs', 'A') }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const { motivo } = MotivoSchema.parse(req.body);
    const { tr, siguiente } = await motor.cancelarTr({ trId: id, motivo, actor: actorDe(req) });
    return reply.send({
      tr: vistaTr(almacen.estado, tr),
      siguiente: siguiente ? vistaOferta(almacen.estado, siguiente) : null,
    });
  });

  app.post(
    '/api/v1/trs/:id/no-tramitar',
    { preHandler: exigir('trs', 'A') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const { motivo } = MotivoSchema.parse(req.body);
      const tr = await motor.noTramitar({ trId: id, motivo, actor: actorDe(req) });
      return reply.send(vistaTr(almacen.estado, tr));
    },
  );

  // --- Vista del asociado (§8.5 /me/*) -------------------------------------------
  app.get(
    '/api/v1/me/cola',
    { preHandler: exigir('cola', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const actor = actorDe(req);
      const propias = new Set(actor.vehiculoIds ?? []);
      const resultado: Array<{
        placa: string;
        claseCola: string;
        posicion: number;
        total: number;
      }> = [];
      for (const vehiculo of almacen.estado.vehiculos.filter((v) => propias.has(v.id))) {
        const posiciones = almacen.estado.posiciones.filter(
          (p) => p.claseCola === vehiculo.claseCola,
        );
        const mia = posiciones.find((p) => p.vehiculoId === vehiculo.id);
        if (mia) {
          resultado.push({
            placa: vehiculo.placa,
            claseCola: vehiculo.claseCola,
            posicion: mia.posicion,
            total: posiciones.length,
          });
        }
      }
      return reply.send(resultado);
    },
  );

  app.get(
    '/api/v1/me/ofertas',
    { preHandler: exigir('ofertas', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const actor = actorDe(req);
      const propias = new Set(actor.vehiculoIds ?? []);
      const lista = almacen.estado.ofertas
        .filter((o) => propias.has(o.vehiculoId))
        .sort((a, b) => b.ofrecidaEn.localeCompare(a.ofrecidaEn))
        .map((o) => vistaOferta(almacen.estado, o));
      return reply.send(lista);
    },
  );

  app.get(
    '/api/v1/me/trs',
    { preHandler: exigir('trs', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const actor = actorDe(req);
      const propias = new Set(actor.vehiculoIds ?? []);
      const lista = almacen.estado.trs
        .filter((t) => propias.has(t.vehiculoId))
        .sort((a, b) => b.codigo.localeCompare(a.codigo))
        .map((t) => vistaTr(almacen.estado, t));
      return reply.send(lista);
    },
  );

  // --- Jobs (§14) disparables a mano por superadmin; en producción corre el scheduler ---
  app.post(
    '/api/v1/jobs/expirar-ofertas',
    { preHandler: exigir('cola', 'U') },
    async (req, reply) => {
      const expiradas = await motor.expirarOfertas(actorDe(req));
      return reply.send({ expiradas: expiradas.length });
    },
  );
}
