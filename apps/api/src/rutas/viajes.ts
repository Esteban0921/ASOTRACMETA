import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ErrorDominio,
  type Actor,
  type GeneradorIds,
  type Reloj,
  type UnidadDeTrabajo,
} from '@asotracmet/domain';
import {
  ActualizarViajeSchema,
  AnularViajeSchema,
  CrearViajeSchema,
  ESTADOS_TR_ACTIVOS,
  FiltroRecaudosSchema,
  FiltroViajesSchema,
  LiquidarViajeSchema,
  RegistrarPagoSchema,
  ResumenMesSchema,
  calcularRecaudo,
  enmascararDocumento,
  estadoRecaudoSegunPago,
  etiquetaAsociadoPlaca,
  veEnmascarado,
} from '@asotracmet/shared';
import { actorDe, exigir } from '../auth/plugin.js';
import type { Consultas } from '../consultas/tipos.js';
import type { RepositorioMaestros } from '../maestros/tipos.js';
import type {
  RecaudoVista,
  RepositorioViajes,
  ViajeRegistro,
  ViajeVista,
} from '../viajes/tipos.js';

export interface DepsViajes {
  viajes: RepositorioViajes;
  maestros: RepositorioMaestros;
  consultas: Consultas;
  uow: UnidadDeTrabajo;
  reloj: Reloj;
  ids: GeneradorIds;
}

const IdParam = z.object({ id: z.string().min(1) });

/** Proyección pública de un viaje: PII enmascarada para viewer y member (`R*`). */
export function vistaViaje(v: ViajeVista, enmascarar: boolean) {
  return {
    ...v,
    asociadoDocumento: enmascarar ? enmascararDocumento(v.asociadoDocumento) : v.asociadoDocumento,
    etiqueta: v.asociadoNombre ? etiquetaAsociadoPlaca(v.asociadoNombre, v.placa) : v.placa,
  };
}

export function vistaRecaudo(r: RecaudoVista, enmascarar: boolean) {
  return {
    ...r,
    asociadoDocumento: enmascarar ? enmascararDocumento(r.asociadoDocumento) : r.asociadoDocumento,
  };
}

export interface ResumenMes {
  mes: string;
  porcentajeVigente: number;
  viajes: number;
  liquidados: number;
  flete: number;
  recaudo: number;
  pagado: number;
  pendiente: number;
  porCliente: Array<{ cliente: string; viajes: number; flete: number; recaudo: number }>;
  porPlaca: Array<{
    placa: string;
    asociado: string | null;
    viajes: number;
    flete: number;
    recaudo: number;
    pagado: number;
  }>;
}

/** "El 3 % del mes sale del sistema" (spec §19 Fase 2): totales por mes, cliente y placa. */
export function resumenDe(
  mes: string,
  porcentajeVigente: number,
  lista: readonly ViajeVista[],
): ResumenMes {
  const activos = lista.filter((v) => v.estado !== 'anulado');
  const liquidados = activos.filter((v) => v.estado === 'liquidado');
  const suma = (xs: readonly ViajeVista[], f: (v: ViajeVista) => number | null) =>
    xs.reduce((acc, v) => acc + (f(v) ?? 0), 0);
  const agrupar = <K extends string>(clave: (v: ViajeVista) => K | null) => {
    const grupos = new Map<K, ViajeVista[]>();
    for (const v of activos) {
      const k = clave(v);
      if (k === null) continue;
      grupos.set(k, [...(grupos.get(k) ?? []), v]);
    }
    return grupos;
  };
  const recaudo = suma(liquidados, (v) => v.valorRecaudo);
  const pagado = suma(liquidados, (v) => v.valorPagado);
  return {
    mes,
    porcentajeVigente,
    viajes: activos.length,
    liquidados: liquidados.length,
    flete: suma(activos, (v) => v.flete),
    recaudo,
    pagado,
    pendiente: recaudo - pagado,
    porCliente: [...agrupar((v) => v.cliente)]
      .map(([cliente, vs]) => ({
        cliente,
        viajes: vs.length,
        flete: suma(vs, (v) => v.flete),
        recaudo: suma(
          vs.filter((v) => v.estado === 'liquidado'),
          (v) => v.valorRecaudo,
        ),
      }))
      .sort((a, b) => b.recaudo - a.recaudo),
    porPlaca: [...agrupar((v) => v.placa)]
      .map(([placa, vs]) => ({
        placa,
        asociado: vs[0]?.asociadoNombre ?? null,
        viajes: vs.length,
        flete: suma(vs, (v) => v.flete),
        recaudo: suma(
          vs.filter((v) => v.estado === 'liquidado'),
          (v) => v.valorRecaudo,
        ),
        pagado: suma(
          vs.filter((v) => v.estado === 'liquidado'),
          (v) => v.valorPagado,
        ),
      }))
      .sort((a, b) => b.recaudo - a.recaudo),
  };
}

function estadoPorFechas(v: {
  fechaCargue?: string | null;
  fechaDescargue?: string | null;
}): ViajeRegistro['estado'] {
  if (v.fechaDescargue) return 'descargado';
  if (v.fechaCargue) return 'cargado';
  return 'borrador';
}

/** Viajes y recaudos (spec §6.5, §8.4, §9.2 Finance). La cola no se toca aquí; el TR sí cierra. */
export function rutasViajes(app: FastifyInstance, deps: DepsViajes): void {
  const { viajes, maestros, consultas, uow, reloj, ids } = deps;

  const ahora = () => reloj.ahora().toISOString();
  const enmascara = (actor: Actor) => veEnmascarado(actor.rol, 'viajes');
  const propias = (actor: Actor) =>
    actor.rol === 'member' ? (actor.vehiculoIds ?? []) : undefined;

  const auditar = (
    actor: Actor,
    accion: string,
    entidad: 'viajes' | 'recaudos' | 'trs',
    entidadId: string,
    before: unknown,
    after: unknown,
  ) =>
    uow.ejecutar(null, (tx) =>
      tx.auditar({
        actorId: actor.id,
        actorRol: actor.rol,
        accion,
        entidad,
        entidadId,
        before,
        after,
      }),
    );

  async function viajeOr404(id: string, actor: Actor): Promise<ViajeVista> {
    const v = await viajes.viaje(id);
    if (!v) throw new ErrorDominio('NOT_FOUND', 'Viaje no existe');
    const mias = propias(actor);
    if (mias && !mias.includes(v.vehiculoId)) {
      throw new ErrorDominio('FORBIDDEN_OWN_SCOPE', 'El viaje no pertenece a tus placas');
    }
    return v;
  }

  /** Tarifas vigentes para el cliente, destino y clase del viaje: el cruce tarifario (§9.2 Finance). */
  async function tarifasSugeridas(v: ViajeVista) {
    if (!v.clienteId || !v.destinoId) return [];
    const lista = await maestros.tarifas({
      clienteId: v.clienteId,
      destinoId: v.destinoId,
      clase: v.clase,
      vigentesEn: v.fechaCargue ?? v.fechaAsignacion,
    });
    return lista.map((t) => ({ id: t.id, modalidad: t.modalidad, valor: t.valor }));
  }

  async function detalle(id: string, actor: Actor) {
    const v = await viajeOr404(id, actor);
    return {
      ...vistaViaje(v, enmascara(actor)),
      tarifasSugeridas: await tarifasSugeridas(v),
      recaudo: (await viajes.recaudoDeViaje(v.id)) ?? null,
    };
  }

  async function guardarConVersion(v: ViajeRegistro): Promise<ViajeRegistro> {
    const nuevo = { ...v, version: v.version + 1, actualizadoEn: ahora() };
    await viajes.guardarViaje(nuevo);
    return nuevo;
  }

  // --- Lectura -------------------------------------------------------------------------------------
  app.get(
    '/api/v1/viajes',
    { preHandler: exigir('viajes', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const filtro = FiltroViajesSchema.parse(req.query);
      const actor = actorDe(req);
      const lista = await viajes.viajes({ ...filtro, vehiculoIds: propias(actor) });
      return reply.send(lista.map((v) => vistaViaje(v, enmascara(actor))));
    },
  );

  app.get('/api/v1/viajes/resumen', { preHandler: exigir('viajes', 'R') }, async (req, reply) => {
    const { mes } = ResumenMesSchema.parse(req.query);
    const { recaudo_porcentaje } = await consultas.parametros();
    return reply.send(resumenDe(mes, recaudo_porcentaje, await viajes.viajes({ mes })));
  });

  app.get(
    '/api/v1/viajes/:id',
    { preHandler: exigir('viajes', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      return reply.send(await detalle(id, actorDe(req)));
    },
  );

  app.get(
    '/api/v1/recaudos',
    { preHandler: exigir('recaudos', 'R', { permitirOwn: true }) },
    async (req, reply) => {
      const filtro = FiltroRecaudosSchema.parse(req.query);
      const actor = actorDe(req);
      const lista = await viajes.recaudos({ ...filtro, vehiculoIds: propias(actor) });
      return reply.send(lista.map((r) => vistaRecaudo(r, veEnmascarado(actor.rol, 'recaudos'))));
    },
  );

  // --- Alta desde el TR -----------------------------------------------------------------------------
  app.post('/api/v1/viajes', { preHandler: exigir('viajes', 'C') }, async (req, reply) => {
    const entrada = CrearViajeSchema.parse(req.body);
    const actor = actorDe(req);
    const tr = await consultas.trPorId(entrada.trId);
    if (!tr) throw new ErrorDominio('NOT_FOUND', 'TR no existe');
    if (tr.estado === 'cancelado' || tr.estado === 'no_tramitar') {
      throw new ErrorDominio('TR_NO_VIAJABLE', `El TR ${tr.codigo} está ${tr.estado}`);
    }
    if (await viajes.viajePorTr(tr.id)) {
      throw new ErrorDominio('VIAJE_YA_EXISTE', `El TR ${tr.codigo} ya tiene viaje`);
    }
    if (entrada.transportadoraId) {
      const hay = (await maestros.transportadoras()).some((t) => t.id === entrada.transportadoraId);
      if (!hay) throw new ErrorDominio('NOT_FOUND', 'Transportadora no existe');
    }
    if (entrada.conductorId && !(await maestros.conductor(entrada.conductorId))) {
      throw new ErrorDominio('NOT_FOUND', 'Conductor no existe');
    }
    const vehiculo = await maestros.vehiculo(tr.vehiculoId);
    const vigentes = tr.destinoId
      ? await maestros.tarifas({
          clienteId: tr.clienteId,
          destinoId: tr.destinoId,
          clase: vehiculo?.clase,
          vigentesEn: entrada.fechaCargue ?? tr.fechaAsignacion,
        })
      : [];
    const nuevo: ViajeRegistro = {
      id: ids.nuevo(),
      trId: tr.id,
      vehiculoId: tr.vehiculoId,
      conductorId: entrada.conductorId ?? null,
      fechaCargue: entrada.fechaCargue ?? null,
      fechaDescargue: entrada.fechaDescargue ?? null,
      lugarDescargue: entrada.lugarDescargue ?? null,
      transportadoraId: entrada.transportadoraId ?? null,
      tarifaId: vigentes.length === 1 ? (vigentes[0]?.id ?? null) : null,
      flete: entrada.flete ?? null,
      porcentajeAplicado: null,
      valorRecaudo: null,
      valorPagado: 0,
      estado: estadoPorFechas(entrada),
      notas: entrada.notas ?? null,
      version: 1,
      creadoEn: ahora(),
      actualizadoEn: ahora(),
    };
    await viajes.guardarViaje(nuevo);
    await auditar(actor, 'viaje.crear', 'viajes', nuevo.id, null, nuevo);
    return reply.status(201).send(await detalle(nuevo.id, actor));
  });

  app.patch('/api/v1/viajes/:id', { preHandler: exigir('viajes', 'U') }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const cambios = ActualizarViajeSchema.parse(req.body);
    const actor = actorDe(req);
    const actual = await viajeOr404(id, actor);
    if (actual.estado === 'anulado')
      throw new ErrorDominio('VIAJE_ANULADO', 'El viaje está anulado');
    if (
      actual.estado === 'liquidado' &&
      cambios.flete !== undefined &&
      cambios.flete !== actual.flete
    ) {
      throw new ErrorDominio('VIAJE_LIQUIDADO', 'El flete no cambia después de liquidar');
    }
    if (cambios.transportadoraId) {
      const hay = (await maestros.transportadoras()).some((t) => t.id === cambios.transportadoraId);
      if (!hay) throw new ErrorDominio('NOT_FOUND', 'Transportadora no existe');
    }
    if (cambios.conductorId && !(await maestros.conductor(cambios.conductorId))) {
      throw new ErrorDominio('NOT_FOUND', 'Conductor no existe');
    }
    const registro: ViajeRegistro = {
      id: actual.id,
      trId: actual.trId,
      vehiculoId: actual.vehiculoId,
      conductorId: cambios.conductorId === undefined ? actual.conductorId : cambios.conductorId,
      fechaCargue: cambios.fechaCargue === undefined ? actual.fechaCargue : cambios.fechaCargue,
      fechaDescargue:
        cambios.fechaDescargue === undefined ? actual.fechaDescargue : cambios.fechaDescargue,
      lugarDescargue:
        cambios.lugarDescargue === undefined ? actual.lugarDescargue : cambios.lugarDescargue,
      transportadoraId:
        cambios.transportadoraId === undefined ? actual.transportadoraId : cambios.transportadoraId,
      tarifaId: actual.tarifaId,
      flete: cambios.flete === undefined ? actual.flete : cambios.flete,
      porcentajeAplicado: actual.porcentajeAplicado,
      valorRecaudo: actual.valorRecaudo,
      valorPagado: actual.valorPagado,
      estado: actual.estado,
      notas: cambios.notas === undefined ? actual.notas : cambios.notas,
      version: actual.version,
      creadoEn: actual.creadoEn,
      actualizadoEn: actual.actualizadoEn,
    };
    if (
      registro.fechaCargue &&
      registro.fechaDescargue &&
      registro.fechaDescargue < registro.fechaCargue
    ) {
      throw new ErrorDominio('VALIDATION_ERROR', 'El descargue no puede ser anterior al cargue');
    }
    if (registro.estado !== 'liquidado') registro.estado = estadoPorFechas(registro);
    const guardado = await guardarConVersion(registro);
    await auditar(actor, 'viaje.actualizar', 'viajes', id, actual, guardado);
    return reply.send(await detalle(id, actor));
  });

  // --- Liquidar: nace el recaudo con el porcentaje vigente como snapshot (§20.7) --------------------
  app.post(
    '/api/v1/viajes/:id/liquidar',
    { preHandler: exigir('recaudos', 'C') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const { flete: fleteEntrada } = LiquidarViajeSchema.parse(req.body ?? {});
      const actor = actorDe(req);
      const actual = await viajeOr404(id, actor);
      if (actual.estado === 'anulado')
        throw new ErrorDominio('VIAJE_ANULADO', 'El viaje está anulado');
      if (actual.estado === 'liquidado') {
        throw new ErrorDominio('VIAJE_LIQUIDADO', 'El viaje ya está liquidado');
      }
      const flete = fleteEntrada ?? actual.flete;
      if (flete === null || flete <= 0) {
        throw new ErrorDominio('VIAJE_NO_LIQUIDABLE', 'El viaje no tiene flete acordado');
      }
      if (!actual.asociadoId) {
        throw new ErrorDominio(
          'VIAJE_NO_LIQUIDABLE',
          'La placa no tiene asociado a quien recaudar',
        );
      }
      const { recaudo_porcentaje } = await consultas.parametros();
      const valorRecaudo = calcularRecaudo(flete, recaudo_porcentaje);
      const liquidado = await guardarConVersion({
        ...actual,
        flete,
        porcentajeAplicado: recaudo_porcentaje,
        valorRecaudo,
        estado: 'liquidado',
      });
      const recaudo = {
        id: ids.nuevo(),
        viajeId: actual.id,
        asociadoId: actual.asociadoId,
        valor: valorRecaudo,
        estado: 'pendiente' as const,
        fechaPago: null,
        referencia: null,
        creadoEn: ahora(),
      };
      await viajes.guardarRecaudo(recaudo);
      // El servicio se prestó: el TR pasa a cumplido y la placa deja de tener TR activo (§6.5).
      const trCerrado = await uow.ejecutar(null, async (tx) => {
        const tr = await tx.tr(actual.trId);
        if (!tr || !ESTADOS_TR_ACTIVOS.includes(tr.estado)) return null;
        const cumplido = { ...tr, estado: 'cumplido' as const, version: tr.version + 1 };
        await tx.guardarTr(cumplido);
        await tx.auditar({
          actorId: actor.id,
          actorRol: actor.rol,
          accion: 'tr.cumplir',
          entidad: 'trs',
          entidadId: tr.id,
          before: tr,
          after: cumplido,
        });
        return cumplido;
      });
      await auditar(actor, 'viaje.liquidar', 'viajes', id, actual, {
        ...liquidado,
        recaudoId: recaudo.id,
        trCerrado: trCerrado?.codigo ?? null,
      });
      await auditar(actor, 'recaudo.crear', 'recaudos', recaudo.id, null, recaudo);
      return reply.send(await detalle(id, actor));
    },
  );

  app.post(
    '/api/v1/viajes/:id/anular',
    { preHandler: exigir('viajes', 'D') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const { motivo } = AnularViajeSchema.parse(req.body);
      const actor = actorDe(req);
      const actual = await viajeOr404(id, actor);
      if (actual.estado === 'anulado')
        throw new ErrorDominio('VIAJE_ANULADO', 'El viaje ya está anulado');
      if (actual.valorPagado > 0) {
        throw new ErrorDominio('VIAJE_LIQUIDADO', 'Un viaje con pagos registrados no se anula');
      }
      const recaudo = await viajes.recaudoDeViaje(actual.id);
      if (recaudo && recaudo.estado !== 'castigado') {
        const castigado = { ...recaudo, estado: 'castigado' as const, referencia: motivo };
        await viajes.guardarRecaudo(castigado);
        await auditar(actor, 'recaudo.castigar', 'recaudos', recaudo.id, recaudo, castigado);
      }
      const anulado = await guardarConVersion({
        ...actual,
        estado: 'anulado',
        notas: [actual.notas, `Anulado: ${motivo}`].filter(Boolean).join(' · '),
      });
      await auditar(actor, 'viaje.anular', 'viajes', id, actual, anulado);
      return reply.send(await detalle(id, actor));
    },
  );

  // --- Pagos del recaudo (estado de cobro, §9.2 Finance) -------------------------------------------
  app.post(
    '/api/v1/recaudos/:id/pagos',
    { preHandler: exigir('recaudos', 'U') },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const pago = RegistrarPagoSchema.parse(req.body);
      const actor = actorDe(req);
      const recaudo = await viajes.recaudo(id);
      if (!recaudo) throw new ErrorDominio('NOT_FOUND', 'Recaudo no existe');
      if (recaudo.estado !== 'pendiente' && recaudo.estado !== 'parcial') {
        throw new ErrorDominio('RECAUDO_CERRADO', `El recaudo está ${recaudo.estado}`);
      }
      const viaje = await viajes.viaje(recaudo.viajeId);
      if (!viaje) throw new ErrorDominio('NOT_FOUND', 'Viaje no existe');
      const pagado = viaje.valorPagado + pago.valor;
      if (pagado > recaudo.valor + 1) {
        throw new ErrorDominio('PAGO_INVALIDO', 'El pago supera el valor pendiente del recaudo');
      }
      await guardarConVersion({ ...viaje, valorPagado: pagado });
      const actualizado = {
        ...recaudo,
        estado: estadoRecaudoSegunPago(recaudo.valor, pagado),
        fechaPago: pago.fechaPago,
        referencia: pago.referencia ?? recaudo.referencia,
      };
      await viajes.guardarRecaudo(actualizado);
      await auditar(actor, 'recaudo.pago', 'recaudos', id, recaudo, { ...actualizado, pago });
      const vista = await viajes.recaudo(id);
      return reply.send(vista ? vistaRecaudo(vista, false) : null);
    },
  );
}
