import type { FrescuraGps } from '@asotracmet/shared';

// Ubicación GPS por placa (ADR-0007, TASK-0062). Puerto de persistencia con dos adaptadores,
// como el resto de los módulos de la API: `memoria.ts` (desarrollo, tests, e2e) y `postgres.ts`.
// No pasa por `UnidadDeTrabajo`: no es una mutación de dominio (no toca cola, oferta, TR ni
// viaje) y el motor no conoce el GPS (RULE-010, RULE-016).

/** Una fila de `vehiculo_ubicaciones` tal como la devuelve el repositorio. */
export interface UbicacionRegistro {
  id: string;
  vehiculoId: string;
  latitud: number;
  longitud: number;
  velocidadKmh: number | null;
  rumboGrados: number | null;
  /** Reloj del GPS. */
  capturadaEn: string;
  /** Reloj de la API. */
  recibidaEn: string;
  proveedor: string;
  loteId: string | null;
}

/** Lo que la ruta de ingesta entrega ya resuelto a vehículo. */
export interface NuevaUbicacion {
  id: string;
  vehiculoId: string;
  latitud: number;
  longitud: number;
  velocidadKmh: number | null;
  rumboGrados: number | null;
  capturadaEn: string;
  proveedor: string;
  loteId: string | null;
}

export interface ResumenUbicaciones {
  vehiculoId: string;
  puntos: number;
  desde: string | null;
  hasta: string | null;
}

export interface RangoHistorial {
  desde?: string;
  hasta?: string;
  limite?: number;
}

export interface ResultadoGuardado {
  guardadas: number;
  /** Ya estaban (misma placa y mismo instante): reenviar un lote no duplica. */
  duplicadas: number;
}

export interface RepositorioUbicaciones {
  /** Idempotente por `(vehiculoId, capturadaEn)`. */
  guardarLote(filas: readonly NuevaUbicacion[], recibidaEn: string): Promise<ResultadoGuardado>;
  /** Última lectura de cada placa. Sin `vehiculoIds`, de todas las que hayan reportado. */
  ultimas(vehiculoIds?: readonly string[]): Promise<UbicacionRegistro[]>;
  /** Recorrido de una placa, del más reciente al más antiguo. */
  historial(vehiculoId: string, rango?: RangoHistorial): Promise<UbicacionRegistro[]>;
  /**
   * Borra lo anterior a `antesDe` **conservando la última lectura de cada placa**: así una placa
   * que lleva meses sin reportar sigue diciendo "sin señal desde el 3 de marzo" en vez de
   * "sin datos". Devuelve cuántas filas borró.
   */
  purgarAnteriores(antesDe: string): Promise<number>;
  /** Instante de la última recepción (gauge "agente callado"). `null` si nunca llegó un lote. */
  ultimaRecepcion(): Promise<string | null>;
  /**
   * Borra todo el historial de una placa (habeas data: el propietario retira su autorización,
   * Ley 1581 de 2012; TASK-0069). Devuelve cuántas filas borró.
   */
  suprimirDeVehiculo(vehiculoId: string): Promise<number>;
  /** Cuántos puntos y desde cuándo, para el extracto del asociado. */
  resumenPorVehiculo(vehiculoIds: readonly string[]): Promise<ResumenUbicaciones[]>;
  /** Solo en memoria: reset del modo e2e. */
  limpiar?(): void;
}

/** Vista de la API: la frescura la calcula el servidor con su reloj, no el navegador. */
export interface VistaUbicacion {
  vehiculoId: string;
  placa: string;
  latitud: number | null;
  longitud: number | null;
  velocidadKmh: number | null;
  rumboGrados: number | null;
  proveedor: string;
  capturadaEn: string;
  recibidaEn: string;
  minutosDesde: number;
  frescura: FrescuraGps;
  /** El veedor (`R*`) recibe la frescura sin coordenadas (spec §3.2, criterio §20.11). */
  enmascarada: boolean;
}
