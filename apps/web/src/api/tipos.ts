import type { ClaseCola, EstadoOferta, EstadoTr, Rol } from '@asotracmet/shared';

// Proyecciones que devuelve la API (apps/api/src/vistas.ts). Se mantienen a mano hasta TASK-0024 (OpenAPI).

export interface UsuarioSesion {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  asociadoId: string | null;
  vehiculoIds: string[];
}

export interface Sesion {
  token: string;
  expiraEn: string;
  usuario: UsuarioSesion;
}

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
