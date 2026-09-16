import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { listarMigraciones, migrar } from './migrar.js';

const url = process.env.DATABASE_URL;

// Se omite sin DATABASE_URL para que `pnpm test` pase en cualquier máquina; CI lo ejecuta contra Postgres 16.
describe.skipIf(!url)('migraciones Postgres (spec §6, §16 RLS)', () => {
  let cliente: pg.Client;

  beforeAll(async () => {
    await migrar(url!);
    cliente = new pg.Client({ connectionString: url });
    await cliente.connect();
  });

  afterAll(async () => {
    await cliente?.end();
  });

  it('es idempotente: la segunda pasada no aplica nada', async () => {
    const segunda = await migrar(url!);
    expect(segunda.aplicadas).toEqual([]);
    expect(segunda.omitidas).toEqual(await listarMigraciones());
  });

  it('crea las tablas del modelo de datos', async () => {
    const { rows } = await cliente.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by 1",
    );
    const tablas = rows.map((r) => r.table_name);
    for (const esperada of [
      'usuarios',
      'usuario_vehiculos',
      'asociados',
      'vehiculos',
      'conductores',
      'tipos_documento',
      'documentos',
      'clientes',
      'habilitaciones',
      'destinos',
      'transportadoras',
      'tarifas',
      'parametros',
      'requerimientos',
      'cola_posiciones',
      'ofertas',
      'motivos_declinacion',
      'trs',
      'viajes',
      'metricas_mes',
      'recaudos',
      'audit_log',
    ]) {
      expect(tablas, `falta ${esperada}`).toContain(esperada);
    }
  });

  it('carga parámetros base: el 3% es un dato, no una constante', async () => {
    const { rows } = await cliente.query<{ value: number }>(
      "select value from parametros where key = 'recaudo_porcentaje'",
    );
    expect(Number(rows[0]?.value)).toBe(0.03);
  });

  it('audit_log es append-only: UPDATE y DELETE fallan', async () => {
    await cliente.query('begin');
    try {
      const { rows } = await cliente.query<{ id: string }>(
        "insert into audit_log (accion, entidad, entidad_id) values ('prueba', 'trs', 'x') returning id",
      );
      await cliente.query('savepoint s1');
      await expect(
        cliente.query("update audit_log set accion = 'otra' where id = $1", [rows[0]!.id]),
      ).rejects.toThrow(/append-only/);
      await cliente.query('rollback to savepoint s1');
      await expect(
        cliente.query('delete from audit_log where id = $1', [rows[0]!.id]),
      ).rejects.toThrow(/append-only/);
    } finally {
      await cliente.query('rollback');
    }
  });

  it('RLS: un member solo ve los TR de sus placas', async () => {
    await cliente.query('begin');
    try {
      const asociado = await cliente.query<{ id: string }>(
        "insert into asociados (tipo, nombres, documento) values ('persona', 'PRUEBA', 'doc-rls') returning id",
      );
      const usuario = await cliente.query<{ id: string }>(
        "insert into usuarios (email, nombre, rol) values ('rls@test', 'rls', 'admin_ops') returning id",
      );
      const cliente1 = await cliente.query<{ id: string }>(
        "select id from clientes where codigo = 'HLB'",
      );
      // Placas inventadas: la base puede venir sembrada (TASK-0039) y este test no debe depender de eso.
      const vehiculos = await cliente.query<{ id: string; placa: string }>(
        `insert into vehiculos (placa, clase, clase_cola, asociado_id)
         values ('ZZA111', 'CBZ', 'TM-CBZ', $1), ('ZZB222', 'TM', 'TM-CBZ', $1) returning id, placa`,
        [asociado.rows[0]!.id],
      );
      const swi750 = vehiculos.rows.find((v) => v.placa === 'ZZA111')!;
      const fst189 = vehiculos.rows.find((v) => v.placa === 'ZZB222')!;
      const requerimiento = await cliente.query<{ id: string }>(
        `insert into requerimientos (cliente_id, clase_cola, fecha_servicio, creado_por)
         values ($1, 'TM-CBZ', current_date, $2) returning id`,
        [cliente1.rows[0]!.id, usuario.rows[0]!.id],
      );
      for (const [codigo, vehiculo] of [
        ['TR-9000001', swi750.id],
        ['TR-9000002', fst189.id],
      ] as const) {
        await cliente.query(
          `insert into trs (codigo, requerimiento_id, vehiculo_id, clase_cola, cliente_id, fecha_asignacion)
           values ($1, $2, $3, 'TM-CBZ', $4, current_date)`,
          [codigo, requerimiento.rows[0]!.id, vehiculo, cliente1.rows[0]!.id],
        );
      }

      // Un superusuario/owner se salta RLS: la API opera como asotracmet_app.
      await cliente.query('set local role asotracmet_app');
      await cliente.query("select set_config('app.rol', 'member', true)");
      await cliente.query("select set_config('app.vehiculo_ids', $1, true)", [swi750.id]);
      const visibles = await cliente.query<{ codigo: string }>(
        "select codigo from trs where codigo like 'TR-90000%' order by codigo",
      );
      expect(visibles.rows.map((r) => r.codigo)).toEqual(['TR-9000001']);

      // Un member no inserta TR directamente.
      await cliente.query('savepoint s2');
      await expect(
        cliente.query(
          `insert into trs (codigo, requerimiento_id, vehiculo_id, clase_cola, cliente_id, fecha_asignacion)
           values ('TR-9000003', $1, $2, 'TM-CBZ', $3, current_date)`,
          [requerimiento.rows[0]!.id, swi750.id, cliente1.rows[0]!.id],
        ),
      ).rejects.toThrow(/row-level security/);
      await cliente.query('rollback to savepoint s2');

      await cliente.query("select set_config('app.rol', 'admin_ops', true)");
      const todos = await cliente.query("select codigo from trs where codigo like 'TR-90000%'");
      expect(todos.rowCount).toBe(2);
    } finally {
      await cliente.query('rollback');
    }
  });

  it('cola_posiciones: la unicidad de posición es diferible para renumerar en la misma transacción', async () => {
    await cliente.query('begin');
    try {
      const asociado = await cliente.query<{ id: string }>(
        "insert into asociados (tipo, nombres, documento) values ('persona', 'PRUEBA', 'doc-cola') returning id",
      );
      const vehiculos = await cliente.query<{ id: string }>(
        `insert into vehiculos (placa, clase, clase_cola, asociado_id)
         values ('ZZD444', 'MM', 'MM', $1), ('ZZE555', 'MM', 'MM', $1) returning id`,
        [asociado.rows[0]!.id],
      );
      const [a, b] = vehiculos.rows;
      // La clase puede venir sembrada: se vacía dentro de la transacción, que luego se revierte.
      await cliente.query("delete from cola_posiciones where clase_cola = 'MM'");
      await cliente.query(
        "insert into cola_posiciones (clase_cola, vehiculo_id, posicion) values ('MM', $1, 1), ('MM', $2, 2)",
        [a!.id, b!.id],
      );
      // Rotar A al final: B pasa a 1 y A a 2 sin violar la unicidad intermedia.
      await cliente.query('update cola_posiciones set posicion = 1 where vehiculo_id = $1', [
        b!.id,
      ]);
      await cliente.query('update cola_posiciones set posicion = 2 where vehiculo_id = $1', [
        a!.id,
      ]);
      const { rows } = await cliente.query<{ posicion: number }>(
        "select posicion from cola_posiciones where clase_cola = 'MM' order by posicion",
      );
      expect(rows.map((r) => r.posicion)).toEqual([1, 2]);
    } finally {
      await cliente.query('rollback');
    }
  });

  it('vehiculos: la placa se valida y clase/clase_cola son coherentes', async () => {
    await cliente.query('begin');
    try {
      await expect(
        cliente.query(
          "insert into vehiculos (placa, clase, clase_cola) values ('ZZF 666', 'CBZ', 'TM-CBZ')",
        ),
      ).rejects.toThrow(/vehiculos_placa_check/);
    } finally {
      await cliente.query('rollback');
    }
    await cliente.query('begin');
    try {
      // TM debe ir a la cola TM-CBZ; C100 es una clase de cola válida pero incoherente.
      await expect(
        cliente.query(
          "insert into vehiculos (placa, clase, clase_cola) values ('ZZF666', 'TM', 'C100')",
        ),
      ).rejects.toThrow(/vehiculos_clase_cola_coherente/);
    } finally {
      await cliente.query('rollback');
    }
  });
});
