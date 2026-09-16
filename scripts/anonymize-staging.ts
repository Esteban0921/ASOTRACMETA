import { parseArgs } from 'node:util';
import pg from 'pg';
import { hashPassword } from '@asotracmet/api/passwords';
import { PASSWORD_DEV } from '@asotracmet/api/seed';
import { anonimizar } from '../infra/postgres/anonimizar.js';

// `pnpm db:anonymize-staging --confirmo <nombre_de_la_base>` — deja una copia sin PII (TASK-0035).
// Flujo: restaurar el backup en una base nueva (scripts/restore-db.sh) y correr esto contra ella.
// Rechaza la base de producción por nombre; exige repetir el nombre de la base destino.

const { values } = parseArgs({ options: { confirmo: { type: 'string' } } });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL apuntando a la COPIA (nunca a producción).');
  process.exit(1);
}
if (!values.confirmo) {
  console.error('Falta --confirmo <nombre de la base destino>.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
try {
  const resumen = await anonimizar(pool, {
    confirmar: values.confirmo,
    passwordHashInterno: hashPassword(PASSWORD_DEV),
  });
  console.log(
    `Base ${resumen.base} anonimizada: ${resumen.asociados} asociados, ${resumen.conductores} conductores, ` +
      `${resumen.vehiculos} vehículos, ${resumen.usuarios} usuarios, ${resumen.documentos} documentos, ` +
      `${resumen.auditoria} eventos de auditoría; ${resumen.sesionesBorradas} sesiones borradas. ` +
      `Roles internos: contraseña de desarrollo y segundo factor por configurar.`,
  );
} finally {
  await pool.end();
}
