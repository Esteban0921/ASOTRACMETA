import type { CodigoError, Parametros } from '@asotracmet/shared';
import type {
  Cliente,
  ColaPosicion,
  Descarte,
  Documento,
  Elegibilidad,
  Habilitacion,
  Oferta,
  Tr,
  Vehiculo,
} from './tipos.js';

export interface ContextoElegibilidad {
  posicion: ColaPosicion;
  vehiculo: Vehiculo;
  cliente: Cliente | null;
  habilitacion: Habilitacion | undefined;
  documentosVencidos: Documento[];
  ofertasAbiertas: Oferta[];
  trsActivos: Tr[];
  parametros: Parametros;
  ahora: Date;
}

/**
 * Los siete motivos por los que una placa se salta (spec §7.2), en el orden en que se aplican.
 * Son el `check` de `oferta_saltos` y el vocabulario del acta de turno (brief §5).
 */
export const MOTIVOS_NO_ELEGIBLE = [
  'VEHICULO_NO_ACTIVO',
  'DOCUMENTO_VENCIDO',
  'BLOQUEO_TEMPORAL',
  'VEHICULO_NO_HABILITADO',
  'OFERTA_ABIERTA_PREVIA',
  'TR_ACTIVO',
  'PENALIZACION_PENDIENTE',
] as const satisfies readonly CodigoError[];
export type MotivoNoElegible = (typeof MOTIVOS_NO_ELEGIBLE)[number];

const OK: Elegibilidad = { elegible: true, motivo: null, detalle: null };

/** Filtros del algoritmo `siguienteElegible` (spec §7.2), en el mismo orden. Función pura. */
export function evaluarElegibilidad(ctx: ContextoElegibilidad): Elegibilidad {
  const { vehiculo, cliente, habilitacion, parametros, ahora } = ctx;

  if (vehiculo.estado !== 'activo') {
    return {
      elegible: false,
      motivo: 'VEHICULO_NO_ACTIVO',
      detalle: `${vehiculo.placa} está ${vehiculo.estado}`,
    };
  }

  if (parametros.bloquear_por_documento_vencido && ctx.documentosVencidos.length > 0) {
    const tipos = ctx.documentosVencidos.map((d) => d.tipoCodigo).join(', ');
    return {
      elegible: false,
      motivo: 'DOCUMENTO_VENCIDO',
      detalle: `${vehiculo.placa} con documento vencido: ${tipos}`,
    };
  }

  if (vehiculo.noElegibleHasta && new Date(vehiculo.noElegibleHasta) > ahora) {
    return {
      elegible: false,
      motivo: 'BLOQUEO_TEMPORAL',
      detalle: `${vehiculo.placa} bloqueada hasta ${vehiculo.noElegibleHasta}`,
    };
  }

  if (cliente?.requiereHabilitacion && habilitacion?.apto !== true) {
    return {
      elegible: false,
      motivo: 'VEHICULO_NO_HABILITADO',
      detalle: `${vehiculo.placa} no apta para ${cliente.codigo}${
        habilitacion?.motivoBloqueo ? ` (${habilitacion.motivoBloqueo})` : ''
      }`,
    };
  }

  const ofertaViva = ctx.ofertasAbiertas.find((o) => new Date(o.expiraEn) > ahora);
  if (ofertaViva) {
    return {
      elegible: false,
      motivo: 'OFERTA_ABIERTA_PREVIA',
      detalle: `${vehiculo.placa} ya tiene una oferta abierta`,
    };
  }

  if (parametros.un_tr_activo_por_placa && ctx.trsActivos.length > 0) {
    const codigos = ctx.trsActivos.map((t) => t.codigo).join(', ');
    return {
      elegible: false,
      motivo: 'TR_ACTIVO',
      detalle: `${vehiculo.placa} ocupada con ${codigos}`,
    };
  }

  if (ctx.posicion.saltosPendientes > 0) {
    return {
      elegible: false,
      motivo: 'PENALIZACION_PENDIENTE',
      detalle: `${vehiculo.placa} debe dejar pasar ${ctx.posicion.saltosPendientes} turno(s)`,
    };
  }

  return OK;
}

export interface ResultadoCola {
  /** Primera fila elegible; si nadie lo es pero hay penalizadas, la primera penalizada. */
  candidato: ContextoElegibilidad | null;
  /** Filas que quedaron por delante del candidato y no salieron, en orden de posición. */
  descartes: Descarte[];
  /** Penalizadas (`penaliza_n`) que consumen un salto con esta oferta. */
  penalizadas: ContextoElegibilidad[];
}

/**
 * El acta del `siguienteElegible` (spec §7.2, brief §5) como función pura: recorre la cola en
 * orden de posición y devuelve quién sale y a quién se salta, con motivo y detalle. Si nadie es
 * elegible pero hay placas penalizadas, la primera penalizada recibe el turno (`penaliza_n`
 * nunca traba la cola) y los descartes son las filas anteriores a ella. Sin candidato, todas las
 * filas son descartes. No tiene efectos: consumir saltos y auditar es cosa del motor.
 */
export function evaluarCola(filas: ReadonlyArray<ContextoElegibilidad>): ResultadoCola {
  const descartes: Descarte[] = [];
  const penalizadas: ContextoElegibilidad[] = [];
  for (const fila of enOrden(filas)) {
    const elegibilidad = evaluarElegibilidad(fila);
    if (elegibilidad.elegible) return { candidato: fila, descartes, penalizadas };
    descartes.push({
      posicion: fila.posicion.posicion,
      vehiculoId: fila.vehiculo.id,
      placa: fila.vehiculo.placa,
      motivo: elegibilidad.motivo,
      detalle: elegibilidad.detalle,
    });
    if (elegibilidad.motivo === 'PENALIZACION_PENDIENTE') penalizadas.push(fila);
  }
  const [primeraPenalizada] = penalizadas;
  if (primeraPenalizada) {
    const indice = descartes.findIndex((d) => d.vehiculoId === primeraPenalizada.vehiculo.id);
    return {
      candidato: primeraPenalizada,
      descartes: descartes.slice(0, indice),
      penalizadas: [primeraPenalizada],
    };
  }
  return { candidato: null, descartes, penalizadas: [] };
}

/**
 * Huella de la cola para el acta (brief §5): FNV-1a de 64 bits, pura (sin `node:crypto`,
 * RULE-010), sobre lo que decide una oferta: orden y contadores de cada posición más los ids de
 * las ofertas abiertas de la clase. Si algo de eso cambia entre la vista previa y el clic, la firma
 * cambia y `ofrecer` responde `CANDIDATO_CAMBIO`. Devuelve 16 hexadecimales.
 */
export function firmaCola(filas: ReadonlyArray<ContextoElegibilidad>): string {
  const ordenadas = enOrden(filas);
  const posiciones = ordenadas
    .map(
      ({ posicion }) =>
        `${posicion.vehiculoId}:${posicion.ciclo}:${posicion.saltosPendientes}:${posicion.turnosOfrecidos}`,
    )
    .join('|');
  const abiertas = [
    ...new Set(ordenadas.flatMap((f) => f.ofertasAbiertas.map((o) => o.id))),
  ].sort();
  return fnv1a64(`${posiciones}#${abiertas.join(',')}`);
}

function enOrden(filas: ReadonlyArray<ContextoElegibilidad>): ContextoElegibilidad[] {
  return [...filas].sort((a, b) => a.posicion.posicion - b.posicion.posicion);
}

const FNV_OFFSET_64 = 0xcbf29ce484222325n;
const FNV_PRIMO_64 = 0x100000001b3n;
const MASCARA_64 = (1n << 64n) - 1n;

function fnv1a64(texto: string): string {
  let hash = FNV_OFFSET_64;
  for (const byte of new TextEncoder().encode(texto)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIMO_64) & MASCARA_64;
  }
  return hash.toString(16).padStart(16, '0');
}
