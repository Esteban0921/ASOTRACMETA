import { migrar } from '../infra/postgres/migrar.js';

// `pnpm db:migrate` — aplica infra/postgres/migrations contra DATABASE_URL.
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL (ver .env.example).');
  process.exit(1);
}

const resultado = await migrar(url);
for (const nombre of resultado.omitidas) console.log(`= ${nombre} (ya aplicada)`);
for (const nombre of resultado.aplicadas) console.log(`+ ${nombre}`);
console.log(
  `Listo: ${resultado.aplicadas.length} aplicadas, ${resultado.omitidas.length} omitidas.`,
);
