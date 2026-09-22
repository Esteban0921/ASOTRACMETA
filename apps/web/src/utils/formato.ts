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
  COLA_LOCKED:
    'Otro coordinador está operando esta cola. Lo reintentamos dos veces; prueba de nuevo en unos segundos.',
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
  CODIGO_INVALIDO: 'El código o el enlace no es válido, ya se usó o venció.',
  CHALLENGE_INVALIDO: 'La verificación caducó. Vuelve a empezar.',
  DEMASIADOS_INTENTOS: 'Demasiados intentos. Pide un código nuevo.',
  REAUTH_REQUERIDA: 'Confirma tu identidad de nuevo para esta acción.',
  TOTP_NO_ENROLADO: 'Tu segundo factor no está configurado.',
  EMAIL_EN_USO: 'Ya existe un usuario con ese correo.',
  NOT_FOUND: 'No se encontró el registro.',
  VIAJE_YA_EXISTE: 'Ese TR ya tiene viaje.',
  VIAJE_LIQUIDADO: 'El viaje ya está liquidado: el flete no cambia y no se anula con pagos.',
  VIAJE_ANULADO: 'El viaje está anulado.',
  VIAJE_NO_LIQUIDABLE: 'Fija el flete acordado antes de liquidar.',
  TR_NO_VIAJABLE: 'Un TR cancelado o no tramitado no genera viaje.',
  RECAUDO_CERRADO: 'El recaudo ya está pagado o castigado.',
  PAGO_INVALIDO: 'El pago supera lo pendiente del recaudo.',
};

const ROLES_TEXTO: Record<string, string> = {
  superadmin: 'Superadministrador',
  admin_ops: 'Coordinación (ops)',
  admin_hseq: 'Flota / HSEQ',
  admin_finance: 'Comercial / tesorería',
  viewer: 'Consulta / veedor',
  member: 'Asociado / conductor',
};

export function textoRol(rol: string): string {
  return ROLES_TEXTO[rol] ?? rol;
}

const ESTADOS_DOCUMENTO_TEXTO: Record<string, string> = {
  vigente: 'Vigente',
  por_vencer: 'Por vencer',
  vencido: 'Vencido',
};

export function textoEstadoDocumento(estado: string): string {
  return ESTADOS_DOCUMENTO_TEXTO[estado] ?? estado;
}

/** Semáforo HSEQ (spec §9.2): verde vigente, ámbar por vencer, rojo vencido. */
export function tonoSemaforo(estado: string): TonoEstado {
  if (estado === 'vencido') return 'rojo';
  if (estado === 'por_vencer') return 'ambar';
  return 'verde';
}

const ESTADOS_VEHICULO_TEXTO: Record<string, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  bloqueado_hseq: 'Bloqueado por HSEQ',
  vendido: 'Vendido',
};

export function textoEstadoVehiculo(estado: string): string {
  return ESTADOS_VEHICULO_TEXTO[estado] ?? estado;
}

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

const INTERVENCIONES: Record<string, string> = {
  'cola.override': 'Override',
  'cola.reset': 'Reset de cola',
};

export function textoIntervencion(accion: string): string {
  return INTERVENCIONES[accion] ?? accion;
}

const ESTADOS_TR_TEXTO: Record<string, string> = {
  asignado: 'Asignado',
  en_curso: 'En curso',
  cumplido: 'Cumplido',
  cancelado: 'Cancelado',
  no_tramitar: 'No tramitar',
};

/** Estado del TR en pantalla: nunca el enum crudo (`no_tramitar`) sino su texto (TASK-0045). */
export function textoEstadoTr(estado: string): string {
  return ESTADOS_TR_TEXTO[estado] ?? estado;
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

const ESTADOS_VIAJE_TEXTO: Record<string, string> = {
  borrador: 'Borrador',
  cargado: 'Cargado',
  descargado: 'Descargado',
  liquidado: 'Liquidado',
  anulado: 'Anulado',
};

export function textoEstadoViaje(estado: string): string {
  return ESTADOS_VIAJE_TEXTO[estado] ?? estado;
}

const ESTADOS_RECAUDO_TEXTO: Record<string, string> = {
  pendiente: 'Pendiente',
  parcial: 'Pago parcial',
  pagado: 'Pagado',
  cruzado: 'Cruzado',
  castigado: 'Castigado',
};

export function textoEstadoRecaudo(estado: string): string {
  return ESTADOS_RECAUDO_TEXTO[estado] ?? estado;
}

/** Verde liquidado/pagado, ámbar en curso o pago parcial, rojo anulado/castigado, gris borrador. */
export function tonoViaje(estado: string): TonoEstado {
  switch (estado) {
    case 'liquidado':
    case 'pagado':
      return 'verde';
    case 'cargado':
    case 'descargado':
    case 'pendiente':
    case 'parcial':
      return 'ambar';
    case 'anulado':
    case 'castigado':
      return 'rojo';
    default:
      return 'gris';
  }
}

const PESOS = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function formatearPesos(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? '—' : PESOS.format(valor);
}

/** `YYYY-MM` de hoy en la zona de la operación (America/Bogota). */
export function mesActual(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
  }).format(ahora);
}

function valorCorto(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v.length > 60 ? `${v.slice(0, 57)}…` : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const json = JSON.stringify(v);
  return json.length > 60 ? `${json.slice(0, 57)}…` : json;
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Antes/después legibles para la auditoría (spec §9.2 Superadmin): una línea por clave que cambió
 * (`clave: antes → después`) o, si no hay antes, `clave: después`.
 */
export function resumenCambios(before: unknown, after: unknown): string[] {
  if (!esObjeto(after)) {
    if (after === null || after === undefined)
      return esObjeto(before) ? ['eliminado'] : ['sin datos'];
    return [valorCorto(after)];
  }
  const previo = esObjeto(before) ? before : {};
  const lineas: string[] = [];
  for (const [clave, valor] of Object.entries(after)) {
    if (clave in previo) {
      const antes = previo[clave];
      if (JSON.stringify(antes) === JSON.stringify(valor)) continue;
      lineas.push(`${clave}: ${valorCorto(antes)} → ${valorCorto(valor)}`);
    } else {
      lineas.push(`${clave}: ${valorCorto(valor)}`);
    }
  }
  return lineas.length > 0 ? lineas : ['sin cambios'];
}

// --- Ubicación GPS (ADR-0007, TASK-0065) ---------------------------------------------------------

/** "hace 12 min", "hace 3 h", "hace 2 d": la antigüedad la calcula la API, aquí solo se redacta. */
export function textoHace(minutos: number): string {
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
}

const FRESCURAS_TEXTO: Record<string, string> = {
  reciente: 'Reportando',
  desactualizada: 'Reporte atrasado',
  sin_senal: 'Sin señal',
};

export function textoFrescura(frescura: string): string {
  return FRESCURAS_TEXTO[frescura] ?? frescura;
}

export function tonoFrescura(frescura: string): TonoEstado {
  switch (frescura) {
    case 'reciente':
      return 'verde';
    case 'desactualizada':
      return 'ambar';
    case 'sin_senal':
      return 'rojo';
    default:
      return 'gris';
  }
}

/** Enlace a un mapa externo. Solo se ofrece a quien recibe coordenadas (el veedor no). */
export function urlMapaExterno(latitud: number, longitud: number): string {
  return `https://www.google.com/maps?q=${latitud},${longitud}`;
}
