import type pg from 'pg';
import type { ClaseCola } from '@asotracmet/shared';
import { enEscrituraPg, enLecturaPg } from '../persistencia/postgres.js';
import type { MetricaPlaca, RepositorioMetricas, SnapshotMes } from './tipos.js';

// Tabla `metricas_mes` (migración 0014): una fila por placa y mes, upsert reproducible.

type Fila = Record<string, unknown>;
const n = (v: unknown): number => Number(v ?? 0);

const NOMBRE_ASOCIADO = `coalesce(a.razon_social, nullif(trim(coalesce(a.nombres, '') || ' ' || coalesce(a.apellidos, '')), ''))`;

export class MetricasPostgres implements RepositorioMetricas {
  constructor(private readonly pool: pg.Pool) {}

  async guardarSnapshot(snapshot: SnapshotMes): Promise<void> {
    await enEscrituraPg(this.pool, async (c) => {
      // Reproducible: el mes se reescribe entero, así una placa que ya no aparece no deja rastro viejo.
      await c.query('delete from metricas_mes where mes = $1', [snapshot.mes]);
      for (const f of snapshot.filas) {
        await c.query(
          `insert into metricas_mes
             (mes, vehiculo_id, clase_cola, ofrecidas, tomadas, declinadas, expiradas, anuladas,
              trs, viajes, flete, recaudo, pagado, generado_en)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::timestamptz)`,
          [
            snapshot.mes,
            f.vehiculoId,
            f.claseCola,
            f.ofrecidas,
            f.tomadas,
            f.declinadas,
            f.expiradas,
            f.anuladas,
            f.trs,
            f.viajes,
            f.flete,
            f.recaudo,
            f.pagado,
            snapshot.generadoEn,
          ],
        );
      }
    });
  }

  async snapshot(mes: string): Promise<SnapshotMes | undefined> {
    const filas = await enLecturaPg(
      this.pool,
      async (c) =>
        (
          await c.query<Fila>(
            `select m.*, v.placa, ${NOMBRE_ASOCIADO} as asociado_nombre
               from metricas_mes m
               join vehiculos v on v.id = m.vehiculo_id
               left join asociados a on a.id = v.asociado_id
              where m.mes = $1
              order by m.ofrecidas desc, m.tomadas desc, v.placa`,
            [mes],
          )
        ).rows,
    );
    if (filas.length === 0) return undefined;
    const generado = filas[0]?.generado_en;
    return {
      mes,
      generadoEn:
        generado instanceof Date
          ? generado.toISOString()
          : new Date(String(generado)).toISOString(),
      filas: filas.map((f): MetricaPlaca => ({
        vehiculoId: String(f.vehiculo_id),
        placa: String(f.placa),
        claseCola: String(f.clase_cola) as ClaseCola,
        etiqueta: f.asociado_nombre
          ? `${String(f.asociado_nombre)} · ${String(f.placa)}`
          : String(f.placa),
        ofrecidas: n(f.ofrecidas),
        tomadas: n(f.tomadas),
        declinadas: n(f.declinadas),
        expiradas: n(f.expiradas),
        anuladas: n(f.anuladas),
        trs: n(f.trs),
        viajes: n(f.viajes),
        flete: n(f.flete),
        recaudo: n(f.recaudo),
        pagado: n(f.pagado),
      })),
    };
  }

  async mesesConSnapshot(): Promise<string[]> {
    const filas = await enLecturaPg(
      this.pool,
      async (c) =>
        (await c.query<{ mes: string }>('select distinct mes from metricas_mes order by mes')).rows,
    );
    return filas.map((f) => f.mes);
  }
}
