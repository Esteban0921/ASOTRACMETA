import type {
  ClaseCola,
  ClaseVehiculo,
  EstadoOferta,
  EstadoRequerimiento,
  EstadoTr,
  EstadoVehiculo,
  Rol,
  EventoNotificacion,
} from '@asotracmet/shared';
import type { MotivoNoElegible } from './elegibilidad.js';

// Tipos del dominio (spec §4 y §6). Timestamps en ISO-8601 UTC; fechas de negocio en YYYY-MM-DD.

export interface Actor {
  id: string;
  rol: Rol;
  /** Scope `own` de un `member`: placas ligadas al usuario. */
  vehiculoIds?: readonly string[];
}

export interface Cliente {
  id: string;
  codigo: string;
  nombre: string;
  requiereHabilitacion: boolean;
}

export interface Destino {
  id: string;
  nombre: string;
  km: number | null;
  activo: boolean;
}

export interface Asociado {
  id: string;
  tipo: 'persona' | 'empresa';
  documento: string;
  nombres: string;
  apellidos: string | null;
  razonSocial: string | null;
  celular: string | null;
  correo: string | null;
}

export interface Vehiculo {
  id: string;
  placa: string;
  clase: ClaseVehiculo;
  claseCola: ClaseCola;
  asociadoId: string;
  estado: EstadoVehiculo;
  /** Bloqueo temporal por política `bloqueo_horas` (ISO) o null. */
  noElegibleHasta: string | null;
}

export interface Habilitacion {
  vehiculoId: string;
  clienteId: string;
  apto: boolean;
  motivoBloqueo: string | null;
}

export interface Documento {
  id: string;
  sujetoTipo: 'vehiculo' | 'conductor';
  sujetoId: string;
  tipoCodigo: string;
  venceEn: string;
  bloqueante: boolean;
}

export interface MotivoDeclinacion {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
}

export interface ColaPosicion {
  id: string;
  claseCola: ClaseCola;
  vehiculoId: string;
  /** 1 = cabeza. Posiciones densas 1..N (invariante §7.1). */
  posicion: number;
  /** Vueltas completas a la cola. Decoración de ronda, nunca PK (§7.6). */
  ciclo: number;
  turnosOfrecidos: number;
  turnosTomados: number;
  /** Política `penaliza_n`: ofertas que debe dejar pasar. */
  saltosPendientes: number;
  version: number;
}

export interface Requerimiento {
  id: string;
  clienteId: string;
  destinoId: string | null;
  claseCola: ClaseCola;
  fechaServicio: string;
  cantidadCupos: number;
  observaciones: string | null;
  estado: EstadoRequerimiento;
  creadoPor: string;
  creadoEn: string;
}

export interface Oferta {
  id: string;
  requerimientoId: string;
  vehiculoId: string;
  asociadoId: string;
  ofrecidaPor: string;
  ofrecidaEn: string;
  expiraEn: string;
  estado: EstadoOferta;
  motivoDeclinacionId: string | null;
  nota: string | null;
  respondidaEn: string | null;
  respondidaPor: string | null;
}

export interface Tr {
  id: string;
  codigo: string;
  ofertaId: string | null;
  requerimientoId: string;
  vehiculoId: string;
  claseCola: ClaseCola;
  clienteId: string;
  destinoId: string | null;
  fechaAsignacion: string;
  estado: EstadoTr;
  canceladoEn: string | null;
  canceladoPor: string | null;
  motivoCancelacion: string | null;
  version: number;
}

export interface EventoAuditoria {
  id: string;
  at: string;
  actorId: string;
  actorRol: Rol;
  accion: string;
  entidad: string;
  entidadId: string;
  before: unknown;
  after: unknown;
}

export type NuevoEventoAuditoria = Omit<EventoAuditoria, 'id' | 'at'>;

/**
 * A quién va un aviso (spec §11): los `member` de un asociado o de una placa, todos los usuarios
 * de un rol interno, o un usuario concreto. El worker de la API lo traduce a personas y canales.
 */
export interface DestinoNotificacion {
  asociadoId?: string;
  vehiculoId?: string;
  rol?: Rol;
  usuarioId?: string;
}

/** Aviso que el motor deja en la outbox dentro de su transacción (spec §11, ADR-0006). */
export interface NuevaNotificacion {
  evento: EventoNotificacion;
  destinos: DestinoNotificacion[];
  datos: Record<string, unknown>;
  /** Idempotencia: dos avisos con la misma clave se encolan una sola vez. */
  clave?: string | null;
}

export interface NotificacionOutbox extends NuevaNotificacion {
  id: string;
  clave: string | null;
  creadaEn: string;
  tomadaEn: string | null;
  intentos: number;
  procesadaEn: string | null;
  error: string | null;
}

/**
 * Resultado de los filtros de §7.2 sobre una fila de la cola: o pasa, o tiene un motivo cerrado
 * (uno de los siete de `MOTIVOS_NO_ELEGIBLE`) con su detalle en lenguaje de sala.
 */
export type Elegibilidad =
  | { elegible: true; motivo: null; detalle: null }
  | { elegible: false; motivo: MotivoNoElegible; detalle: string };

export interface PosicionCola extends ColaPosicion {
  vehiculo: Vehiculo;
  asociado: Asociado | null;
  elegibilidad: Elegibilidad;
}

// Acta de turno (brief §5; spec §7.2, §7.3, §21): quién sale, a quién se salta y por qué, antes y
// después de ofrecer. El frontend afirma lo que vio y el motor verifica (RULE-010).

/** Placa que quedó por delante de la elegida y no salió, con la posición que tenía en ese momento. */
export interface Descarte {
  posicion: number;
  vehiculoId: string;
  placa: string;
  motivo: MotivoNoElegible;
  detalle: string | null;
}

/** Descarte persistido en `oferta_saltos` en la misma transacción que la oferta. Append-only. */
export interface OfertaSalto extends Descarte {
  id: string;
  ofertaId: string;
  creadoEn: string;
}

export interface CandidatoOferta {
  vehiculoId: string;
  placa: string;
  asociadoId: string;
  posicion: number;
}

/** Lo que la sala afirma haber visto al ofrecer: `firma` sale de `VistaPrevia.firma`. */
export interface EsperadoOferta {
  vehiculoId: string;
  firma: string;
}

/** Vista previa del acta: solo lectura, sin lock ni efectos. `candidato: null` = nadie elegible. */
export interface VistaPrevia {
  candidato: CandidatoOferta | null;
  descartes: Descarte[];
  firma: string;
  cuposDisponibles: number;
  claseCola: ClaseCola;
  clienteId: string;
}
