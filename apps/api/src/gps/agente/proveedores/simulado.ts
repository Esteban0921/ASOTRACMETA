import type { UbicacionGps } from '@asotracmet/shared';
import type { CuentaGps } from '../cuentas.js';
import type { ContextoProveedor, ProveedorGps } from './tipos.js';

// Plataforma simulada (ADR-0007, TASK-0064): inventa posiciones plausibles sin salir a la red.
// Sirve para desarrollo, para los tests y para probar el circuito completo antes de tener las
// credenciales reales. Es determinista (RULE-020): la misma placa en la misma ventana de tiempo
// da siempre el mismo punto, así que ningún test depende del azar ni del reloj real.

/** Corredor Villavicencio → Puerto Gaitán, por donde va buena parte de la operación. */
const ORIGEN = { latitud: 4.142, longitud: -73.6266 };
const DESTINO = { latitud: 4.3122, longitud: -72.0817 };
const PASOS = 96;
const VENTANA_MS = 20 * 60_000;

/** Hash estable de la placa (FNV-1a de 32 bits): sin `Math.random`, sin estado. */
function semilla(placa: string): number {
  let h = 0x811c9dc5;
  for (const caracter of placa) {
    h ^= caracter.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}

export class GpsSimulado implements ProveedorGps {
  readonly clase = 'simulado';

  async ubicaciones(cuenta: CuentaGps, ctx: ContextoProveedor): Promise<UbicacionGps[]> {
    const ahora = ctx.ahora();
    // Inicio de la ventana de 20 minutos: dentro de una corrida el punto no se mueve, entre
    // corridas sí. Así la frescura de la web cambia como cambiaría con un GPS real.
    const ventana = Math.floor(ahora.getTime() / VENTANA_MS);
    const placas = cuenta.placas ?? [];
    return placas.map((placa) => {
      const paso = (semilla(placa) + ventana) % PASOS;
      const avance = paso / PASOS;
      const enMarcha = paso % 4 !== 0;
      return {
        placa,
        latitud: redondear(ORIGEN.latitud + (DESTINO.latitud - ORIGEN.latitud) * avance, 6),
        longitud: redondear(ORIGEN.longitud + (DESTINO.longitud - ORIGEN.longitud) * avance, 6),
        velocidadKmh: enMarcha ? redondear(40 + (paso % 45), 1) : 0,
        rumboGrados: redondear((paso * 3.75) % 360, 1),
        capturadaEn: new Date(ventana * VENTANA_MS).toISOString(),
        proveedor: 'simulado',
      };
    });
  }
}
