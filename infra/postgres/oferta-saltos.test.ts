import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { MOTIVOS_NO_ELEGIBLE } from '@asotracmet/domain';
import { migrar } from './migrar.js';
import { urlBasePruebas } from './base-pruebas.js';

// Acta de turno en la base (brief §5, spec §21; TASK-0053): `oferta_saltos` existe, es append-only y
// RLS deja a un member ver solo sus propios saltos (y la oferta que le pasó por delante).
// Todo corre dentro de `begin … rollback`: no deja rastro en la base de pruebas.

const url = urlBasePruebas();

interface Escenario {
  ofertaId: string;
  otraOfertaId: string;
  elegidaId: string;
  saltadaPropiaId: string;
  saltadaAjenaId: string;
}

describe.skipIf(!url)('oferta_saltos: acta de turno (brief §5, spec §21)', () => {
  let cliente: pg.Client;

  beforeAll(async () => {
    await migrar(url!);
    cliente = new pg.Client({ connectionString: url });
    await cliente.connect();
  });

  afterAll(async () => {
    await cliente?.end();
  });

  /**
   * Dentro de la transacción abierta: una oferta a ZZS111 que saltó a ZZS222 (documento vencido) y
   * a ZZS333 (no habilitada), y otra oferta a ZZS333 sin saltos. Placas inventadas: la base puede
   * venir sembrada y este test no depende de eso.
   */
  async function sembrar(): Promise<Escenario> {
    const asociado = await cliente.query<{ id: string }>(
      "insert into asociados (tipo, nombres, documento) values ('persona', 'PRUEBA', 'doc-saltos') returning id",
    );
    const usuario = await cliente.query<{ id: string }>(
      "insert into usuarios (email, nombre, rol) values ('saltos@test', 'saltos', 'admin_ops') returning id",
    );
    const hlb = await cliente.query<{ id: string }>("select id from clientes where codigo = 'HLB'");
    const vehiculos = await cliente.query<{ id: string; placa: string }>(
      `insert into vehiculos (placa, clase, clase_cola, asociado_id)
       values ('ZZS111', 'TM', 'TM-CBZ', $1), ('ZZS222', 'TM', 'TM-CBZ', $1), ('ZZS333', 'CBZ', 'TM-CBZ', $1)
       returning id, placa`,
      [asociado.rows[0]!.id],
    );
    const idDe = (placa: string) => vehiculos.rows.find((v) => v.placa === placa)!.id;
    const requerimiento = await cliente.query<{ id: string }>(
      `insert into requerimientos (cliente_id, clase_cola, fecha_servicio, creado_por)
       values ($1, 'TM-CBZ', current_date, $2) returning id`,
      [hlb.rows[0]!.id, usuario.rows[0]!.id],
    );
    const oferta = await cliente.query<{ id: string }>(
      `insert into ofertas (requerimiento_id, vehiculo_id, asociado_id, ofrecida_por, expira_en)
       values ($1, $2, $3, $4, now() + interval '2 hours') returning id`,
      [requerimiento.rows[0]!.id, idDe('ZZS111'), asociado.rows[0]!.id, usuario.rows[0]!.id],
    );
    await cliente.query(
      `insert into oferta_saltos (oferta_id, vehiculo_id, posicion, motivo, detalle)
       values ($1, $2, 1, 'DOCUMENTO_VENCIDO', 'ZZS222 con documento vencido: SOAT'),
              ($1, $3, 2, 'VEHICULO_NO_HABILITADO', null)`,
      [oferta.rows[0]!.id, idDe('ZZS222'), idDe('ZZS333')],
    );
    const otraOferta = await cliente.query<{ id: string }>(
      `insert into ofertas (requerimiento_id, vehiculo_id, asociado_id, ofrecida_por, expira_en)
       values ($1, $2, $3, $4, now() + interval '2 hours') returning id`,
      [requerimiento.rows[0]!.id, idDe('ZZS333'), asociado.rows[0]!.id, usuario.rows[0]!.id],
    );
    return {
      ofertaId: oferta.rows[0]!.id,
      otraOfertaId: otraOferta.rows[0]!.id,
      elegidaId: idDe('ZZS111'),
      saltadaPropiaId: idDe('ZZS222'),
      saltadaAjenaId: idDe('ZZS333'),
    };
  }

  it('existe con sus índices, el check de los siete motivos y la unicidad (oferta, vehículo)', async () => {
    const tablas = await cliente.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' and table_name = 'oferta_saltos'",
    );
    expect(tablas.rowCount).toBe(1);
    const indices = await cliente.query<{ indexname: string }>(
      "select indexname from pg_indexes where tablename = 'oferta_saltos' order by 1",
    );
    expect(indices.rows.map((i) => i.indexname)).toEqual(
      expect.arrayContaining(['oferta_saltos_vehiculo_fecha', 'oferta_saltos_oferta']),
    );
    // El check de la base y la lista del dominio son la misma lista.
    const check = await cliente.query<{ def: string }>(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'oferta_saltos_motivo_check'",
    );
    for (const motivo of MOTIVOS_NO_ELEGIBLE) expect(check.rows[0]?.def).toContain(`'${motivo}'`);

    await cliente.query('begin');
    try {
      const e = await sembrar();
      await cliente.query('savepoint s1');
      await expect(
        cliente.query(
          "insert into oferta_saltos (oferta_id, vehiculo_id, posicion, motivo) values ($1, $2, 3, 'OTRO')",
          [e.ofertaId, e.elegidaId],
        ),
      ).rejects.toThrow(/oferta_saltos_motivo_check/);
      await cliente.query('rollback to savepoint s1');
      await expect(
        cliente.query(
          "insert into oferta_saltos (oferta_id, vehiculo_id, posicion, motivo) values ($1, $2, 9, 'TR_ACTIVO')",
          [e.ofertaId, e.saltadaPropiaId],
        ),
      ).rejects.toThrow(/oferta_saltos_oferta_id_vehiculo_id_key/);
      await cliente.query('rollback to savepoint s1');
      // El adaptador escribe con `on conflict do nothing`: repetir el acta es idempotente.
      const repetido = await cliente.query(
        `insert into oferta_saltos (oferta_id, vehiculo_id, posicion, motivo)
         values ($1, $2, 9, 'TR_ACTIVO') on conflict (oferta_id, vehiculo_id) do nothing`,
        [e.ofertaId, e.saltadaPropiaId],
      );
      expect(repetido.rowCount).toBe(0);
      const filas = await cliente.query<{ motivo: string; posicion: number }>(
        'select motivo, posicion from oferta_saltos where oferta_id = $1 order by posicion',
        [e.ofertaId],
      );
      expect(filas.rows).toEqual([
        { motivo: 'DOCUMENTO_VENCIDO', posicion: 1 },
        { motivo: 'VEHICULO_NO_HABILITADO', posicion: 2 },
      ]);
    } finally {
      await cliente.query('rollback');
    }
  });

  it('es append-only: UPDATE y DELETE fallan por trigger y el rol de la app ni siquiera tiene el privilegio', async () => {
    await cliente.query('begin');
    try {
      const e = await sembrar();
      await cliente.query('savepoint s1');
      await expect(
        cliente.query("update oferta_saltos set motivo = 'TR_ACTIVO' where oferta_id = $1", [
          e.ofertaId,
        ]),
      ).rejects.toThrow(/append-only/);
      await cliente.query('rollback to savepoint s1');
      await expect(
        cliente.query('delete from oferta_saltos where oferta_id = $1', [e.ofertaId]),
      ).rejects.toThrow(/append-only/);
      await cliente.query('rollback to savepoint s1');

      // Con el rol de la app (0009 le concede update/delete por defecto a toda tabla nueva; 0017 lo
      // revoca) el privilegio falta antes de que el trigger llegue a dispararse.
      await cliente.query('set local role asotracmet_app');
      await cliente.query("select set_config('app.rol', 'admin_ops', true)");
      await cliente.query('savepoint s2');
      await expect(
        cliente.query("update oferta_saltos set detalle = 'x' where oferta_id = $1", [e.ofertaId]),
      ).rejects.toThrow(/permission denied/);
      await cliente.query('rollback to savepoint s2');
      await expect(
        cliente.query('delete from oferta_saltos where oferta_id = $1', [e.ofertaId]),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await cliente.query('rollback');
    }
  });

  it('RLS: un member ve solo los saltos de sus placas, lee la oferta que le pasó por delante y no inserta', async () => {
    await cliente.query('begin');
    try {
      const e = await sembrar();
      // Un superusuario/owner se salta RLS: la API opera como asotracmet_app.
      await cliente.query('set local role asotracmet_app');
      await cliente.query("select set_config('app.rol', 'member', true)");
      await cliente.query("select set_config('app.vehiculo_ids', $1, true)", [e.saltadaPropiaId]);

      const propios = await cliente.query<{ vehiculo_id: string; motivo: string }>(
        'select vehiculo_id, motivo from oferta_saltos where oferta_id = $1',
        [e.ofertaId],
      );
      expect(propios.rows).toEqual([
        { vehiculo_id: e.saltadaPropiaId, motivo: 'DOCUMENTO_VENCIDO' },
      ]);

      // Ve la oferta que la saltó (política ofertas_lectura_saltada), no la de otra placa.
      const ofertas = await cliente.query<{ id: string }>(
        'select id from ofertas where id = any($1::uuid[])',
        [[e.ofertaId, e.otraOfertaId]],
      );
      expect(ofertas.rows.map((o) => o.id)).toEqual([e.ofertaId]);

      // Ni con su propia placa: escribe solo el motor.
      await cliente.query('savepoint s2');
      await expect(
        cliente.query(
          "insert into oferta_saltos (oferta_id, vehiculo_id, posicion, motivo) values ($1, $2, 5, 'TR_ACTIVO')",
          [e.otraOfertaId, e.saltadaPropiaId],
        ),
      ).rejects.toThrow(/row-level security/);
      await cliente.query('rollback to savepoint s2');

      await cliente.query("select set_config('app.rol', 'admin_ops', true)");
      const todos = await cliente.query('select 1 from oferta_saltos where oferta_id = $1', [
        e.ofertaId,
      ]);
      expect(todos.rowCount).toBe(2);
      const inserta = await cliente.query(
        "insert into oferta_saltos (oferta_id, vehiculo_id, posicion, motivo) values ($1, $2, 5, 'TR_ACTIVO')",
        [e.otraOfertaId, e.saltadaPropiaId],
      );
      expect(inserta.rowCount).toBe(1);
    } finally {
      await cliente.query('rollback');
    }
  });
});
