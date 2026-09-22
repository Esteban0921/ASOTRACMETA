import { z } from 'zod';

// Catálogo cerrado de motivos de bloqueo de una habilitación (spec §6.3, §12; TASK-0059).
// El motivo dejó de ser texto libre: `habilitaciones.motivo_bloqueo` guarda siempre el `nombre`
// del catálogo, que es lo único que ven la cola (`elegibilidad.detalle`) y el acta de turno. El
// detalle que escribe HSEQ va aparte en `nota`, puede ser sensible y solo sale en la ficha.

export const CODIGOS_MOTIVO_BLOQUEO = [
  'CURSO_VENCIDO',
  'SIN_CERTIFICACION',
  'DOCUMENTO_PENDIENTE',
  'INSPECCION_RECHAZADA',
  'SANCION_CLIENTE',
  'OTRO',
] as const;
export type CodigoMotivoBloqueo = (typeof CODIGOS_MOTIVO_BLOQUEO)[number];

const NOMBRES: Readonly<Record<CodigoMotivoBloqueo, string>> = {
  CURSO_VENCIDO: 'Curso del cliente vencido',
  SIN_CERTIFICACION: 'Sin certificación exigida por el cliente',
  DOCUMENTO_PENDIENTE: 'Documento del vehículo pendiente',
  INSPECCION_RECHAZADA: 'Inspección del cliente rechazada',
  SANCION_CLIENTE: 'Sanción o veto del cliente',
  OTRO: 'Otro motivo (ver nota)',
};

export interface MotivoBloqueo {
  codigo: CodigoMotivoBloqueo;
  nombre: string;
}

/** El catálogo en el orden en que lo muestra un `select` de HSEQ. */
export const MOTIVOS_BLOQUEO: readonly MotivoBloqueo[] = CODIGOS_MOTIVO_BLOQUEO.map((codigo) => ({
  codigo,
  nombre: NOMBRES[codigo],
}));

export const MotivoBloqueoSchema = z.enum(CODIGOS_MOTIVO_BLOQUEO);

export function esCodigoMotivoBloqueo(valor: unknown): valor is CodigoMotivoBloqueo {
  return typeof valor === 'string' && (CODIGOS_MOTIVO_BLOQUEO as readonly string[]).includes(valor);
}

export function nombreMotivoBloqueo(codigo: CodigoMotivoBloqueo): string {
  return NOMBRES[codigo];
}

/**
 * Backfill de un motivo que llega como texto (semilla en memoria, base anterior a la migración
 * 0020): si el texto es un nombre del catálogo se recupera su código; si no, es `OTRO` y el texto
 * original se conserva como nota. Es exactamente lo que hace la migración en SQL.
 */
export function motivoBloqueoDesdeTexto(texto: string | null): MotivoBloqueo & {
  nota: string | null;
} {
  const conocido = MOTIVOS_BLOQUEO.find((m) => m.nombre === texto);
  if (conocido) return { ...conocido, nota: null };
  return { codigo: 'OTRO', nombre: NOMBRES.OTRO, nota: texto };
}
