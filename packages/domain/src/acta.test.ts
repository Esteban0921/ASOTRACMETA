import { describe, expect, it } from 'vitest';
import {
  MOTIVOS_NO_ELEGIBLE,
  evaluarCola,
  firmaCola,
  type ContextoElegibilidad,
} from './elegibilidad.js';
import { ErrorDominio } from './errores.js';
import { OPS, crearEscenario, type Escenario } from './escenario.test-util.js';
import { moverACabeza } from './invariantes.js';

// Acta de turno (brief "Llano Abierto" §5; spec §7.2, §7.3, §7.7, §21): antes de ofrecer la sala ve
// quién saldrá y a quién se salta; al ofrecer afirma lo que vio y el motor verifica; después, los
// saltos quedan persistidos en la misma transacción que la oferta.

const HEX_16 = /^[0-9a-f]{16}$/;

const SALTO_SPS413 = {
  posicion: 1,
  vehiculoId: 'v-SPS413',
  placa: 'SPS413',
  motivo: 'VEHICULO_NO_HABILITADO',
  detalle: 'SPS413 no apta para HLB (Curso HLB vencido)',
};

async function errorDe(promesa: Promise<unknown>): Promise<ErrorDominio> {
  try {
    await promesa;
  } catch (error) {
    if (error instanceof ErrorDominio) return error;
    throw error;
  }
  throw new Error('Se esperaba un ErrorDominio');
}

/** Contexto de elegibilidad de la cola TM-CBZ del escenario, construido a mano (sin motor). */
function filasDe(e: Escenario, clienteId = 'c-hlb'): ContextoElegibilidad[] {
  const cliente = e.estado.clientes.find((c) => c.id === clienteId) ?? null;
  return e.posiciones().map((posicion) => {
    const vehiculo = e.estado.vehiculos.find((v) => v.id === posicion.vehiculoId)!;
    return {
      posicion: { ...posicion },
      vehiculo: { ...vehiculo },
      cliente,
      habilitacion: e.estado.habilitaciones.find(
        (h) => h.vehiculoId === vehiculo.id && h.clienteId === clienteId,
      ),
      documentosVencidos: [],
      ofertasAbiertas: e.estado.ofertas.filter(
        (o) => o.vehiculoId === vehiculo.id && o.estado === 'abierta',
      ),
      trsActivos: [],
      parametros: e.estado.parametros,
      ahora: e.reloj.ahora(),
    };
  });
}

function fila(filas: ContextoElegibilidad[], placa: string): ContextoElegibilidad {
  return filas.find((f) => f.vehiculo.placa === placa)!;
}

function contadores(e: Escenario) {
  return {
    ofertas: e.estado.ofertas.length,
    saltos: e.estado.saltos.length,
    auditoria: e.estado.auditoria.length,
    outbox: e.estado.outbox.length,
  };
}

describe('evaluarCola (spec §7.2, brief §5): función pura del acta', () => {
  it('la primera elegible es la candidata y las anteriores son descartes con motivo y detalle', () => {
    const e = crearEscenario();
    const resultado = evaluarCola(filasDe(e));
    expect(resultado.candidato?.vehiculo.placa).toBe('FST189');
    expect(resultado.descartes).toEqual([SALTO_SPS413]);
    expect(resultado.penalizadas).toEqual([]);
    // El orden de entrada no importa: manda la posición.
    expect(evaluarCola([...filasDe(e)].reverse())).toEqual(resultado);
  });

  it('una penalizada por delante queda en descartes y en penalizadas; solo cuenta lo anterior a la elegida', () => {
    const e = crearEscenario();
    const filas = filasDe(e);
    fila(filas, 'FST189').posicion.saltosPendientes = 1;
    const { candidato, descartes, penalizadas } = evaluarCola(filas);
    expect(candidato?.vehiculo.placa).toBe('SWI750');
    expect(descartes.map((d) => [d.placa, d.motivo, d.detalle])).toEqual([
      ['SPS413', 'VEHICULO_NO_HABILITADO', 'SPS413 no apta para HLB (Curso HLB vencido)'],
      ['FST189', 'PENALIZACION_PENDIENTE', 'FST189 debe dejar pasar 1 turno(s)'],
    ]);
    expect(penalizadas.map((p) => p.vehiculo.placa)).toEqual(['FST189']);
  });

  it('si nadie es elegible, la primera penalizada recibe el turno y los descartes son las filas anteriores', () => {
    const e = crearEscenario();
    const filas = filasDe(e);
    for (const f of filas)
      if (!['SPS413', 'FST189'].includes(f.vehiculo.placa)) f.vehiculo.estado = 'inactivo';
    fila(filas, 'FST189').posicion.saltosPendientes = 2;
    const { candidato, descartes, penalizadas } = evaluarCola(filas);
    expect(candidato?.vehiculo.placa).toBe('FST189');
    expect(descartes).toEqual([SALTO_SPS413]);
    expect(penalizadas.map((p) => p.vehiculo.placa)).toEqual(['FST189']);
  });

  it('sin candidato, todas las filas son descartes', () => {
    const e = crearEscenario();
    const filas = filasDe(e);
    for (const f of filas) f.vehiculo.estado = 'inactivo';
    const { candidato, descartes, penalizadas } = evaluarCola(filas);
    expect(candidato).toBeNull();
    expect(descartes).toHaveLength(6);
    expect(descartes.map((d) => d.posicion)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(descartes.every((d) => d.motivo === 'VEHICULO_NO_ACTIVO')).toBe(true);
    expect(penalizadas).toEqual([]);
    expect(descartes.every((d) => MOTIVOS_NO_ELEGIBLE.includes(d.motivo))).toBe(true);
  });
});

describe('firmaCola (brief §5): huella de lo que decide una oferta', () => {
  it('es estable, de 16 hex, y cambia con el orden, una oferta abierta o un salto pendiente', () => {
    const e = crearEscenario();
    const base = firmaCola(filasDe(e));
    expect(base).toMatch(HEX_16);
    expect(firmaCola(filasDe(e))).toBe(base);
    expect(firmaCola([...filasDe(e)].reverse())).toBe(base);

    const permutada = filasDe(e);
    const [a, b] = [fila(permutada, 'SPS413'), fila(permutada, 'FST189')];
    [a.posicion.posicion, b.posicion.posicion] = [b.posicion.posicion, a.posicion.posicion];
    expect(firmaCola(permutada)).not.toBe(base);

    const conOferta = filasDe(e);
    fila(conOferta, 'QOR007').ofertasAbiertas.push({
      id: 'of-x',
      requerimientoId: 'req-1',
      vehiculoId: 'v-QOR007',
      asociadoId: 'a-03',
      ofrecidaPor: OPS.id,
      ofrecidaEn: '2026-09-16T13:00:00.000Z',
      expiraEn: '2026-09-16T15:00:00.000Z',
      estado: 'abierta',
      motivoDeclinacionId: null,
      nota: null,
      respondidaEn: null,
      respondidaPor: null,
    });
    expect(firmaCola(conOferta)).not.toBe(base);

    const penalizada = filasDe(e);
    fila(penalizada, 'SUL470').posicion.saltosPendientes = 1;
    expect(firmaCola(penalizada)).not.toBe(base);
  });
});

describe('MotorCola · previsualizarOferta (brief §5, momento 1: antes de ofrecer)', () => {
  it('muestra candidata, saltadas, cupos y firma sin escribir nada', async () => {
    const e = crearEscenario();
    const vista = await e.motor.previsualizarOferta({ requerimientoId: 'req-1', actor: OPS });
    expect(vista).toEqual({
      candidato: { vehiculoId: 'v-FST189', placa: 'FST189', asociadoId: 'a-02', posicion: 2 },
      descartes: [SALTO_SPS413],
      firma: expect.stringMatching(HEX_16),
      cuposDisponibles: 2,
      claseCola: 'TM-CBZ',
      clienteId: 'c-hlb',
    });
    expect(contadores(e)).toEqual({ ofertas: 0, saltos: 0, auditoria: 0, outbox: 0 });
    expect(e.almacen.lockTomado('TM-CBZ')).toBe(false);
    // Es reproducible: la misma cola da la misma firma.
    expect(
      (await e.motor.previsualizarOferta({ requerimientoId: 'req-1', actor: OPS })).firma,
    ).toBe(vista.firma);
  });

  it('sin elegibles devuelve candidato null con todos los descartes, y refleja los cupos ocupados', async () => {
    const e = crearEscenario();
    for (const v of e.estado.vehiculos) v.estado = 'inactivo';
    const vacia = await e.motor.previsualizarOferta({ requerimientoId: 'req-1', actor: OPS });
    expect(vacia.candidato).toBeNull();
    expect(vacia.descartes).toHaveLength(6);
    expect(contadores(e)).toEqual({ ofertas: 0, saltos: 0, auditoria: 0, outbox: 0 });

    const llena = crearEscenario();
    await llena.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    await llena.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    const sinCupos = await llena.motor.previsualizarOferta({
      requerimientoId: 'req-1',
      actor: OPS,
    });
    expect(sinCupos.cuposDisponibles).toBe(0);
    expect(sinCupos.candidato?.placa).toBe('QOR007');
  });

  it('exige requerimiento existente y abierto', async () => {
    const e = crearEscenario();
    expect(
      (await errorDe(e.motor.previsualizarOferta({ requerimientoId: 'no-existe', actor: OPS })))
        .code,
    ).toBe('NOT_FOUND');
    e.estado.requerimientos[0]!.estado = 'cerrado';
    expect(
      (await errorDe(e.motor.previsualizarOferta({ requerimientoId: 'req-1', actor: OPS }))).code,
    ).toBe('REQUERIMIENTO_CERRADO');
  });
});

describe('MotorCola · ofrecer con esperado (brief §5, momentos 2 y 3)', () => {
  it('con esperado correcto crea la oferta, persiste los saltos y deja el acta completa en audit y outbox', async () => {
    const e = crearEscenario();
    const vista = await e.motor.previsualizarOferta({ requerimientoId: 'req-1', actor: OPS });
    const oferta = await e.motor.ofrecer({
      requerimientoId: 'req-1',
      actor: OPS,
      esperado: { vehiculoId: vista.candidato!.vehiculoId, firma: vista.firma },
    });
    expect(oferta.vehiculoId).toBe('v-FST189');

    expect(e.estado.saltos).toEqual([
      {
        ...SALTO_SPS413,
        id: expect.any(String),
        ofertaId: oferta.id,
        creadoEn: '2026-09-16T13:00:00.000Z',
      },
    ]);

    const evento = e.estado.auditoria.find((a) => a.accion === 'oferta.crear');
    expect(evento?.entidadId).toBe(oferta.id);
    expect(evento?.after).toMatchObject({
      id: oferta.id,
      vehiculoId: 'v-FST189',
      claseCola: 'TM-CBZ',
      clienteId: 'c-hlb',
      posicionElegida: 2,
      descartes: [SALTO_SPS413],
      firma: vista.firma,
      parametrosAplicados: {
        declinacion_politica: e.estado.parametros.declinacion_politica,
        bloquear_por_documento_vencido: e.estado.parametros.bloquear_por_documento_vencido,
        un_tr_activo_por_placa: e.estado.parametros.un_tr_activo_por_placa,
        oferta_ttl_minutos: e.estado.parametros.oferta_ttl_minutos,
      },
    });

    const aviso = e.estado.outbox.find((a) => a.evento === 'oferta.abierta');
    expect(aviso?.datos).toMatchObject({
      ofertaId: oferta.id,
      posicionElegida: 2,
      saltadas: 1,
      clienteCodigo: 'HLB',
    });
  });

  it('si la cola cambió (placa o firma), CANDIDATO_CAMBIO sin oferta, sin saltos, sin audit, sin outbox y sin consumir penalizaciones', async () => {
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
    await e.motor.anular({ ofertaId: siguiente!.id, motivo: 'test', actor: OPS });
    // La ronda dio la vuelta: FST189 (penalizada) vuelve a la cabeza, delante de SPS413 (no apta).
    e.estado.posiciones = moverACabeza(e.posiciones(), 'v-FST189');
    expect(e.placasEnOrden().slice(0, 3)).toEqual(['FST189', 'SPS413', 'SWI750']);

    const vista = await e.motor.previsualizarOferta({ requerimientoId: 'req-1', actor: OPS });
    expect(vista.candidato?.placa).toBe('SWI750');
    expect(vista.descartes.map((d) => [d.placa, d.motivo])).toEqual([
      ['FST189', 'PENALIZACION_PENDIENTE'],
      ['SPS413', 'VEHICULO_NO_HABILITADO'],
    ]);
    const antes = contadores(e);

    const otraPlaca = await errorDe(
      e.motor.ofrecer({
        requerimientoId: 'req-1',
        actor: OPS,
        esperado: { vehiculoId: 'v-QOR007', firma: vista.firma },
      }),
    );
    expect(otraPlaca.code).toBe('CANDIDATO_CAMBIO');
    expect(otraPlaca.details).toEqual({
      esperado: { vehiculoId: 'v-QOR007', firma: vista.firma },
      actual: { vehiculoId: 'v-SWI750', placa: 'SWI750', posicion: 3 },
      firma: vista.firma,
    });

    const otraFirma = await errorDe(
      e.motor.ofrecer({
        requerimientoId: 'req-1',
        actor: OPS,
        esperado: { vehiculoId: 'v-SWI750', firma: '0000000000000000' },
      }),
    );
    expect(otraFirma.code).toBe('CANDIDATO_CAMBIO');

    // Cero efectos: el rollback deja todo como estaba, incluida la penalización de FST189.
    expect(contadores(e)).toEqual(antes);
    expect(e.posiciones().find((p) => p.vehiculoId === 'v-FST189')?.saltosPendientes).toBe(1);
    expect(e.almacen.lockTomado('TM-CBZ')).toBe(false);

    // Con lo que la sala vio de verdad, sale SWI750, FST189 consume su salto y el acta lo cuenta.
    const oferta = await e.motor.ofrecer({
      requerimientoId: 'req-1',
      actor: OPS,
      esperado: { vehiculoId: vista.candidato!.vehiculoId, firma: vista.firma },
    });
    expect(oferta.vehiculoId).toBe('v-SWI750');
    expect(e.posiciones().find((p) => p.vehiculoId === 'v-FST189')?.saltosPendientes).toBe(0);
    expect(
      e.estado.saltos
        .filter((s) => s.ofertaId === oferta.id)
        .map((s) => [s.posicion, s.placa, s.motivo]),
    ).toEqual([
      [1, 'FST189', 'PENALIZACION_PENDIENTE'],
      [2, 'SPS413', 'VEHICULO_NO_HABILITADO'],
    ]);
    expect(e.estado.auditoria.slice(antes.auditoria).map((a) => a.accion)).toEqual([
      'cola.penalizacion_consumida',
      'oferta.crear',
    ]);
  });

  it('COLA_VACIA conserva details.descartes, ahora como lista de descartes', async () => {
    const e = crearEscenario();
    for (const v of e.estado.vehiculos) v.estado = 'inactivo';
    const error = await errorDe(e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS }));
    expect(error.code).toBe('COLA_VACIA');
    const descartes = error.details.descartes as Array<{ placa: string; motivo: string }>;
    expect(descartes).toHaveLength(6);
    expect(descartes[0]).toMatchObject({ placa: 'SPS413', motivo: 'VEHICULO_NO_ACTIVO' });
    expect(contadores(e)).toEqual({ ofertas: 0, saltos: 0, auditoria: 0, outbox: 0 });
  });

  it('la reoferta tras declinar pasa por el mismo camino y también persiste sus saltos', async () => {
    const e = crearEscenario();
    const primera = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    const { siguiente } = await e.motor.declinar({
      ofertaId: primera.id,
      motivoId: 'm-mantenimiento',
      actor: e.memberDe('FST189'),
    });
    expect(siguiente?.vehiculoId).toBe('v-SWI750');
    expect(e.estado.saltos.map((s) => [s.ofertaId, s.placa, s.motivo])).toEqual([
      [primera.id, 'SPS413', 'VEHICULO_NO_HABILITADO'],
      [siguiente!.id, 'SPS413', 'VEHICULO_NO_HABILITADO'],
    ]);
  });

  it('la reoferta a la misma placa (política reofertar) deja acta sin saltadas', async () => {
    const e = crearEscenario({ parametros: { oferta_expirada_politica: 'reofertar' } });
    await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    e.reloj.avanzarMinutos(120);
    await e.motor.expirarOfertas();
    const nueva = e.estado.ofertas.find((o) => o.estado === 'abierta')!;
    expect(nueva.vehiculoId).toBe('v-FST189');
    expect(e.estado.saltos.filter((s) => s.ofertaId === nueva.id)).toEqual([]);
    const evento = e.estado.auditoria.filter((a) => a.accion === 'oferta.crear').at(-1);
    expect(evento?.after).toMatchObject({
      id: nueva.id,
      posicionElegida: 2,
      descartes: [],
      firma: expect.stringMatching(HEX_16),
    });
  });

  it('sin esperado sigue funcionando igual (compatibilidad)', async () => {
    const e = crearEscenario();
    const oferta = await e.motor.ofrecer({ requerimientoId: 'req-1', actor: OPS });
    expect(oferta.vehiculoId).toBe('v-FST189');
    expect(e.estado.saltos).toHaveLength(1);
    expect(e.placasEnOrden()).toEqual(['SPS413', 'FST189', 'SWI750', 'QOR007', 'SOF336', 'SUL470']);
  });
});
