import { describe, expect, it } from 'vitest';
import { ErrorDominio } from './errores.js';
import { OPS, crearEscenario } from './escenario.test-util.js';
import { moverACabeza } from './invariantes.js';

async function codigoDe(promesa: Promise<unknown>): Promise<string | undefined> {
  try {
    await promesa;
    return undefined;
  } catch (error) {
    return error instanceof ErrorDominio ? error.code : `NO_DOMINIO:${String(error)}`;
  }
}

describe('MotorCola · siguienteElegible (spec §7.2, §16)', () => {
  it('con la cabeza no habilitada para el cliente, toma la posición 2', async () => {
    const e = crearEscenario();
    const oferta = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    expect(oferta.estado).toBe('abierta');
    expect(oferta.vehiculoId).toBe(e.vehiculoPorPlaca('FST189').id);
    // Ofrecer no avanza la cola.
    expect(e.placasEnOrden()).toEqual(['SPS413', 'FST189', 'SWI750', 'QOR007', 'SOF336', 'SUL470']);
  });

  it('dos placas del mismo asociado ocupan dos posiciones distintas', async () => {
    const e = crearEscenario();
    const posiciones = e.posiciones();
    const delAsociado02 = posiciones.filter((p) => ['v-FST189', 'v-SWI750'].includes(p.vehiculoId));
    expect(delAsociado02).toHaveLength(2);
    expect(new Set(delAsociado02.map((p) => p.posicion)).size).toBe(2);
  });

  it('salta placas con documento bloqueante vencido si el parámetro lo exige', async () => {
    const e = crearEscenario();
    e.estado.documentos.push({
      id: 'doc-1',
      sujetoTipo: 'vehiculo',
      sujetoId: 'v-FST189',
      tipoCodigo: 'SOAT',
      venceEn: '2026-09-01',
      bloqueante: true,
    });
    const oferta = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    expect(oferta.vehiculoId).toBe('v-SWI750');

    const sinBloqueo = crearEscenario({ parametros: { bloquear_por_documento_vencido: false } });
    sinBloqueo.estado.documentos.push({
      id: 'doc-1',
      sujetoTipo: 'vehiculo',
      sujetoId: 'v-FST189',
      tipoCodigo: 'SOAT',
      venceEn: '2026-09-01',
      bloqueante: true,
    });
    const oferta2 = await sinBloqueo.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    expect(oferta2.vehiculoId).toBe('v-FST189');
  });

  it('una placa con oferta abierta no recibe una segunda oferta', async () => {
    const e = crearEscenario();
    const primera = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    const segunda = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    expect(primera.vehiculoId).toBe('v-FST189');
    expect(segunda.vehiculoId).toBe('v-SWI750');
  });

  it('lanza COLA_VACIA cuando ninguna placa pasa los filtros', async () => {
    const e = crearEscenario();
    for (const v of e.estado.vehiculos) v.estado = 'inactivo';
    expect(await codigoDe(e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS }))).toBe(
      'COLA_VACIA',
    );
    // Sin efectos colaterales.
    expect(e.estado.ofertas).toHaveLength(0);
  });

  it('un vehículo con TR activo no vuelve a salir si un_tr_activo_por_placa', async () => {
    const e = crearEscenario({ cupos: 3, parametros: { consume_posicion_al_aceptar: false } });
    const oferta = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    await e.motor.aceptar({ ofertaId: oferta.id, actor: e.memberDe('FST189') });
    const siguiente = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    expect(siguiente.vehiculoId).toBe('v-SWI750');
  });
});

describe('MotorCola · aceptar (spec §7.4)', () => {
  it('crea el TR con código secuencial, rota la placa al final y cierra el requerimiento al completar cupos', async () => {
    const e = crearEscenario({ cupos: 1 });
    const oferta = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    const { tr } = await e.motor.aceptar({ ofertaId: oferta.id, actor: e.memberDe('FST189') });

    expect(tr.codigo).toBe('TR-41947');
    expect(tr.estado).toBe('asignado');
    expect(tr.clienteId).toBe('c-hlb');
    expect(tr.fechaAsignacion).toBe('2026-09-16');
    expect(e.estado.parametros.secuencia_tr.next).toBe(41948);
    expect(e.placasEnOrden()).toEqual(['SPS413', 'SWI750', 'QOR007', 'SOF336', 'SUL470', 'FST189']);
    expect(e.posiciones().at(-1)?.turnosTomados).toBe(1);
    expect(e.estado.requerimientos[0]?.estado).toBe('cerrado');

    const acciones = e.estado.auditoria.map((a) => a.accion);
    expect(acciones).toEqual([
      'oferta.crear',
      'oferta.aceptar',
      'tr.crear',
      'cola.rotar',
      'requerimiento.cerrar',
    ]);
  });

  it('los códigos TR son únicos y generados: dos aceptaciones → TR-41947 y TR-41948', async () => {
    const e = crearEscenario({ cupos: 2 });
    const o1 = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    const r1 = await e.motor.aceptar({ ofertaId: o1.id, actor: OPS });
    const o2 = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    const r2 = await e.motor.aceptar({ ofertaId: o2.id, actor: OPS });
    expect([r1.tr.codigo, r2.tr.codigo]).toEqual(['TR-41947', 'TR-41948']);
  });

  it('si la secuencia está desfasada lanza TR_DUPLICADO y no deja nada a medias', async () => {
    const e = crearEscenario();
    e.estado.trs.push({
      id: 'tr-viejo',
      codigo: 'TR-41947',
      ofertaId: null,
      requerimientoId: 'req-0',
      vehiculoId: 'v-SUL470',
      claseCola: 'TM-CBZ',
      clienteId: 'c-hlb',
      destinoId: null,
      fechaAsignacion: '2026-09-01',
      estado: 'cumplido',
      canceladoEn: null,
      canceladoPor: null,
      motivoCancelacion: null,
      version: 1,
    });
    const oferta = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    expect(await codigoDe(e.motor.aceptar({ ofertaId: oferta.id, actor: OPS }))).toBe(
      'TR_DUPLICADO',
    );
    expect(e.estado.ofertas.find((o) => o.id === oferta.id)?.estado).toBe('abierta');
    expect(e.estado.trs).toHaveLength(1);
  });

  it('un member solo acepta ofertas de sus placas (FORBIDDEN_OWN_SCOPE)', async () => {
    const e = crearEscenario();
    const oferta = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    expect(
      await codigoDe(e.motor.aceptar({ ofertaId: oferta.id, actor: e.memberDe('QOR007') })),
    ).toBe('FORBIDDEN_OWN_SCOPE');
    await expect(
      e.motor.aceptar({ ofertaId: oferta.id, actor: e.memberDe('FST189') }),
    ).resolves.toBeDefined();
  });

  it('una oferta vencida no se puede aceptar: pasa a expirada', async () => {
    const e = crearEscenario();
    const oferta = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    e.reloj.avanzarMinutos(121);
    expect(await codigoDe(e.motor.aceptar({ ofertaId: oferta.id, actor: OPS }))).toBe(
      'OFERTA_EXPIRADA',
    );
    expect(e.estado.ofertas[0]?.estado).toBe('abierta'); // rollback: el job de expiración es quien la cierra
  });

  it('con consume_posicion_al_aceptar=false la cola no se mueve', async () => {
    const e = crearEscenario({ parametros: { consume_posicion_al_aceptar: false } });
    const oferta = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    await e.motor.aceptar({ ofertaId: oferta.id, actor: OPS });
    expect(e.placasEnOrden()).toEqual(['SPS413', 'FST189', 'SWI750', 'QOR007', 'SOF336', 'SUL470']);
  });
});

describe('MotorCola · declinar (spec §7.4, §16 integración)', () => {
  it('ofrecer + declinar + ofrecer siguiente ocurre en una sola transacción visible', async () => {
    const e = crearEscenario();
    const oferta = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    const auditAntes = e.estado.auditoria.length;

    const { oferta: declinada, siguiente } = await e.motor.declinar({
      ofertaId: oferta.id,
      motivoId: 'm-mantenimiento',
      nota: 'Cambio de llantas',
      actor: e.memberDe('FST189'),
    });

    expect(declinada.estado).toBe('declinada');
    expect(declinada.motivoDeclinacionId).toBe('m-mantenimiento');
    expect(declinada.respondidaPor).toBe('u-member-FST189');
    expect(siguiente?.vehiculoId).toBe('v-SWI750');
    expect(siguiente?.estado).toBe('abierta');
    // FST189 rota al final; posiciones densas.
    expect(e.placasEnOrden()).toEqual(['SPS413', 'SWI750', 'QOR007', 'SOF336', 'SUL470', 'FST189']);
    expect(e.posiciones().map((p) => p.posicion)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(e.posiciones().at(-1)?.ciclo).toBe(2);
    // Rastro completo: actor, timestamp y motivo.
    const nuevos = e.estado.auditoria.slice(auditAntes).map((a) => a.accion);
    expect(nuevos).toEqual(['oferta.declinar', 'cola.rotar.al_final', 'oferta.crear']);
    expect(e.estado.auditoria.slice(auditAntes).every((a) => a.at && a.actorId)).toBe(true);
  });

  it('declinar exige motivo de catálogo activo', async () => {
    const e = crearEscenario();
    const oferta = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    expect(
      await codigoDe(e.motor.declinar({ ofertaId: oferta.id, motivoId: 'm-inactivo', actor: OPS })),
    ).toBe('MOTIVO_REQUERIDO');
    expect(
      await codigoDe(e.motor.declinar({ ofertaId: oferta.id, motivoId: 'no-existe', actor: OPS })),
    ).toBe('MOTIVO_REQUERIDO');
    expect(e.estado.ofertas[0]?.estado).toBe('abierta');
  });

  it('política penaliza_n: la placa deja pasar n turnos y después vuelve a ser elegible', async () => {
    const e = crearEscenario({
      parametros: { declinacion_politica: 'penaliza_n', declinacion_n: 1 },
      cupos: 6,
    });
    const primera = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    const { siguiente } = await e.motor.declinar({
      ofertaId: primera.id,
      motivoId: 'm-personal',
      actor: OPS,
    });
    expect(e.posiciones().at(-1)?.saltosPendientes).toBe(1);
    if (siguiente) await e.motor.anular({ ofertaId: siguiente.id, motivo: 'test', actor: OPS });

    // Simulamos que la ronda dio la vuelta y FST189 vuelve a estar de primera.
    e.estado.posiciones = moverACabeza(e.posiciones(), 'v-FST189');
    const segunda = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    expect(segunda.vehiculoId).toBe('v-SWI750'); // FST189 dejó pasar un turno
    expect(e.posiciones().find((p) => p.vehiculoId === 'v-FST189')?.saltosPendientes).toBe(0);
    expect(e.estado.auditoria.some((a) => a.accion === 'cola.penalizacion_consumida')).toBe(true);

    await e.motor.anular({ ofertaId: segunda.id, motivo: 'test', actor: OPS });
    const tercera = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    expect(tercera.vehiculoId).toBe('v-FST189');
  });

  it('política penaliza_n: si nadie más puede tomar el turno, la penalizada lo recibe (la cola no se traba)', async () => {
    const e = crearEscenario({
      parametros: { declinacion_politica: 'penaliza_n', declinacion_n: 2 },
      cupos: 6,
    });
    const primera = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    const { siguiente } = await e.motor.declinar({
      ofertaId: primera.id,
      motivoId: 'm-personal',
      actor: OPS,
    });
    if (siguiente) await e.motor.anular({ ofertaId: siguiente.id, motivo: 'test', actor: OPS });
    for (const v of e.estado.vehiculos)
      if (!['SPS413', 'FST189'].includes(v.placa)) v.estado = 'inactivo';

    const oferta = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    expect(oferta.vehiculoId).toBe('v-FST189');
    expect(e.posiciones().find((p) => p.vehiculoId === 'v-FST189')?.saltosPendientes).toBe(1);
    expect(e.estado.auditoria.at(-2)?.accion).toBe('cola.penalizacion_agotada');
  });

  it('política bloqueo_horas: la placa queda no elegible hasta que pase el tiempo', async () => {
    const e = crearEscenario({
      parametros: { declinacion_politica: 'bloqueo_horas', declinacion_bloqueo_horas: 24 },
      cupos: 6,
    });
    const primera = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    await e.motor.declinar({ ofertaId: primera.id, motivoId: 'm-personal', actor: OPS });
    expect(e.vehiculoPorPlaca('FST189').noElegibleHasta).toBe('2026-09-17T13:00:00.000Z');
    const snapshot = await e.motor.snapshotCola('TM-CBZ', 'c-hlb');
    expect(snapshot.find((p) => p.vehiculo.placa === 'FST189')?.elegibilidad.motivo).toBe(
      'BLOQUEO_TEMPORAL',
    );
    e.reloj.avanzarMinutos(24 * 60 + 1);
    const despues = await e.motor.snapshotCola('TM-CBZ', 'c-hlb');
    expect(despues.find((p) => p.vehiculo.placa === 'FST189')?.elegibilidad.elegible).toBe(true);
  });
});

describe('MotorCola · anular y expirar', () => {
  it('anular no rota y deja motivo', async () => {
    const e = crearEscenario();
    const oferta = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    const anulada = await e.motor.anular({
      ofertaId: oferta.id,
      motivo: 'Cliente canceló el pedido',
      actor: OPS,
    });
    expect(anulada.estado).toBe('anulada');
    expect(anulada.nota).toBe('Cliente canceló el pedido');
    expect(e.placasEnOrden()[1]).toBe('FST189');
  });

  it('expirarOfertas con política declina: expira, rota y reoferta al siguiente', async () => {
    const e = crearEscenario();
    const oferta = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    e.reloj.avanzarMinutos(120);
    const expiradas = await e.motor.expirarOfertas();
    expect(expiradas.map((o) => o.id)).toEqual([oferta.id]);
    expect(e.estado.ofertas.find((o) => o.id === oferta.id)?.estado).toBe('expirada');
    expect(e.placasEnOrden().at(-1)).toBe('FST189');
    const nueva = e.estado.ofertas.find((o) => o.estado === 'abierta');
    expect(nueva?.vehiculoId).toBe('v-SWI750');
  });

  it('expirarOfertas con política reofertar: nueva oferta a la misma placa sin rotar', async () => {
    const e = crearEscenario({ parametros: { oferta_expirada_politica: 'reofertar' } });
    await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    e.reloj.avanzarMinutos(120);
    await e.motor.expirarOfertas();
    const nueva = e.estado.ofertas.find((o) => o.estado === 'abierta');
    expect(nueva?.vehiculoId).toBe('v-FST189');
    expect(e.placasEnOrden()[1]).toBe('FST189');
  });

  it('expirarOfertas no toca ofertas todavía vigentes', async () => {
    const e = crearEscenario();
    await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    e.reloj.avanzarMinutos(30);
    expect(await e.motor.expirarOfertas()).toEqual([]);
  });
});

describe('MotorCola · cancelar TR (spec §7.5, §20.5)', () => {
  it('cancelar no borra historia: TR queda cancelado con actor y motivo, se reabre el cupo y se ofrece al siguiente', async () => {
    const e = crearEscenario({ cupos: 1 });
    const oferta = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    const { tr } = await e.motor.aceptar({ ofertaId: oferta.id, actor: OPS });
    expect(e.estado.requerimientos[0]?.estado).toBe('cerrado');

    const { tr: cancelado, siguiente } = await e.motor.cancelarTr({
      trId: tr.id,
      motivo: 'HLB canceló el servicio',
      actor: OPS,
    });
    expect(cancelado.estado).toBe('cancelado');
    expect(cancelado.canceladoPor).toBe(OPS.id);
    expect(cancelado.motivoCancelacion).toBe('HLB canceló el servicio');
    expect(e.estado.trs).toHaveLength(1);
    expect(e.estado.requerimientos[0]?.estado).toBe('abierto');
    expect(siguiente?.vehiculoId).toBe('v-SWI750');
  });

  it('con tr_cancelado_regresa_al_mismo la placa vuelve a la cabeza', async () => {
    const e = crearEscenario({ parametros: { tr_cancelado_regresa_al_mismo: true } });
    const oferta = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    const { tr } = await e.motor.aceptar({ ofertaId: oferta.id, actor: OPS });
    expect(e.placasEnOrden().at(-1)).toBe('FST189');
    await e.motor.cancelarTr({ trId: tr.id, motivo: 'Error de asignación', actor: OPS });
    expect(e.placasEnOrden()).toEqual(['FST189', 'SPS413', 'SWI750', 'QOR007', 'SOF336', 'SUL470']);
    expect(e.posiciones().map((p) => p.posicion)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('un TR cancelado no se cancela dos veces y cancelar exige motivo', async () => {
    const e = crearEscenario();
    const oferta = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    const { tr } = await e.motor.aceptar({ ofertaId: oferta.id, actor: OPS });
    expect(await codigoDe(e.motor.cancelarTr({ trId: tr.id, motivo: '   ', actor: OPS }))).toBe(
      'MOTIVO_REQUERIDO',
    );
    await e.motor.cancelarTr({ trId: tr.id, motivo: 'ok', actor: OPS });
    expect(
      await codigoDe(e.motor.cancelarTr({ trId: tr.id, motivo: 'otra vez', actor: OPS })),
    ).toBe('TR_NO_CANCELABLE');
  });

  it('no-tramitar es un estado, no un texto en una celda', async () => {
    const e = crearEscenario();
    const oferta = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    const { tr } = await e.motor.aceptar({ ofertaId: oferta.id, actor: OPS });
    const actualizado = await e.motor.noTramitar({
      trId: tr.id,
      motivo: 'Cliente no tramitó',
      actor: OPS,
    });
    expect(actualizado.estado).toBe('no_tramitar');
    expect(e.estado.auditoria.at(-1)?.accion).toBe('tr.no_tramitar');
  });
});

describe('MotorCola · concurrencia (spec §7.7, §16)', () => {
  it('20 ofrecer en paralelo sobre la misma clase → 1 oferta y 19 COLA_LOCKED', async () => {
    const e = crearEscenario({ cupos: 20 });
    const resultados = await Promise.allSettled(
      Array.from({ length: 20 }, () => e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS })),
    );
    const ok = resultados.filter((r) => r.status === 'fulfilled');
    const bloqueados = resultados.filter(
      (r) =>
        r.status === 'rejected' &&
        r.reason instanceof ErrorDominio &&
        r.reason.code === 'COLA_LOCKED',
    );
    expect(ok).toHaveLength(1);
    expect(bloqueados).toHaveLength(19);
    expect(e.estado.ofertas).toHaveLength(1);
  });

  it('operaciones sobre clases distintas no se bloquean entre sí', async () => {
    const e = crearEscenario();
    e.estado.vehiculos.push({
      id: 'v-C100A',
      placa: 'AAA100',
      clase: 'C100',
      claseCola: 'C100',
      asociadoId: 'a-01',
      estado: 'activo',
      noElegibleHasta: null,
    });
    e.estado.habilitaciones.push({
      vehiculoId: 'v-C100A',
      clienteId: 'c-hlb',
      apto: true,
      motivoBloqueo: null,
    });
    e.estado.posiciones.push({
      id: 'p-C100A',
      claseCola: 'C100',
      vehiculoId: 'v-C100A',
      posicion: 1,
      ciclo: 1,
      turnosOfrecidos: 0,
      turnosTomados: 0,
      saltosPendientes: 0,
      version: 1,
    });
    e.estado.requerimientos.push({ ...e.requerimiento, id: 'req-c100', claseCola: 'C100' });
    const [a, b] = await Promise.all([
      e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS }),
      e.motor.ofrecer({ requerimientoId: 'req-c100', actor: OPS }),
    ]);
    expect(a.vehiculoId).toBe('v-FST189');
    expect(b.vehiculoId).toBe('v-C100A');
  });
});

describe('MotorCola · snapshotCola', () => {
  it('marca la cabeza no habilitada con motivo VEHICULO_NO_HABILITADO y resalta la primera elegible', async () => {
    const e = crearEscenario();
    const snapshot = await e.motor.snapshotCola('TM-CBZ', 'c-hlb');
    expect(snapshot.map((p) => p.vehiculo.placa)).toEqual([
      'SPS413',
      'FST189',
      'SWI750',
      'QOR007',
      'SOF336',
      'SUL470',
    ]);
    expect(snapshot[0]?.elegibilidad).toEqual({
      elegible: false,
      motivo: 'VEHICULO_NO_HABILITADO',
      detalle: 'SPS413 no apta para HLB (Curso HLB vencido)',
    });
    expect(snapshot[1]?.elegibilidad.elegible).toBe(true);
    expect(snapshot[1]?.asociado?.nombres).toBe('ASOCIADO 02');
  });
});
