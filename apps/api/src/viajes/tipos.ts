import type {
  ClaseCola,
  ClaseVehiculo,
  EstadoRecaudo,
  EstadoTr,
  EstadoViaje,
} from '@asotracmet/shared';

// Viajes y recaudos (spec §6.5). Un viaje por TR; el recaudo nace al liquidar con el porcentaje
// vigente como snapshot (§20.7). El motor no interviene: es bitácora y plata, no cola.

export interface ViajeRegistro {
  id: string;
  trId: string;
  vehiculoId: string;
  conductorId: string | null;
  fechaCargue: string | null;
  fechaDescargue: string | null;
  lugarDescargue: string | null;
  transportadoraId: string | null;
  /** Tarifa de referencia elegida al crear (si hubo una sola vigente). El flete acordado manda. */
  tarifaId: string | null;
  flete: number | null;
  /** Snapshot del parámetro `recaudo_porcentaje` al liquidar. */
  porcentajeAplicado: number | null;
  valorRecaudo: number | null;
  valorPagado: number;
  estado: EstadoViaje;
  notas: string | null;
  version: number;
  creadoEn: string;
  actualizadoEn: string;
}

/** Viaje con lo que la pantalla necesita ver de una vez (TR, placa, asociado, cliente, destino). */
export interface ViajeVista extends ViajeRegistro {
  trCodigo: string;
  trEstado: EstadoTr;
  fechaAsignacion: string;
  placa: string;
  clase: ClaseVehiculo;
  claseCola: ClaseCola;
  clienteId: string | null;
  cliente: string | null;
  destinoId: string | null;
  destino: string | null;
  transportadora: string | null;
  conductor: string | null;
  asociadoId: string | null;
  asociadoNombre: string | null;
  asociadoDocumento: string | null;
  /** `YYYY-MM` de cargue o, si falta, de asignación del TR. */
  mes: string;
}

export interface RecaudoRegistro {
  id: string;
  viajeId: string;
  asociadoId: string;
  valor: number;
  estado: EstadoRecaudo;
  fechaPago: string | null;
  referencia: string | null;
  creadoEn: string;
}

export interface RecaudoVista extends RecaudoRegistro {
  trCodigo: string;
  placa: string;
  vehiculoId: string;
  asociadoNombre: string | null;
  asociadoDocumento: string | null;
  flete: number | null;
  valorPagado: number;
  mes: string;
}

export interface FiltroViajes {
  mes?: string;
  estado?: EstadoViaje;
  placa?: string;
  trId?: string;
  /** Scope `own` del asociado. */
  vehiculoIds?: readonly string[];
}

export interface FiltroRecaudos {
  mes?: string;
  estado?: EstadoRecaudo;
  placa?: string;
  vehiculoIds?: readonly string[];
}

export interface RepositorioViajes {
  viajes(filtro: FiltroViajes): Promise<ViajeVista[]>;
  viaje(id: string): Promise<ViajeVista | undefined>;
  viajePorTr(trId: string): Promise<ViajeVista | undefined>;
  guardarViaje(viaje: ViajeRegistro): Promise<void>;

  recaudos(filtro: FiltroRecaudos): Promise<RecaudoVista[]>;
  recaudo(id: string): Promise<RecaudoVista | undefined>;
  recaudoDeViaje(viajeId: string): Promise<RecaudoVista | undefined>;
  guardarRecaudo(recaudo: RecaudoRegistro): Promise<void>;
}
