import type { Rol } from '@asotracmet/shared';

/** "Tu posición: 3 de 12 en TM-CBZ" (spec §9.2 Member). */
export function textoPosicion(claseCola: string, posicion: number, total: number): string {
  return `Tu posición: ${posicion} de ${total} en ${claseCola}`;
}

export function rutaInicialPorRol(rol: Rol): string {
  return rol === 'member' ? '/me' : '/ops';
}

const MENSAJES: Record<string, string> = {
  VEHICULO_NO_HABILITADO: 'La placa no está habilitada para ese cliente.',
  COLA_VACIA: 'No hay placas elegibles en la cola.',
  COLA_LOCKED: 'Otro coordinador está operando esta cola. Intenta de nuevo.',
  OFERTA_EXPIRADA: 'La oferta ya expiró.',
  OFERTA_NO_ABIERTA: 'La oferta ya fue respondida.',
  TR_DUPLICADO: 'La secuencia TR está desfasada. Avisa a superadmin.',
  FORBIDDEN_OWN_SCOPE: 'Solo puedes actuar sobre tus placas.',
  FORBIDDEN: 'No tienes permiso para esta acción.',
  UNAUTHORIZED: 'Sesión inválida. Inicia sesión de nuevo.',
  REQUERIMIENTO_SIN_CUPOS: 'El requerimiento ya no tiene cupos libres.',
  REQUERIMIENTO_CERRADO: 'El requerimiento está cerrado.',
  MOTIVO_REQUERIDO: 'Debes indicar un motivo.',
  VALIDATION_ERROR: 'Datos inválidos.',
  RATE_LIMITED: 'Demasiados intentos. Espera un minuto.',
  NETWORK: 'Sin conexión con el servidor.',
};

/** El código es estable; la traducción vive aquí (spec §8.6). */
export function traducirError(codigo: string): string {
  return MENSAJES[codigo] ?? `Error inesperado (${codigo}).`;
}

const ELEGIBILIDAD: Record<string, string> = {
  VEHICULO_NO_HABILITADO: 'No habilitada',
  DOCUMENTO_VENCIDO: 'Documento vencido',
  OFERTA_ABIERTA_PREVIA: 'Oferta abierta',
  TR_ACTIVO: 'En servicio',
  VEHICULO_NO_ACTIVO: 'Inactiva',
  BLOQUEO_TEMPORAL: 'Bloqueo temporal',
  PENALIZACION_PENDIENTE: 'Penalizada',
};

export function textoElegibilidad(motivo: string | null): string {
  if (!motivo) return 'Elegible';
  return ELEGIBILIDAD[motivo] ?? motivo;
}

export type TonoEstado = 'ambar' | 'verde' | 'rojo' | 'gris';

/** Ámbar = oferta abierta, verde = TR asignado, rojo = cancelado, gris = no habilitado (spec §9.3). */
export function tonoEstado(estado: string): TonoEstado {
  switch (estado) {
    case 'abierta':
      return 'ambar';
    case 'aceptada':
    case 'asignado':
    case 'en_curso':
    case 'cumplido':
      return 'verde';
    case 'declinada':
    case 'expirada':
    case 'anulada':
    case 'cancelado':
    case 'no_tramitar':
      return 'rojo';
    default:
      return 'gris';
  }
}

export function formatearFechaHora(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}
