import type { ClaseCola } from '@asotracmet/shared';

// Tablero del mes y snapshot de equidad (spec §8.5 `GET /tablero`, §9.2 Viewer, §14 `metricas_mes`).

/** Equidad por placa: cuántas veces le tocó y cuántas tomó (spec §9.2 Viewer). */
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

export interface SnapshotMes {
  mes: string;
  generadoEn: string;
  filas: MetricaPlaca[];
}

export interface RepositorioMetricas {
  guardarSnapshot(snapshot: SnapshotMes): Promise<void>;
  snapshot(mes: string): Promise<SnapshotMes | undefined>;
  mesesConSnapshot(): Promise<string[]>;
}
