import type { ClaseCola, ClaseVehiculo, EstadoVehiculo } from '@asotracmet/shared';

// Registros completos de los maestros (spec §6.2-6.4). El dominio solo conoce la proyección que
// necesita el motor; estos tipos son la "ficha" que administra HSEQ / finanzas / superadmin.

export interface AsociadoRegistro {
  id: string;
  tipo: 'persona' | 'empresa';
  nombres: string | null;
  apellidos: string | null;
  razonSocial: string | null;
  documento: string;
  documentoTipo: string | null;
  celular: string | null;
  correo: string | null;
  direccion: string | null;
  /** Cifrada en aplicación (AES-GCM). Nunca sale completa por la API. */
  cuentaBancariaEnc: string | null;
  estado: 'activo' | 'inactivo' | 'retirado';
  fechaAfiliacion: string | null;
  creadoEn: string;
  actualizadoEn: string;
  eliminadoEn: string | null;
}

export interface VehiculoRegistro {
  id: string;
  placa: string;
  clase: ClaseVehiculo;
  claseCola: ClaseCola;
  tipoCarroceria: string | null;
  modelo: number | null;
  repotenciacion: number | null;
  largoMts: number | null;
  kmRecorrido: number | null;
  asociadoId: string;
  propietarioNombre: string | null;
  propietarioDocumento: string | null;
  parentesco: string | null;
  trailerPlaca: string | null;
  /** SATRACK, rastreoflotas... nunca una contraseña (spec §12). */
  gpsProveedor: string | null;
  estado: EstadoVehiculo;
  noElegibleHasta: string | null;
  creadoEn: string;
  actualizadoEn: string;
  eliminadoEn: string | null;
}

export interface ConductorRegistro {
  id: string;
  nombres: string;
  documento: string;
  celular: string | null;
  correo: string | null;
  asociadoId: string | null;
  licenciaCategoria: string | null;
  licenciaVence: string | null;
  creadoEn: string;
  actualizadoEn: string;
  eliminadoEn: string | null;
}

export interface VehiculoConductor {
  vehiculoId: string;
  conductorId: string;
  esPrincipal: boolean;
}

export interface ClienteRegistro {
  id: string;
  codigo: string;
  nombre: string;
  requiereHabilitacion: boolean;
  activo: boolean;
}

export interface DestinoRegistro {
  id: string;
  nombre: string;
  km: number | null;
  activo: boolean;
}

export interface TransportadoraRegistro {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface TarifaRegistro {
  id: string;
  clienteId: string;
  origen: string;
  destinoId: string;
  clase: ClaseVehiculo;
  modalidad: string;
  valor: number;
  vigenciaDesde: string;
  vigenciaHasta: string | null;
}

export interface TipoDocumentoRegistro {
  id: string;
  codigo: string;
  nombre: string;
  aplicaA: 'vehiculo' | 'conductor';
  bloqueante: boolean;
  diasAlerta: number;
}

export interface DocumentoRegistro {
  id: string;
  sujetoTipo: 'vehiculo' | 'conductor';
  sujetoId: string;
  tipoId: string;
  numero: string | null;
  emitidoEn: string | null;
  venceEn: string | null;
  archivoUrl: string | null;
  creadoEn: string;
  actualizadoEn: string;
  eliminadoEn: string | null;
}

export interface HabilitacionRegistro {
  id: string;
  vehiculoId: string;
  clienteId: string;
  apto: boolean;
  motivoBloqueo: string | null;
  requisitos: Record<string, unknown> | null;
  actualizadoEn: string;
}

export interface FiltroTarifas {
  clienteId?: string;
  destinoId?: string;
  clase?: ClaseVehiculo;
  vigentesEn?: string;
}

export interface FiltroDocumentos {
  sujetoTipo?: 'vehiculo' | 'conductor';
  sujetoId?: string;
  incluirEliminados?: boolean;
}

export interface OpcionesListado {
  incluirEliminados?: boolean;
}

/**
 * Puerto de maestros. Las escrituras de vehículos se reflejan en la proyección que usa el motor;
 * la pertenencia a la cola la decide `MotorCola.sincronizarVehiculoEnCola`, no este repositorio.
 */
export interface RepositorioMaestros {
  asociados(opciones?: OpcionesListado): Promise<AsociadoRegistro[]>;
  asociado(id: string): Promise<AsociadoRegistro | undefined>;
  asociadoPorDocumento(documento: string): Promise<AsociadoRegistro | undefined>;
  guardarAsociado(asociado: AsociadoRegistro): Promise<void>;

  vehiculos(opciones?: OpcionesListado): Promise<VehiculoRegistro[]>;
  vehiculo(id: string): Promise<VehiculoRegistro | undefined>;
  vehiculoPorPlaca(placa: string): Promise<VehiculoRegistro | undefined>;
  guardarVehiculo(vehiculo: VehiculoRegistro): Promise<void>;
  vehiculoTieneTrs(id: string): Promise<boolean>;

  conductores(opciones?: OpcionesListado): Promise<ConductorRegistro[]>;
  conductor(id: string): Promise<ConductorRegistro | undefined>;
  conductorPorDocumento(documento: string): Promise<ConductorRegistro | undefined>;
  guardarConductor(conductor: ConductorRegistro): Promise<void>;
  conductoresDe(
    vehiculoId: string,
  ): Promise<Array<VehiculoConductor & { conductor: ConductorRegistro }>>;
  asignarConductores(vehiculoId: string, asignaciones: VehiculoConductor[]): Promise<void>;

  clientes(): Promise<ClienteRegistro[]>;
  clientePorCodigo(codigo: string): Promise<ClienteRegistro | undefined>;
  guardarCliente(cliente: ClienteRegistro): Promise<void>;
  destinos(): Promise<DestinoRegistro[]>;
  destinoPorNombre(nombre: string): Promise<DestinoRegistro | undefined>;
  guardarDestino(destino: DestinoRegistro): Promise<void>;
  transportadoras(): Promise<TransportadoraRegistro[]>;
  transportadoraPorNombre(nombre: string): Promise<TransportadoraRegistro | undefined>;
  guardarTransportadora(transportadora: TransportadoraRegistro): Promise<void>;

  tarifas(filtro: FiltroTarifas): Promise<TarifaRegistro[]>;
  tarifa(id: string): Promise<TarifaRegistro | undefined>;
  /** Lanza `TARIFA_DUPLICADA` si ya existe la misma llave (cliente, destino, clase, modalidad, desde). */
  guardarTarifa(tarifa: TarifaRegistro): Promise<void>;

  tiposDocumento(): Promise<TipoDocumentoRegistro[]>;
  documentos(filtro: FiltroDocumentos): Promise<DocumentoRegistro[]>;
  documento(id: string): Promise<DocumentoRegistro | undefined>;
  guardarDocumento(documento: DocumentoRegistro): Promise<void>;

  habilitacionesDe(vehiculoId: string): Promise<HabilitacionRegistro[]>;
  guardarHabilitacion(habilitacion: HabilitacionRegistro): Promise<void>;

  /**
   * Job nocturno (spec §14): recalcula `documentos.estado` con la fecha dada. En Postgres llama a
   * `documentos_recalcular_estado`; en memoria el estado se calcula al leer y solo cuenta.
   */
  recalcularEstadosDocumentos(hoy: string): Promise<number>;
}

/** Datos de maestros que la semilla añade a la proyección del dominio. */
export interface SemillaMaestros {
  tiposDocumento: TipoDocumentoRegistro[];
  transportadoras: TransportadoraRegistro[];
  conductores: ConductorRegistro[];
  vehiculoConductores: VehiculoConductor[];
  tarifas: TarifaRegistro[];
  /** Ficha de los documentos que ya están en la proyección del dominio (número, emisión). */
  documentos: DocumentoRegistro[];
}
