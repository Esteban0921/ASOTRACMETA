import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { migrar } from './migrar.js';
import { urlBasePruebas } from './base-pruebas.js';

// Ubicación GPS en la base (ADR-0007, migración 0021; TASK-0062): la tabla existe, no admite
// credenciales, es idempotente por placa e instante, solo la escribe el rol `gps_ingesta` y un
// member ve únicamente sus placas. Todo dentro de `begin … rollback`: no deja rastro.

const url = urlBasePruebas();

interface Escenario {
  propioId: string;
  ajenoId: string;
}

const HACE_UN_ANO = "now() - interval '400 days'";

describe.skipIf(!url)('vehiculo_ubicaciones: ubicación GPS (ADR-0007)', () => {
  let cliente: pg.Client;

  beforeAll(async () => {
    await migrar(url!);
    cliente = new pg.Client({ connectionString: url });
    await cliente.connect();
  });

  afterAll(async () => {
    await cliente?.end();
  });

  /** Dos placas inventadas del mismo asociado: el test no depende de la semilla. */
  async function sembrar(): Promise<Escenario> {
    const asociado = await cliente.query<{ id: string }>(
      "insert into asociados (tipo, nombres, documento) values ('persona', 'PRUEBA', 'doc-gps') returning id",
    );
    const vehiculos = await cliente.query<{ id: string; placa: string }>(
      `insert into vehiculos (placa, clase, clase_cola, asociado_id)
       values ('ZZG111', 'TM', 'TM-CBZ', $1), ('ZZG222', 'TM', 'TM-CBZ', $1)
       returning id, placa`,
      [asociado.rows[0]!.id],
    );
    const idDe = (placa: string) => vehiculos.rows.find((v) => v.placa === placa)!.id;
    return { propioId: idDe('ZZG111'), ajenoId: idDe('ZZG222') };
  }

  async function insertar(
    vehiculoId: string,
    capturadaEn: string,
    lat = 4.1421,
  ): Promise<pg.QueryResult> {
    return cliente.query(
      `insert into vehiculo_ubicaciones
         (id, vehiculo_id, latitud, longitud, capturada_en, recibida_en, proveedor)
       values (gen_random_uuid(), $1, $2, -73.6266, ${capturadaEn}, now(), 'SATRACK')`,
      [vehiculoId, lat],
    );
  }

  it('la tabla no tiene ninguna columna de credenciales (spec §12, §20.9)', async () => {
    const columnas = await cliente.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name = 'vehiculo_ubicaciones'`,
    );
    const nombres = columnas.rows.map((c) => c.column_name);
    expect(nombres).toContain('capturada_en');
    for (const prohibida of ['usuario', 'clave', 'password', 'contrasena', 'token']) {
      expect(nombres.some((n) => n.includes(prohibida))).toBe(false);
    }
  });

  it('es idempotente por placa e instante: el mismo lote reenviado no duplica', async () => {
    await cliente.query('begin');
    try {
      const e = await sembrar();
      await insertar(e.propioId, "'2026-09-16T13:00:00Z'");
      await cliente.query('savepoint s1');
      await expect(insertar(e.propioId, "'2026-09-16T13:00:00Z'")).rejects.toThrow(
        /duplicate key|unique/i,
      );
      await cliente.query('rollback to savepoint s1');
      const { rows } = await cliente.query<{ total: string }>(
        'select count(*) as total from vehiculo_ubicaciones where vehiculo_id = $1',
        [e.propioId],
      );
      expect(Number(rows[0]!.total)).toBe(1);
    } finally {
      await cliente.query('rollback');
    }
  });

  it('`distinct on` devuelve la última lectura de cada placa', async () => {
    await cliente.query('begin');
    try {
      const e = await sembrar();
      await insertar(e.propioId, "'2026-09-16T10:00:00Z'", 1.1);
      await insertar(e.propioId, "'2026-09-16T13:00:00Z'", 2.2);
      await insertar(e.ajenoId, "'2026-09-16T11:00:00Z'", 3.3);
      const { rows } = await cliente.query<{ vehiculo_id: string; latitud: string }>(
        `select distinct on (vehiculo_id) vehiculo_id, latitud
           from vehiculo_ubicaciones
          where vehiculo_id = any($1::uuid[])
          order by vehiculo_id, capturada_en desc`,
        [[e.propioId, e.ajenoId]],
      );
      expect(rows).toHaveLength(2);
      expect(Number(rows.find((r) => r.vehiculo_id === e.propioId)!.latitud)).toBeCloseTo(2.2);
    } finally {
      await cliente.query('rollback');
    }
  });

  it('la purga conserva la última lectura de cada placa aunque sea anterior al corte', async () => {
    await cliente.query('begin');
    try {
      const e = await sembrar();
      // Dos lecturas viejas de la misma placa: la más nueva de las dos sobrevive.
      await insertar(e.propioId, `${HACE_UN_ANO} - interval '1 hour'`, 1.1);
      await insertar(e.propioId, HACE_UN_ANO, 2.2);
      const borradas = await cliente.query(
        `delete from vehiculo_ubicaciones u
          where u.vehiculo_id = $1
            and u.capturada_en < now() - interval '30 days'
            and u.id not in (
              select distinct on (vehiculo_id) id from vehiculo_ubicaciones
               order by vehiculo_id, capturada_en desc
            )`,
        [e.propioId],
      );
      expect(borradas.rowCount).toBe(1);
      const quedan = await cliente.query<{ latitud: string }>(
        'select latitud from vehiculo_ubicaciones where vehiculo_id = $1',
        [e.propioId],
      );
      expect(quedan.rows).toHaveLength(1);
      expect(Number(quedan.rows[0]!.latitud)).toBeCloseTo(2.2);
    } finally {
      await cliente.query('rollback');
    }
  });

  it('RLS: el rol `gps_ingesta` inserta ubicaciones pero no toca la cola ni las ofertas', async () => {
    await cliente.query('begin');
    try {
      const e = await sembrar();
      await cliente.query('set local role asotracmet_app');
      await cliente.query("select set_config('app.rol', 'gps_ingesta', true)");

      await expect(insertar(e.propioId, "'2026-09-16T13:00:00Z'")).resolves.toBeTruthy();

      // El token de ingesta no es una llave maestra: fuera de su tabla no tiene autoridad.
      await cliente.query('savepoint s2');
      await expect(
        cliente.query(
          `insert into cola_posiciones (clase_cola, vehiculo_id, posicion) values ('TM-CBZ', $1, 999)`,
          [e.propioId],
        ),
      ).rejects.toThrow(/row-level security/i);
      await cliente.query('rollback to savepoint s2');
    } finally {
      await cliente.query('rollback');
    }
  });

  it('RLS: `sistema` no inserta ubicaciones (solo la ruta de ingesta lo hace)', async () => {
    await cliente.query('begin');
    try {
      const e = await sembrar();
      await cliente.query('set local role asotracmet_app');
      await cliente.query("select set_config('app.rol', 'sistema', true)");
      await expect(insertar(e.propioId, "'2026-09-16T13:00:00Z'")).rejects.toThrow(
        /row-level security/i,
      );
    } finally {
      await cliente.query('rollback');
    }
  });

  it('RLS: un member ve solo las ubicaciones de sus placas y no escribe', async () => {
    await cliente.query('begin');
    try {
      const e = await sembrar();
      await insertar(e.propioId, "'2026-09-16T13:00:00Z'");
      await insertar(e.ajenoId, "'2026-09-16T13:00:00Z'");
      await cliente.query('set local role asotracmet_app');
      await cliente.query("select set_config('app.rol', 'member', true)");
      await cliente.query("select set_config('app.vehiculo_ids', $1, true)", [e.propioId]);

      const visibles = await cliente.query<{ vehiculo_id: string }>(
        'select vehiculo_id from vehiculo_ubicaciones where vehiculo_id = any($1::uuid[])',
        [[e.propioId, e.ajenoId]],
      );
      expect(visibles.rows.map((r) => r.vehiculo_id)).toEqual([e.propioId]);

      await cliente.query('savepoint s3');
      await expect(insertar(e.propioId, "'2026-09-16T14:00:00Z'")).rejects.toThrow(
        /row-level security/i,
      );
      await cliente.query('rollback to savepoint s3');
    } finally {
      await cliente.query('rollback');
    }
  });

  it('una lectura del GPS no se corrige: `asotracmet_app` no tiene UPDATE sobre la tabla', async () => {
    const { rows } = await cliente.query<{ puede: boolean }>(
      `select has_table_privilege('asotracmet_app', 'vehiculo_ubicaciones', 'UPDATE') as puede`,
    );
    expect(rows[0]!.puede).toBe(false);
    const insertar = await cliente.query<{ puede: boolean }>(
      `select has_table_privilege('asotracmet_app', 'vehiculo_ubicaciones', 'INSERT') as puede`,
    );
    expect(insertar.rows[0]!.puede).toBe(true);
  });
});
