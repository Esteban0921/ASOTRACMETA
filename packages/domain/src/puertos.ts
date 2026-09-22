import type { ClaseCola, Parametros } from '@asotracmet/shared';
import type {
  Asociado,
  Cliente,
  ColaPosicion,
  Descarte,
  Documento,
  Habilitacion,
  MotivoDeclinacion,
  NuevaNotificacion,
  NuevoEventoAuditoria,
  Oferta,
  Requerimiento,
  Tr,
  Vehiculo,
} from './tipos.js';

// Puertos del motor (arquitectura hexagonal). La API inyecta el adaptador (memoria hoy, Postgres mañana).

export interface Reloj {
  ahora(): Date;
}

export interface GeneradorIds {
  nuevo(): string;
}

/** Operaciones disponibles dentro de una transacción. Todas las mutaciones son atómicas al commit. */
export interface Transaccion {
  parametros(): Promise<Parametros>;
  guardarParametros(parametros: Parametros): Promise<void>;

  cliente(id: string): Promise<Cliente | undefined>;
  asociado(id: string): Promise<Asociado | undefined>;
  motivoDeclinacion(id: string): Promise<MotivoDeclinacion | undefined>;

  vehiculo(id: string): Promise<Vehiculo | undefined>;
  guardarVehiculo(vehiculo: Vehiculo): Promise<void>;
  /** Todos los vehículos de una clase de cola (activos o no), para reconstruir la cola (§13.3). */
  vehiculosDeClase(claseCola: ClaseCola): Promise<Vehiculo[]>;
  habilitacion(vehiculoId: string, clienteId: string): Promise<Habilitacion | undefined>;
  documentosBloqueantesVencidos(vehiculoId: string, hoy: string): Promise<Documento[]>;

  posiciones(claseCola: ClaseCola): Promise<ColaPosicion[]>;
  guardarPosiciones(claseCola: ClaseCola, posiciones: ColaPosicion[]): Promise<void>;

  requerimiento(id: string): Promise<Requerimiento | undefined>;
  guardarRequerimiento(requerimiento: Requerimiento): Promise<void>;

  oferta(id: string): Promise<Oferta | undefined>;
  guardarOferta(oferta: Oferta): Promise<void>;
  ofertasAbiertasDeVehiculo(vehiculoId: string): Promise<Oferta[]>;
  ofertasAbiertasDeRequerimiento(requerimientoId: string): Promise<Oferta[]>;
  ofertasAbiertasVencidas(ahora: string): Promise<Oferta[]>;
  /**
   * Acta de turno (brief §5, spec §21): las placas que la oferta saltó, con su motivo, en la
   * misma transacción que la oferta. Append-only e idempotente por `(ofertaId, vehiculoId)`.
   */
  guardarSaltos(ofertaId: string, descartes: readonly Descarte[]): Promise<void>;

  tr(id: string): Promise<Tr | undefined>;
  guardarTr(tr: Tr): Promise<void>;
  trsActivosDeVehiculo(vehiculoId: string): Promise<Tr[]>;
  trsVigentesDeRequerimiento(requerimientoId: string): Promise<Tr[]>;
  /** Consume la secuencia `parametros.secuencia_tr`. Lanza TR_DUPLICADO si el código ya existe. */
  siguienteCodigoTr(): Promise<string>;

  /** Append-only. Se escribe en la misma transacción que la mutación (RULE-012). */
  auditar(evento: NuevoEventoAuditoria): Promise<void>;
  /** Outbox de avisos (spec §11, ADR-0006): en la misma transacción que la mutación. */
  notificar(aviso: NuevaNotificacion): Promise<void>;
}

export interface UnidadDeTrabajo {
  /**
   * Ejecuta `fn` bajo lock de la clase de cola (§7.7). Si el lock está tomado lanza
   * `COLA_LOCKED` sin esperar. Si `fn` lanza, se revierte todo.
   */
  ejecutar<T>(claseCola: ClaseCola | null, fn: (tx: Transaccion) => Promise<T>): Promise<T>;
  /** Lectura sin lock ni transacción. */
  leer<T>(fn: (tx: Transaccion) => Promise<T>): Promise<T>;
}
