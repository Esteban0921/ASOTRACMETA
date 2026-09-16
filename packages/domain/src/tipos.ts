import type {
  ClaseCola,
  ClaseVehiculo,
  CodigoError,
  EstadoOferta,
  EstadoRequerimiento,
  EstadoTr,
  EstadoVehiculo,
  Rol,
} from '@asotracmet/shared';

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

export interface Elegibilidad {
  elegible: boolean;
  motivo: CodigoError | null;
  detalle: string | null;
}

export interface PosicionCola extends ColaPosicion {
  vehiculo: Vehiculo;
  asociado: Asociado | null;
  elegibilidad: Elegibilidad;
}
