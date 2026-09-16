import pg from 'pg';
import { claveDesdeEntorno } from '@asotracmet/api/cifrado';
import { sembrarPostgres } from '@asotracmet/api/seed-postgres';

// `pnpm db:seed` — vuelca el conjunto anonimizado de septiembre 2026 en DATABASE_URL.
// Es idempotente: se puede repetir sobre una base ya sembrada. Los secretos TOTP de la semilla
// se cifran con la misma clave que usará la API (CIFRADO_CLAVE o derivada de AUTH_SECRET).

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL (ver .env.example).');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
try {
  const resultado = await sembrarPostgres(pool, new Date(), claveDesdeEntorno(process.env));
  console.log(
    `Semilla aplicada: ${resultado.asociados} asociados, ${resultado.vehiculos} vehículos, ` +
      `${resultado.usuarios} usuarios, ${resultado.requerimientos} requerimientos.`,
  );
} finally {
  await pool.end();
}
