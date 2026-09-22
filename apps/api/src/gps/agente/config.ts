import { TOKEN_GPS_DESARROLLO } from '../../config.js';
import type { ConfigAgente } from './agente.js';

// Configuración del agente GPS (ADR-0007, TASK-0064). Todo por entorno, como el resto del
// proyecto: aquí no hay ninguna credencial de plataforma, solo la ruta del archivo que las tiene.

export function cargarConfigAgente(env: NodeJS.ProcessEnv = process.env): ConfigAgente {
  return {
    apiUrl: env.GPS_API_URL ?? 'http://localhost:3001',
    // El mismo token de desarrollo que acepta la API en modo memoria: `pnpm dev` + `pnpm gps:agente`
    // funciona sin configurar nada. En producción es obligatorio y viene del entorno.
    token: env.GPS_INGESTA_TOKEN ?? TOKEN_GPS_DESARROLLO,
    cuentasArchivo: env.GPS_CUENTAS_ARCHIVO ?? '/run/secrets/gps-cuentas.json',
    intervaloMinutos: Number(env.GPS_INTERVALO_MINUTOS ?? 20),
    timeoutMs: Number(env.GPS_TIMEOUT_MS ?? 15_000),
    concurrencia: Number(env.GPS_CONCURRENCIA ?? 3),
    proveedorForzado: env.GPS_PROVEEDOR_FORZADO ? env.GPS_PROVEEDOR_FORZADO : undefined,
  };
}
