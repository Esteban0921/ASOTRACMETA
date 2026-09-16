// Estados cerrados del dominio (RULE-010). Nunca texto libre como estado.

export const ESTADOS_OFERTA = ['abierta', 'aceptada', 'declinada', 'expirada', 'anulada'] as const;
export type EstadoOferta = (typeof ESTADOS_OFERTA)[number];

export const ESTADOS_TR = ['asignado', 'en_curso', 'cumplido', 'cancelado', 'no_tramitar'] as const;
export type EstadoTr = (typeof ESTADOS_TR)[number];

/** TR que ocupan la unidad (bloquean nueva oferta si `un_tr_activo_por_placa`). */
export const ESTADOS_TR_ACTIVOS: readonly EstadoTr[] = ['asignado', 'en_curso'];
/** TR que consumen un cupo del requerimiento. */
export const ESTADOS_TR_VIGENTES: readonly EstadoTr[] = ['asignado', 'en_curso', 'cumplido'];

export const ESTADOS_VIAJE = ['borrador', 'cargado', 'descargado', 'liquidado', 'anulado'] as const;
export type EstadoViaje = (typeof ESTADOS_VIAJE)[number];

export const ESTADOS_RECAUDO = ['pendiente', 'parcial', 'pagado', 'cruzado', 'castigado'] as const;
export type EstadoRecaudo = (typeof ESTADOS_RECAUDO)[number];

export const ESTADOS_VEHICULO = ['activo', 'inactivo', 'bloqueado_hseq', 'vendido'] as const;
export type EstadoVehiculo = (typeof ESTADOS_VEHICULO)[number];

export const ESTADOS_DOCUMENTO = ['vigente', 'por_vencer', 'vencido'] as const;
export type EstadoDocumento = (typeof ESTADOS_DOCUMENTO)[number];

export const ESTADOS_REQUERIMIENTO = ['abierto', 'cerrado', 'cancelado'] as const;
export type EstadoRequerimiento = (typeof ESTADOS_REQUERIMIENTO)[number];

export const CLASES_VEHICULO = ['C100', 'C350', 'C600', 'MM', 'TM', 'CBZ'] as const;
export type ClaseVehiculo = (typeof CLASES_VEHICULO)[number];

export const CLASES_COLA = ['C100', 'C350', 'C600', 'MM', 'TM-CBZ'] as const;
export type ClaseCola = (typeof CLASES_COLA)[number];

/** En el legado `TM` y `CBZ` comparten la rotación `TM-CBZ`. */
export function claseColaDe(clase: ClaseVehiculo): ClaseCola {
  return clase === 'TM' || clase === 'CBZ' ? 'TM-CBZ' : clase;
}

export function esClaseCola(valor: string): valor is ClaseCola {
  return (CLASES_COLA as readonly string[]).includes(valor);
}
