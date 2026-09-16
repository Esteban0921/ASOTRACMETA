import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

// Runner de migraciones SQL (RULE-019): archivos append-only, aplicados en orden, cada uno en su transacción.

// En la imagen de producción el runner va empaquetado y los .sql se copian aparte (TASK-0032).
const DIR_MIGRACIONES =
  process.env.MIGRACIONES_DIR ??
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export interface ResultadoMigracion {
  aplicadas: string[];
  omitidas: string[];
}

export async function listarMigraciones(dir = DIR_MIGRACIONES): Promise<string[]> {
  const archivos = await readdir(dir);
  return archivos.filter((a) => a.endsWith('.sql')).sort();
}

export async function migrar(
  databaseUrl: string,
  dir = DIR_MIGRACIONES,
): Promise<ResultadoMigracion> {
  const cliente = new pg.Client({ connectionString: databaseUrl });
  await cliente.connect();
  try {
    await cliente.query(
      'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
    );
    const { rows } = await cliente.query<{ name: string }>('select name from schema_migrations');
    const yaAplicadas = new Set(rows.map((r) => r.name));
    const aplicadas: string[] = [];
    const omitidas: string[] = [];
    for (const archivo of await listarMigraciones(dir)) {
      if (yaAplicadas.has(archivo)) {
        omitidas.push(archivo);
        continue;
      }
      const sql = await readFile(path.join(dir, archivo), 'utf8');
      await cliente.query('begin');
      try {
        await cliente.query(sql);
        await cliente.query('insert into schema_migrations (name) values ($1)', [archivo]);
        await cliente.query('commit');
        aplicadas.push(archivo);
      } catch (error) {
        await cliente.query('rollback');
        throw new Error(
          `Migración ${archivo} falló: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    }
    return { aplicadas, omitidas };
  } finally {
    await cliente.end();
  }
}
