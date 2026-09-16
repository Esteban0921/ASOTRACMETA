// Códigos de error estables (spec §8.6, RULE-020). El frontend traduce; el código no cambia.

export const CODIGOS_ERROR = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  FORBIDDEN_OWN_SCOPE: 403,
  NOT_FOUND: 404,
  COLA_LOCKED: 409,
  TR_DUPLICADO: 409,
  OFERTA_NO_ABIERTA: 409,
  REQUERIMIENTO_CERRADO: 409,
  REQUERIMIENTO_SIN_CUPOS: 409,
  TR_NO_CANCELABLE: 409,
  VERSION_CONFLICT: 409,
  COLA_VACIA: 422,
  VEHICULO_NO_HABILITADO: 422,
  VEHICULO_NO_ACTIVO: 422,
  DOCUMENTO_VENCIDO: 422,
  BLOQUEO_TEMPORAL: 422,
  OFERTA_ABIERTA_PREVIA: 422,
  TR_ACTIVO: 422,
  PENALIZACION_PENDIENTE: 422,
  OFERTA_EXPIRADA: 422,
  MOTIVO_REQUERIDO: 422,
  RATE_LIMITED: 429,
  INVARIANTE_COLA: 500,
  INTERNAL: 500,
} as const;

export type CodigoError = keyof typeof CODIGOS_ERROR;

export function httpStatusDe(codigo: CodigoError): number {
  return CODIGOS_ERROR[codigo];
}

export interface ErrorApi {
  code: CodigoError;
  message: string;
  details?: Record<string, unknown>;
}
