import type {
  NuevaUbicacion,
  ResumenUbicaciones,
  RangoHistorial,
  RepositorioUbicaciones,
  ResultadoGuardado,
  UbicacionRegistro,
} from './tipos.js';

// Adaptador en memoria (desarrollo, tests unitarios y e2e). Estado propio, no `EstadoMemoria` del
// dominio: el motor no escribe ubicaciones, así que no hay nada que revertir con su rollback.

const LIMITE_HISTORIAL = 500;

export class UbicacionesMemoria implements RepositorioUbicaciones {
  private filas: UbicacionRegistro[] = [];

  async guardarLote(
    filas: readonly NuevaUbicacion[],
    recibidaEn: string,
  ): Promise<ResultadoGuardado> {
    let guardadas = 0;
    let duplicadas = 0;
    for (const fila of filas) {
      const repetida = this.filas.some(
        (f) => f.vehiculoId === fila.vehiculoId && f.capturadaEn === fila.capturadaEn,
      );
      if (repetida) {
        duplicadas += 1;
        continue;
      }
      this.filas.push({ ...fila, recibidaEn });
      guardadas += 1;
    }
    return { guardadas, duplicadas };
  }

  async ultimas(vehiculoIds?: readonly string[]): Promise<UbicacionRegistro[]> {
    const porVehiculo = new Map<string, UbicacionRegistro>();
    for (const fila of this.filas) {
      if (vehiculoIds && !vehiculoIds.includes(fila.vehiculoId)) continue;
      const actual = porVehiculo.get(fila.vehiculoId);
      if (!actual || fila.capturadaEn > actual.capturadaEn) porVehiculo.set(fila.vehiculoId, fila);
    }
    return [...porVehiculo.values()].map((f) => ({ ...f }));
  }

  async historial(vehiculoId: string, rango: RangoHistorial = {}): Promise<UbicacionRegistro[]> {
    return this.filas
      .filter(
        (f) =>
          f.vehiculoId === vehiculoId &&
          (rango.desde === undefined || f.capturadaEn >= rango.desde) &&
          (rango.hasta === undefined || f.capturadaEn <= rango.hasta),
      )
      .sort((a, b) => (a.capturadaEn < b.capturadaEn ? 1 : -1))
      .slice(0, rango.limite ?? LIMITE_HISTORIAL)
      .map((f) => ({ ...f }));
  }

  async purgarAnteriores(antesDe: string): Promise<number> {
    // La última lectura de cada placa sobrevive aunque sea anterior al corte (ADR-0007).
    const ultimas = new Set((await this.ultimas()).map((f) => f.id));
    const antes = this.filas.length;
    this.filas = this.filas.filter((f) => f.capturadaEn >= antesDe || ultimas.has(f.id));
    return antes - this.filas.length;
  }

  async ultimaRecepcion(): Promise<string | null> {
    return this.filas.reduce<string | null>(
      (max, f) => (max === null || f.recibidaEn > max ? f.recibidaEn : max),
      null,
    );
  }

  async suprimirDeVehiculo(vehiculoId: string): Promise<number> {
    const antes = this.filas.length;
    this.filas = this.filas.filter((f) => f.vehiculoId !== vehiculoId);
    return antes - this.filas.length;
  }

  async resumenPorVehiculo(vehiculoIds: readonly string[]): Promise<ResumenUbicaciones[]> {
    return vehiculoIds.map((vehiculoId) => {
      const suyas = this.filas.filter((f) => f.vehiculoId === vehiculoId);
      const fechas = suyas.map((f) => f.capturadaEn).sort();
      return {
        vehiculoId,
        puntos: suyas.length,
        desde: fechas[0] ?? null,
        hasta: fechas[fechas.length - 1] ?? null,
      };
    });
  }

  limpiar(): void {
    this.filas = [];
  }
}
