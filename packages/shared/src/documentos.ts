import type { EstadoDocumento } from './estados.js';

// Semáforo de vencimientos (spec §6.3, §9.2 HSEQ): vigente / por_vencer / vencido.
// El estado se calcula, no se guarda: así nunca queda desactualizado.

function diaUtc(fecha: string): number {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return Date.UTC(anio ?? 1970, (mes ?? 1) - 1, dia ?? 1);
}

/** Días enteros de `desde` a `hasta` (negativo si `hasta` ya pasó). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((diaUtc(hasta) - diaUtc(desde)) / 86_400_000);
}

/** `null` cuando el documento no vence. */
export function diasParaVencer(venceEn: string | null, hoy: string): number | null {
  return venceEn ? diasEntre(hoy, venceEn) : null;
}

/**
 * Vencido si la fecha ya pasó (misma regla que el filtro de cola: `vence_en < hoy`);
 * por vencer dentro de `diasAlerta`; vigente el resto. Sin fecha: vigente.
 */
export function estadoDocumento(
  venceEn: string | null,
  hoy: string,
  diasAlerta: number,
): EstadoDocumento {
  const dias = diasParaVencer(venceEn, hoy);
  if (dias === null) return 'vigente';
  if (dias < 0) return 'vencido';
  if (dias < diasAlerta) return 'por_vencer';
  return 'vigente';
}

const GRAVEDAD: Record<EstadoDocumento, number> = { vigente: 0, por_vencer: 1, vencido: 2 };

/** El peor estado de un conjunto: es el color del semáforo de la placa. */
export function peorEstadoDocumento(estados: readonly EstadoDocumento[]): EstadoDocumento {
  return estados.reduce<EstadoDocumento>(
    (peor, actual) => (GRAVEDAD[actual] > GRAVEDAD[peor] ? actual : peor),
    'vigente',
  );
}
