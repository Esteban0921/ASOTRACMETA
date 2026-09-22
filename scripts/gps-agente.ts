import { AgenteGps } from '../apps/api/src/gps/agente/agente.js';
import { cargarConfigAgente } from '../apps/api/src/gps/agente/config.js';

// Agente GPS satélite (ADR-0007, TASK-0064). Se empaqueta en `dist/scripts/gps-agente.mjs` y corre
// en su propio contenedor (`--profile gps` de infra/compose.prod.yaml), nunca dentro de la API:
// es el único proceso que ve el archivo con las credenciales de los propietarios.
//
//   pnpm gps:agente     (desarrollo, contra `pnpm dev`)
//   node scripts/gps-agente.mjs   (imagen de producción)

const config = cargarConfigAgente();
const agente = new AgenteGps({ config });

console.log(
  JSON.stringify({
    nivel: 'info',
    mensaje: 'gps agente: arranca',
    api: config.apiUrl,
    intervaloMinutos: config.intervaloMinutos,
    proveedorForzado: config.proveedorForzado ?? null,
  }),
);

agente.iniciar();

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(senal, () => {
    void agente.detener().then(() => process.exit(0));
  });
}
