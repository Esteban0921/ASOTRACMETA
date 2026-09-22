import type { EventoAuditoria, MotivoNoElegible } from '@asotracmet/domain';
import type {
  ClaseCola,
  ClaseVehiculo,
  EstadoOferta,
  EstadoRequerimiento,
  EstadoTr,
  EstadoVehiculo,
  Parametros,
} from '@asotracmet/shared';

// Puerto de lectura de la API (TASK-0038). El motor decide; esto solo proyecta.
// Las dos implementaciones (memoria y Postgres) devuelven exactamente estas formas.

export interface VistaRequerimiento {
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
  cliente: string | null;
  clienteNombre: string | null;
  destino: string | null;
  cuposAsignados: number;
  ofertasAbiertas: number;
  cuposDisponibles: number;
}

export interface VistaOferta {
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
  placa: string | null;
  claseCola: ClaseCola | null;
  etiqueta: string | null;
  motivoDeclinacion: string | null;
  requerimiento: VistaRequerimiento | null;
}

export interface VistaTr {
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
  placa: string | null;
  cliente: string | null;
  destino: string | null;
  etiqueta: string | null;
}

export interface VistaCliente {
  id: string;
  codigo: string;
  nombre: string;
  requiereHabilitacion: boolean;
}

export interface VistaDestino {
  id: string;
  nombre: string;
  km: number | null;
}

export interface VistaMotivo {
  id: string;
  codigo: string;
  nombre: string;
}

export interface VistaVehiculo {
  id: string;
  placa: string;
  clase: ClaseVehiculo;
  claseCola: ClaseCola;
  estado: EstadoVehiculo;
  noElegibleHasta: string | null;
  asociadoId: string;
  asociado: { id: string; nombre: string; documento: string | null } | null;
  habilitaciones: Array<{
    clienteId: string;
    cliente: string | null;
    apto: boolean;
    motivoBloqueo: string | null;
  }>;
}

export interface MiPosicion {
  placa: string;
  claseCola: ClaseCola;
  posicion: number;
  total: number;
}

// Acta de turno (brief §5, TASK-0053): las placas que una oferta saltó, con su motivo.

/** Un salto tal como lo lee el acta de la oferta (coordinador, veedor) o el propio asociado. */
export interface VistaSalto {
  id: string;
  ofertaId: string;
  vehiculoId: string;
  placa: string;
  etiqueta: string;
  posicion: number;
  motivo: MotivoNoElegible;
  detalle: string | null;
  creadoEn: string;
}

/** "Mis turnos que pasaron": el salto con el servicio que le pasó por delante al asociado. */
export interface VistaSaltoPropio extends VistaSalto {
  claseCola: ClaseCola;
  requerimientoId: string;
  cliente: string | null;
  destino: string | null;
  fechaServicio: string | null;
  ofertaEstado: EstadoOferta;
}

/** Saltadas por placa y motivo en un mes (tablero y acta del mes). */
export interface VistaSaltoAgregado {
  vehiculoId: string;
  placa: string;
  etiqueta: string;
  motivo: MotivoNoElegible;
  total: number;
}

/** Fechas de negocio `YYYY-MM-DD` inclusivas, en la zona de `parametros.timezone`. */
export interface RangoFechas {
  desde?: string;
  hasta?: string;
}

export interface FiltroRequerimientos {
  estado?: EstadoRequerimiento;
  fecha?: string;
}

export interface FiltroOfertas {
  estado?: EstadoOferta;
  requerimientoId?: string;
  /** Scope `own`: restringe a estas placas. */
  vehiculoIds?: readonly string[];
}

export interface FiltroTrs {
  estado?: EstadoTr;
  desde?: string;
  hasta?: string;
  placa?: string;
  vehiculoIds?: readonly string[];
}

export interface FiltroAudit {
  entidad?: string;
  entidadId?: string;
  /** Solo estas acciones (por ejemplo, las intervenciones sobre la cola). */
  acciones?: readonly string[];
  limite: number;
  /** `null` = todas las entidades (superadmin). */
  entidadesPermitidas: readonly string[] | null;
}

export interface Consultas {
  clientes(): Promise<VistaCliente[]>;
  destinos(): Promise<VistaDestino[]>;
  motivosDeclinacion(): Promise<VistaMotivo[]>;
  /** `vehiculoIds` presente = scope `own`. `enmascarar` aplica el `R*` de la spec §3.2. */
  vehiculos(opciones: {
    vehiculoIds?: readonly string[];
    enmascarar: boolean;
  }): Promise<VistaVehiculo[]>;

  requerimientos(filtro: FiltroRequerimientos): Promise<VistaRequerimiento[]>;
  requerimientoPorId(id: string): Promise<VistaRequerimiento | undefined>;

  ofertas(filtro: FiltroOfertas): Promise<VistaOferta[]>;
  ofertaPorId(id: string): Promise<VistaOferta | undefined>;

  trs(filtro: FiltroTrs): Promise<VistaTr[]>;
  trPorId(id: string): Promise<VistaTr | undefined>;

  posicionesDeVehiculos(vehiculoIds: readonly string[]): Promise<MiPosicion[]>;

  /** Saltos de una oferta en orden de posición (acta de turno). Bajo RLS un member ve los suyos. */
  saltosDeOferta(ofertaId: string): Promise<VistaSalto[]>;
  /** Saltos de estas placas, el más reciente primero; `rango` filtra por fecha de negocio. */
  saltosDeVehiculos(
    vehiculoIds: readonly string[],
    rango?: RangoFechas,
  ): Promise<VistaSaltoPropio[]>;
  /** Saltadas por placa y motivo en la clase durante `mes` (`YYYY-MM`, zona de `parametros`). */
  saltosPorClase(claseCola: ClaseCola, mes: string): Promise<VistaSaltoAgregado[]>;

  parametros(): Promise<Parametros>;
  audit(filtro: FiltroAudit): Promise<EventoAuditoria[]>;
}
