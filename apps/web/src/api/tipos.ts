import type {
  ClaseCola,
  ClaseVehiculo,
  EstadoDocumento,
  EstadoOferta,
  EstadoRecaudo,
  EstadoTr,
  EstadoViaje,
  EstadoVehiculo,
  Rol,
  EventoNotificacion,
  PreferenciasNotificacion,
} from '@asotracmet/shared';

// Proyecciones que devuelve la API (apps/api/src/vistas.ts). Se mantienen a mano hasta TASK-0024 (OpenAPI).

export interface UsuarioSesion {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  asociadoId: string | null;
  vehiculoIds: string[];
  totpConfigurado: boolean;
}

export interface Sesion {
  token: string;
  expiraEn: string;
  usuario: UsuarioSesion;
}

/** Respuesta de `POST /auth/login` (spec §3.3): el acceso se completa en un segundo paso. */
export type RespuestaLogin =
  | { paso: 'codigo_enviado' }
  | { paso: 'totp'; challenge: string }
  | { paso: 'totp_enrolar'; challenge: string; secret: string; otpauthUrl: string }
  | ({ paso: 'sesion' } & Sesion);

export interface Cliente {
  id: string;
  codigo: string;
  nombre: string;
}

export interface MotivoDeclinacion {
  id: string;
  codigo: string;
  nombre: string;
}

export interface VistaRequerimiento {
  id: string;
  clienteId: string;
  cliente: string | null;
  clienteNombre: string | null;
  destino: string | null;
  claseCola: ClaseCola;
  fechaServicio: string;
  cantidadCupos: number;
  cuposAsignados: number;
  ofertasAbiertas: number;
  cuposDisponibles: number;
  observaciones: string | null;
  estado: string;
}

export interface VistaOferta {
  id: string;
  requerimientoId: string;
  vehiculoId: string;
  placa: string | null;
  claseCola: ClaseCola | null;
  etiqueta: string | null;
  estado: EstadoOferta;
  ofrecidaEn: string;
  expiraEn: string;
  motivoDeclinacion: string | null;
  nota: string | null;
  requerimiento: VistaRequerimiento | null;
}

export interface VistaTr {
  id: string;
  codigo: string;
  placa: string | null;
  cliente: string | null;
  destino: string | null;
  etiqueta: string | null;
  fechaAsignacion: string;
  estado: EstadoTr;
  motivoCancelacion: string | null;
}

export interface Elegibilidad {
  elegible: boolean;
  motivo: string | null;
  detalle: string | null;
}

export interface VistaPosicion {
  posicion: number;
  ciclo: number;
  turnosOfrecidos: number;
  turnosTomados: number;
  vehiculoId: string;
  placa: string;
  clase: string;
  estadoVehiculo: string;
  etiqueta: string;
  asociado: { nombre: string; documento: string | null; celular: string | null } | null;
  elegibilidad: Elegibilidad;
}

export interface VistaCola {
  claseCola: ClaseCola;
  clienteId: string | null;
  total: number;
  cabezaElegible: string | null;
  posiciones: VistaPosicion[];
}

export interface MiPosicion {
  placa: string;
  claseCola: ClaseCola;
  posicion: number;
  total: number;
}

export interface VistaVehiculo {
  id: string;
  placa: string;
  clase: string;
  claseCola: ClaseCola;
  estado: string;
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

// --- Maestros (spec §6.2-6.4) ---------------------------------------------------------------

export interface VistaAsociado {
  id: string;
  tipo: 'persona' | 'empresa';
  nombre: string;
  nombres: string | null;
  apellidos: string | null;
  razonSocial: string | null;
  documento: string | null;
  documentoTipo: string | null;
  celular: string | null;
  correo: string | null;
  direccion: string | null;
  cuentaBancariaRegistrada: boolean;
  estado: 'activo' | 'inactivo' | 'retirado';
  fechaAfiliacion: string | null;
  eliminadoEn: string | null;
}

export interface VistaVehiculoRegistro {
  id: string;
  placa: string;
  clase: ClaseVehiculo;
  claseCola: ClaseCola;
  estado: EstadoVehiculo;
  asociadoId: string;
  tipoCarroceria: string | null;
  modelo: number | null;
  repotenciacion: number | null;
  largoMts: number | null;
  kmRecorrido: number | null;
  propietarioNombre: string | null;
  propietarioDocumento: string | null;
  parentesco: string | null;
  trailerPlaca: string | null;
  gpsProveedor: string | null;
  noElegibleHasta: string | null;
  eliminadoEn: string | null;
}

export interface TipoDocumento {
  id: string;
  codigo: string;
  nombre: string;
  aplicaA: 'vehiculo' | 'conductor';
  bloqueante: boolean;
  diasAlerta: number;
}

export interface VistaDocumento {
  id: string;
  sujetoTipo: 'vehiculo' | 'conductor';
  sujetoId: string;
  tipoId: string;
  numero: string | null;
  emitidoEn: string | null;
  venceEn: string | null;
  archivoUrl: string | null;
  eliminadoEn: string | null;
  tipo: TipoDocumento | null;
  estado: EstadoDocumento;
  diasParaVencer: number | null;
}

export interface VistaHabilitacion {
  id: string;
  vehiculoId: string;
  clienteId: string;
  apto: boolean;
  motivoBloqueo: string | null;
  cliente: string | null;
  clienteNombre: string | null;
}

export interface VistaConductorFicha {
  id: string;
  nombres: string;
  documento: string;
  celular: string | null;
  correo: string | null;
  licenciaCategoria: string | null;
  licenciaVence: string | null;
  esPrincipal: boolean;
}

export interface VistaFicha {
  vehiculo: VistaVehiculoRegistro;
  asociado: VistaAsociado | null;
  conductores: VistaConductorFicha[];
  documentos: VistaDocumento[];
  habilitaciones: VistaHabilitacion[];
  semaforo: EstadoDocumento;
  enCola: MiPosicion | null;
}

export interface SemaforoPlaca {
  id: string;
  placa: string;
  clase: ClaseVehiculo;
  claseCola: ClaseCola;
  estado: EstadoVehiculo;
  asociadoNombre: string | null;
  semaforo: EstadoDocumento;
  vencidos: number;
  porVencer: number;
}

/** Evento de auditoría de `cola.override` / `cola.reset` (`GET /colas/:clase/intervenciones`). */
export interface Intervencion {
  id: string;
  at: string;
  actorId: string;
  actorRol: string;
  accion: string;
  entidad: string;
  entidadId: string;
  before: unknown;
  after: { motivo?: string; vehiculoId?: string; posicion?: number; orden?: string[] } | null;
}

// --- Viajes y recaudos (TASK-0027, spec §6.5, §9.2 Finance) ---------------------------------------

export interface Transportadora {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface TarifaSugerida {
  id: string;
  modalidad: string;
  valor: number;
}

export interface VistaRecaudo {
  id: string;
  viajeId: string;
  asociadoId: string;
  valor: number;
  estado: EstadoRecaudo;
  fechaPago: string | null;
  referencia: string | null;
  trCodigo: string;
  placa: string;
  asociadoNombre: string | null;
  asociadoDocumento: string | null;
  flete: number | null;
  valorPagado: number;
  mes: string;
}

export interface VistaViaje {
  id: string;
  trId: string;
  trCodigo: string;
  trEstado: EstadoTr;
  fechaAsignacion: string;
  placa: string;
  clase: ClaseVehiculo;
  etiqueta: string;
  cliente: string | null;
  destino: string | null;
  asociadoNombre: string | null;
  asociadoDocumento: string | null;
  conductorId: string | null;
  conductor: string | null;
  transportadoraId: string | null;
  transportadora: string | null;
  fechaCargue: string | null;
  fechaDescargue: string | null;
  lugarDescargue: string | null;
  flete: number | null;
  porcentajeAplicado: number | null;
  valorRecaudo: number | null;
  valorPagado: number;
  estado: EstadoViaje;
  notas: string | null;
  mes: string;
}

export interface DetalleViaje extends VistaViaje {
  tarifasSugeridas: TarifaSugerida[];
  recaudo: VistaRecaudo | null;
}

export interface ResumenMes {
  mes: string;
  porcentajeVigente: number;
  viajes: number;
  liquidados: number;
  flete: number;
  recaudo: number;
  pagado: number;
  pendiente: number;
  porCliente: Array<{ cliente: string; viajes: number; flete: number; recaudo: number }>;
  porPlaca: Array<{
    placa: string;
    asociado: string | null;
    viajes: number;
    flete: number;
    recaudo: number;
    pagado: number;
  }>;
}

/** `GET /documentos/alertas` (TASK-0028): documentos vencidos o por vencer, del más urgente al menos. */
export interface AlertaDocumento extends VistaDocumento {
  placa: string | null;
  conductor: string | null;
  sujeto: string;
}

/** `GET /audit` (spec §6.6): append-only; `before`/`after` son JSON libres según la acción. */
export interface EventoAuditoria {
  id: string;
  at: string;
  actorId: string;
  actorRol: string;
  accion: string;
  entidad: string;
  entidadId: string | null;
  before: unknown;
  after: unknown;
}

// --- Tablero del mes (TASK-0029, spec §9.2 Viewer) --------------------------------------------------

export interface MetricaPlaca {
  vehiculoId: string;
  placa: string;
  claseCola: ClaseCola;
  etiqueta: string;
  ofrecidas: number;
  tomadas: number;
  declinadas: number;
  expiradas: number;
  anuladas: number;
  trs: number;
  viajes: number;
  flete: number;
  recaudo: number;
  pagado: number;
}

export interface Tablero {
  mes: string;
  ofertas: {
    ofrecidas: number;
    aceptadas: number;
    declinadas: number;
    expiradas: number;
    anuladas: number;
    abiertas: number;
  };
  trs: { asignados: number; cumplidos: number; cancelados: number; noTramitar: number };
  viajes: {
    total: number;
    liquidados: number;
    flete: number;
    recaudo: number;
    pagado: number;
    pendiente: number;
  };
  porClase: Array<{ claseCola: ClaseCola; ofrecidas: number; tomadas: number; declinadas: number }>;
  declinacionesPorMotivo: Array<{ motivo: string; total: number }>;
  equidad: MetricaPlaca[];
}

/** Bandeja de avisos (spec §11, TASK-0026). */
export interface Notificacion {
  id: string;
  evento: EventoNotificacion;
  asunto: string;
  texto: string;
  datos: Record<string, unknown>;
  canales: Partial<Record<'correo' | 'whatsapp', 'enviada' | 'fallida' | 'omitida'>>;
  creadaEn: string;
  leidaEn: string | null;
}

export type { PreferenciasNotificacion };
