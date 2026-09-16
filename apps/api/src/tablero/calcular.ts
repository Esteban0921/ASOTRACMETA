import { fechaLocal, type ClaseCola } from '@asotracmet/shared';
import type { VistaOferta, VistaTr } from '../consultas/tipos.js';
import type { ViajeVista } from '../viajes/tipos.js';
import type { MetricaPlaca, Tablero } from './tipos.js';

// Cálculo puro del tablero (spec §9.2 Viewer): viajes del mes, declinaciones y equidad
// (turnos tomados vs ofrecidos por placa). Reproducible: mismas entradas, mismo resultado.

export interface EntradasTablero {
  mes: string;
  timezone: string;
  ofertas: readonly VistaOferta[];
  trs: readonly VistaTr[];
  viajes: readonly ViajeVista[];
}

const mesDe = (iso: string, timezone: string): string =>
  fechaLocal(new Date(iso), timezone).slice(0, 7);

function nuevaMetrica(
  vehiculoId: string,
  placa: string,
  claseCola: ClaseCola,
  etiqueta: string,
): MetricaPlaca {
  return {
    vehiculoId,
    placa,
    claseCola,
    etiqueta,
    ofrecidas: 0,
    tomadas: 0,
    declinadas: 0,
    expiradas: 0,
    anuladas: 0,
    trs: 0,
    viajes: 0,
    flete: 0,
    recaudo: 0,
    pagado: 0,
  };
}

export function calcularTablero(entradas: EntradasTablero): Tablero {
  const { mes, timezone } = entradas;
  const ofertas = entradas.ofertas.filter((o) => mesDe(o.ofrecidaEn, timezone) === mes);
  const trs = entradas.trs.filter((t) => t.fechaAsignacion.slice(0, 7) === mes);
  const viajes = entradas.viajes.filter((v) => v.mes === mes && v.estado !== 'anulado');

  const porPlaca = new Map<string, MetricaPlaca>();
  const metrica = (vehiculoId: string, placa: string, claseCola: ClaseCola, etiqueta: string) => {
    const actual = porPlaca.get(vehiculoId);
    if (actual) return actual;
    const nueva = nuevaMetrica(vehiculoId, placa, claseCola, etiqueta);
    porPlaca.set(vehiculoId, nueva);
    return nueva;
  };

  const porMotivo = new Map<string, number>();
  for (const o of ofertas) {
    const m = metrica(
      o.vehiculoId,
      o.placa ?? '',
      o.claseCola ?? 'TM-CBZ',
      o.etiqueta ?? o.placa ?? '',
    );
    m.ofrecidas += 1;
    if (o.estado === 'aceptada') m.tomadas += 1;
    if (o.estado === 'declinada') {
      m.declinadas += 1;
      const motivo = o.motivoDeclinacion ?? 'Sin motivo';
      porMotivo.set(motivo, (porMotivo.get(motivo) ?? 0) + 1);
    }
    if (o.estado === 'expirada') m.expiradas += 1;
    if (o.estado === 'anulada') m.anuladas += 1;
  }
  for (const t of trs) {
    metrica(t.vehiculoId, t.placa ?? '', t.claseCola, t.etiqueta ?? t.placa ?? '').trs += 1;
  }
  for (const v of viajes) {
    const m = metrica(
      v.vehiculoId,
      v.placa,
      v.claseCola,
      v.asociadoNombre ? `${v.asociadoNombre} · ${v.placa}` : v.placa,
    );
    m.viajes += 1;
    m.flete += v.flete ?? 0;
    if (v.estado === 'liquidado') {
      m.recaudo += v.valorRecaudo ?? 0;
      m.pagado += v.valorPagado;
    }
  }

  const equidad = [...porPlaca.values()].sort(
    (a, b) => b.ofrecidas - a.ofrecidas || b.tomadas - a.tomadas || a.placa.localeCompare(b.placa),
  );
  const porClase = new Map<ClaseCola, { ofrecidas: number; tomadas: number; declinadas: number }>();
  for (const m of equidad) {
    const c = porClase.get(m.claseCola) ?? { ofrecidas: 0, tomadas: 0, declinadas: 0 };
    c.ofrecidas += m.ofrecidas;
    c.tomadas += m.tomadas;
    c.declinadas += m.declinadas;
    porClase.set(m.claseCola, c);
  }
  const contar = (estado: VistaOferta['estado']) =>
    ofertas.filter((o) => o.estado === estado).length;
  const liquidados = viajes.filter((v) => v.estado === 'liquidado');
  const suma = (xs: readonly ViajeVista[], f: (v: ViajeVista) => number | null) =>
    xs.reduce((acc, v) => acc + (f(v) ?? 0), 0);
  const recaudo = suma(liquidados, (v) => v.valorRecaudo);
  const pagado = suma(liquidados, (v) => v.valorPagado);

  return {
    mes,
    ofertas: {
      ofrecidas: ofertas.length,
      aceptadas: contar('aceptada'),
      declinadas: contar('declinada'),
      expiradas: contar('expirada'),
      anuladas: contar('anulada'),
      abiertas: contar('abierta'),
    },
    trs: {
      asignados: trs.filter((t) => t.estado === 'asignado' || t.estado === 'en_curso').length,
      cumplidos: trs.filter((t) => t.estado === 'cumplido').length,
      cancelados: trs.filter((t) => t.estado === 'cancelado').length,
      noTramitar: trs.filter((t) => t.estado === 'no_tramitar').length,
    },
    viajes: {
      total: viajes.length,
      liquidados: liquidados.length,
      flete: suma(viajes, (v) => v.flete),
      recaudo,
      pagado,
      pendiente: recaudo - pagado,
    },
    porClase: [...porClase].map(([claseCola, c]) => ({ claseCola, ...c })),
    declinacionesPorMotivo: [...porMotivo]
      .map(([motivo, total]) => ({ motivo, total }))
      .sort((a, b) => b.total - a.total),
    equidad,
  };
}
