import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { claveDesdeEntorno } from '@asotracmet/api/cifrado';
import { hashPassword } from '@asotracmet/api/passwords';
import { PASSWORD_DEV } from '@asotracmet/api/seed';
import { sembrarPostgres } from '@asotracmet/api/seed-postgres';
import { anonimizar } from './anonimizar.js';
import { migrar } from './migrar.js';

// Copia anonimizada para staging (TASK-0035, spec §15): sin PII, sin secretos, sin sesiones, y con
// la operación intacta. Corre contra DATABASE_URL (la base de test), nunca contra producción.

const url = process.env.DATABASE_URL;

/** Base propia (`<base>_anonimizar`) para no pisar la que usan los otros tests del proyecto `db`. */
async function crearBaseAparte(urlBase: string): Promise<string> {
  const destino = new URL(urlBase);
  const nombre = `${destino.pathname.replace(/^\//, '')}_anonimizar`;
  const admin = new URL(urlBase);
  admin.pathname = '/postgres';
  const cliente = new pg.Client({ connectionString: admin.toString() });
  await cliente.connect();
  try {
    await cliente.query(`drop database if exists ${nombre}`);
    await cliente.query(`create database ${nombre}`);
  } finally {
    await cliente.end();
  }
  destino.pathname = `/${nombre}`;
  return destino.toString();
}

describe.skipIf(!url)('anonimizar (staging)', () => {
  let pool: pg.Pool;
  let base: string;

  beforeAll(async () => {
    const urlAparte = await crearBaseAparte(url!);
    await migrar(urlAparte);
    pool = new pg.Pool({ connectionString: urlAparte, max: 4 });
    base = (await pool.query<{ base: string }>('select current_database() as base')).rows[0]!.base;
    await sembrarPostgres(pool, new Date('2026-09-16T13:00:00Z'), claveDesdeEntorno(process.env));
    await pool.query(
      `update asociados set direccion = 'CALLE 1 # 2-3', cuenta_bancaria_enc = 'v1.x.y.z',
              celular = '3001234567', correo = 'real@correo.com'
        where id = (select id from asociados order by created_at, id limit 1)`,
    );
    await pool.query(
      `insert into sesiones (usuario_id, rol, token_hash, expira_en)
       select id, rol, 'hash-' || id::text, now() + interval '1 hour' from usuarios limit 3`,
    );
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
  });

  it('rechaza producción y exige confirmar el nombre de la base', async () => {
    await expect(anonimizar(pool, { confirmar: 'otra', passwordHashInterno: 'x' })).rejects.toThrow(
      /no "otra"/,
    );
  });

  it('deja la copia sin PII ni secretos y conserva la operación', async () => {
    const antes = await pool.query<{ n: string }>('select count(*) as n from vehiculos');
    const resumen = await anonimizar(pool, {
      confirmar: base,
      passwordHashInterno: hashPassword(PASSWORD_DEV),
    });
    expect(resumen.asociados).toBeGreaterThan(0);
    expect(resumen.sesionesBorradas).toBe(3);

    const asociados = await pool.query<{
      nombres: string | null;
      documento: string;
      correo: string;
      celular: string;
      direccion: string | null;
      cuenta_bancaria_enc: string | null;
    }>('select nombres, documento, correo, celular, direccion, cuenta_bancaria_enc from asociados');
    for (const a of asociados.rows) {
      expect(a.documento).toMatch(/^9\d{9}$/);
      expect(a.correo).toMatch(/@ejemplo\.test$/);
      expect(a.celular).toMatch(/^300000\d{4}$/);
      expect(a.direccion).toBeNull();
      expect(a.cuenta_bancaria_enc).toBeNull();
      expect(a.nombres ?? '').not.toContain('real');
    }
    const usuarios = await pool.query<{
      rol: string;
      email: string;
      totp_secret_enc: string | null;
      password_hash: string | null;
    }>('select rol, email, totp_secret_enc, password_hash from usuarios');
    for (const u of usuarios.rows) {
      expect(u.totp_secret_enc).toBeNull();
      if (u.rol === 'member') {
        expect(u.email).toMatch(/^member\d{3}@asotracmet\.test$/);
        expect(u.password_hash).toBeNull();
      }
    }
    expect(usuarios.rows.some((u) => u.rol !== 'member' && u.password_hash !== null)).toBe(true);
    expect((await pool.query('select count(*)::int as n from sesiones')).rows[0]).toEqual({ n: 0 });
    // La operación sigue ahí: mismas placas y cola densa.
    const despues = await pool.query<{ n: string }>('select count(*) as n from vehiculos');
    expect(despues.rows[0]?.n).toBe(antes.rows[0]?.n);
    const cola = await pool.query<{ posicion: number }>(
      "select posicion from cola_posiciones where clase_cola = 'TM-CBZ' order by posicion",
    );
    expect(cola.rows.map((r) => r.posicion)).toEqual(cola.rows.map((_, i) => i + 1));
    // El trigger append-only vuelve a estar activo ('O' = enabled).
    const trigger = await pool.query<{ tgenabled: string }>(
      "select tgenabled from pg_trigger where tgname = 'audit_log_sin_update_ni_delete'",
    );
    expect(trigger.rows[0]?.tgenabled).toBe('O');
  });
});
