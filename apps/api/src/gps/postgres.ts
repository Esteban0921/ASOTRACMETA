import type pg from 'pg';
import { enEscrituraPg, enLecturaPg } from '../persistencia/postgres.js';
import type {
  NuevaUbicacion,
  ResumenUbicaciones,
  RangoHistorial,
  RepositorioUbicaciones,
  ResultadoGuardado,
  UbicacionRegistro,
} from './tipos.js';

// Tabla `vehiculo_ubicaciones` (migración 0021). La escritura corre con el contexto RLS
// `gps_ingesta` que fija la ruta de ingesta; la lectura, con el rol del actor, así que RLS filtra
// las placas del asociado sin código extra (ADR-0004, ADR-0005, ADR-0007).

type Fila = Record<string, unknown>;

const LIMITE_HISTORIAL = 500;

const instante = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
const numero = (v: unknown): number => Number(v);
const numeroONulo = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);
const textoONulo = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

function aRegistro(f: Fila): UbicacionRegistro {
  return {
    id: String(f.id),
    vehiculoId: String(f.vehiculo_id),
    latitud: numero(f.latitud),
    longitud: numero(f.longitud),
    velocidadKmh: numeroONulo(f.velocidad_kmh),
    rumboGrados: numeroONulo(f.rumbo_grados),
    capturadaEn: instante(f.capturada_en),
    recibidaEn: instante(f.recibida_en),
    proveedor: String(f.proveedor),
    loteId: textoONulo(f.lote_id),
  };
}

export class UbicacionesPostgres implements RepositorioUbicaciones {
  constructor(private readonly pool: pg.Pool) {}

  async guardarLote(
    filas: readonly NuevaUbicacion[],
    recibidaEn: string,
  ): Promise<ResultadoGuardado> {
    if (filas.length === 0) return { guardadas: 0, duplicadas: 0 };
    const guardadas = await enEscrituraPg(this.pool, async (c) => {
      // Un solo `insert` con `unnest` (patrón de `guardarSaltos`): reenviar un lote no duplica
      // gracias a la unique `(vehiculo_id, capturada_en)`.
      const resultado = await c.query(
        `insert into vehiculo_ubicaciones
           (id, vehiculo_id, latitud, longitud, velocidad_kmh, rumbo_grados,
            capturada_en, recibida_en, proveedor, lote_id)
         select x.id, x.vehiculo_id, x.latitud, x.longitud, x.velocidad_kmh, x.rumbo_grados,
                x.capturada_en, $9::timestamptz, x.proveedor, x.lote_id
           from unnest($1::uuid[], $2::uuid[], $3::numeric[], $4::numeric[], $5::numeric[],
                       $6::numeric[], $7::timestamptz[], $8::text[], $10::uuid[])
                as x (id, vehiculo_id, latitud, longitud, velocidad_kmh, rumbo_grados,
                      capturada_en, proveedor, lote_id)
          on conflict (vehiculo_id, capturada_en) do nothing`,
        [
          filas.map((f) => f.id),
          filas.map((f) => f.vehiculoId),
          filas.map((f) => f.latitud),
          filas.map((f) => f.longitud),
          filas.map((f) => f.velocidadKmh),
          filas.map((f) => f.rumboGrados),
          filas.map((f) => f.capturadaEn),
          filas.map((f) => f.proveedor),
          recibidaEn,
          filas.map((f) => f.loteId),
        ],
      );
      return resultado.rowCount ?? 0;
    });
    return { guardadas, duplicadas: filas.length - guardadas };
  }

  async ultimas(vehiculoIds?: readonly string[]): Promise<UbicacionRegistro[]> {
    const filas = await enLecturaPg(
      this.pool,
      async (c) =>
        (
          await c.query<Fila>(
            `select distinct on (vehiculo_id) *
               from vehiculo_ubicaciones
              where $1::uuid[] is null or vehiculo_id = any($1::uuid[])
              order by vehiculo_id, capturada_en desc`,
            [vehiculoIds === undefined ? null : [...vehiculoIds]],
          )
        ).rows,
    );
    return filas.map(aRegistro);
  }

  async historial(vehiculoId: string, rango: RangoHistorial = {}): Promise<UbicacionRegistro[]> {
    const filas = await enLecturaPg(
      this.pool,
      async (c) =>
        (
          await c.query<Fila>(
            `select * from vehiculo_ubicaciones
              where vehiculo_id = $1
                and ($2::timestamptz is null or capturada_en >= $2::timestamptz)
                and ($3::timestamptz is null or capturada_en <= $3::timestamptz)
              order by capturada_en desc
              limit $4`,
            [
              vehiculoId,
              rango.desde ?? null,
              rango.hasta ?? null,
              rango.limite ?? LIMITE_HISTORIAL,
            ],
          )
        ).rows,
    );
    return filas.map(aRegistro);
  }

  async purgarAnteriores(antesDe: string): Promise<number> {
    return enEscrituraPg(this.pool, async (c) => {
      // La última lectura de cada placa nunca se borra (ADR-0007): la ficha debe poder decir
      // "sin señal desde el 3 de marzo" en vez de "sin datos".
      const resultado = await c.query(
        `delete from vehiculo_ubicaciones u
          where u.capturada_en < $1::timestamptz
            and u.id not in (
              select distinct on (vehiculo_id) id
                from vehiculo_ubicaciones
               order by vehiculo_id, capturada_en desc
            )`,
        [antesDe],
      );
      return resultado.rowCount ?? 0;
    });
  }

  async suprimirDeVehiculo(vehiculoId: string): Promise<number> {
    return enEscrituraPg(this.pool, async (c) => {
      const resultado = await c.query('delete from vehiculo_ubicaciones where vehiculo_id = $1', [
        vehiculoId,
      ]);
      return resultado.rowCount ?? 0;
    });
  }

  async resumenPorVehiculo(vehiculoIds: readonly string[]): Promise<ResumenUbicaciones[]> {
    if (vehiculoIds.length === 0) return [];
    const filas = await enLecturaPg(
      this.pool,
      async (c) =>
        (
          await c.query<Fila>(
            `select vehiculo_id, count(*)::int as puntos,
                    min(capturada_en) as desde, max(capturada_en) as hasta
               from vehiculo_ubicaciones
              where vehiculo_id = any($1::uuid[])
              group by vehiculo_id`,
            [[...vehiculoIds]],
          )
        ).rows,
    );
    const porId = new Map(filas.map((f) => [String(f.vehiculo_id), f]));
    return vehiculoIds.map((vehiculoId) => {
      const f = porId.get(vehiculoId);
      return {
        vehiculoId,
        puntos: f ? numero(f.puntos) : 0,
        desde: f?.desde ? instante(f.desde) : null,
        hasta: f?.hasta ? instante(f.hasta) : null,
      };
    });
  }

  async ultimaRecepcion(): Promise<string | null> {
    const fila = await enLecturaPg(
      this.pool,
      async (c) =>
        (await c.query<Fila>('select max(recibida_en) as ultima from vehiculo_ubicaciones'))
          .rows[0],
    );
    return fila?.ultima ? instante(fila.ultima) : null;
  }
}
