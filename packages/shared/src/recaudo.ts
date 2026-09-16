import type { EstadoRecaudo } from './estados.js';

// Reglas del recaudo (spec §6.5, §10, §20.7). El porcentaje es un parámetro que llega por argumento:
// aquí no hay ningún 0.03 (RULE-012).

/** `flete × porcentaje`, redondeado al peso. El resultado se guarda como snapshot en el viaje. */
export function calcularRecaudo(flete: number, porcentaje: number): number {
  if (!Number.isFinite(flete) || flete < 0) throw new RangeError('Flete inválido');
  if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 1) {
    throw new RangeError('Porcentaje inválido');
  }
  return Math.round(flete * porcentaje);
}

/** Estado del recaudo según lo pagado: pendiente, parcial o pagado (con tolerancia de un peso). */
export function estadoRecaudoSegunPago(valor: number, pagado: number): EstadoRecaudo {
  if (pagado <= 0) return 'pendiente';
  return pagado >= valor - 1 ? 'pagado' : 'parcial';
}

/** Mes `YYYY-MM` al que pertenece un viaje: la fecha de cargue si existe, si no la asignación del TR. */
export function mesDeViaje(fechaCargue: string | null, fechaAsignacion: string): string {
  return (fechaCargue ?? fechaAsignacion).slice(0, 7);
}
