import type { EventoAuditoria } from '@asotracmet/domain';
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

  parametros(): Promise<Parametros>;
  audit(filtro: FiltroAudit): Promise<EventoAuditoria[]>;
}
