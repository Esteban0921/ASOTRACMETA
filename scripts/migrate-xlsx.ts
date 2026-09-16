import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { PARAMETROS_DEFAULT } from '@asotracmet/shared';
import { claveDesdeEntorno } from '@asotracmet/api/cifrado';
import { cargarPlan, leerPorcentajeRecaudo, type ResumenCarga } from '../infra/migracion/cargar.js';
import { leerLibro } from '../infra/migracion/excel.js';
import { generarInforme, resumenPlan } from '../infra/migracion/informe.js';
import { construirPlan } from '../infra/migracion/modelo.js';

// `pnpm db:migrate-xlsx` — migración controlada del Excel legado (TASK-0025, spec §13).
//   --archivo <ruta>   xlsx a leer (o XLSX_LEGADO; por defecto RECURSOS/control de enturnamiento.xlsx)
//   --dry-run          ejecuta la carga contra DATABASE_URL y hace rollback
//   --sin-db           solo construye el plan y el informe (no necesita DATABASE_URL)
//   --informe <ruta>   dónde escribir el informe (por defecto junto al xlsx, fuera de git)
// Repetible: volver a ejecutarlo sobre una base ya cargada no duplica nada.

const { values } = parseArgs({
  options: {
    archivo: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'sin-db': { type: 'boolean', default: false },
    informe: { type: 'string' },
  },
});

const archivo = path.resolve(
  values.archivo ?? process.env.XLSX_LEGADO ?? 'RECURSOS/control de enturnamiento.xlsx',
);
if (!existsSync(archivo)) {
  console.error(`No existe el xlsx: ${archivo} (usa --archivo o XLSX_LEGADO).`);
  process.exit(1);
}
const rutaInforme = path.resolve(
  values.informe ?? path.join(path.dirname(archivo), 'informe-migracion.md'),
);

const url = process.env.DATABASE_URL;
if (!values['sin-db'] && !url) {
  console.error(
    'Falta DATABASE_URL (ver .env.example) o usa --sin-db para solo generar el informe.',
  );
  process.exit(1);
}

const pool = values['sin-db'] || !url ? null : new pg.Pool({ connectionString: url });
try {
  const porcentajeRecaudo =
    (pool ? await leerPorcentajeRecaudo(pool) : null) ?? PARAMETROS_DEFAULT.recaudo_porcentaje;
  const libro = await leerLibro(archivo);
  const plan = construirPlan(libro, { porcentajeRecaudo });

  let carga: ResumenCarga | null = null;
  if (pool) {
    carga = await cargarPlan(pool, plan, {
      dryRun: values['dry-run'],
      claveCifrado: claveDesdeEntorno(process.env),
      ahora: new Date(),
    });
  }

  mkdirSync(path.dirname(rutaInforme), { recursive: true });
  writeFileSync(rutaInforme, generarInforme(plan, carga), 'utf8');

  const resumen = resumenPlan(plan);
  console.log(`Hojas leídas: ${libro.size}. Foto del TURNERO: ${plan.fechaFoto}.`);
  console.log(
    `Plan: ${resumen.asociados} asociados, ${resumen.vehiculos} vehículos (${resumen.vehiculos_activos} activos), ` +
      `${resumen.conductores} conductores, ${resumen.tarifas} tarifas, ${resumen.posiciones} posiciones, ` +
      `${resumen.viajes} viajes, ${resumen.usuarios_member} usuarios member, ${resumen.excepciones} excepciones.`,
  );
  if (carga) {
    console.log(
      `${carga.commit ? 'Carga confirmada' : 'Dry-run (rollback)'}: ${carga.trs} TR, ${carga.recaudos} recaudos, ${carga.usuarios} usuarios.`,
    );
  } else {
    console.log('Sin base de datos: solo se generó el informe.');
  }
  console.log(`Informe: ${rutaInforme}`);
} finally {
  await pool?.end();
}
