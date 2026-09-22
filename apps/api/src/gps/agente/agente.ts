import { v7 as uuidv7 } from 'uuid';
import { ClienteIngesta } from './api.js';
import { CicloGps, type ResumenCiclo } from './ciclo.js';
import { leerCuentas } from './cuentas.js';
import { crearLog, type Log } from './log.js';
import { registroProveedores } from './proveedores/registro.js';
import type { ProveedorGps } from './proveedores/tipos.js';

// Agente GPS (ADR-0007, TASK-0064): el proceso satélite. Corre fuera de la API, en su propio
// contenedor, y es el único que ve el archivo de credenciales de los propietarios.
//
// El bucle encadena `setTimeout` en vez de usar `setInterval`, por dos razones: el intervalo lo
// decide la API (parámetro `gps_intervalo_minutos`) y puede cambiar entre vueltas, y así dos
// ciclos no se solapan nunca aunque una plataforma tarde más de lo previsto. El temporizador NO se
// desreferencia: en este proceso no hay servidor ni pool que mantengan vivo el bucle de eventos,
// así que es lo único que impide que Node se cierre tras la primera vuelta.

export interface ConfigAgente {
  apiUrl: string;
  token: string;
  cuentasArchivo: string;
  intervaloMinutos: number;
  timeoutMs: number;
  concurrencia: number;
  proveedorForzado?: string;
}

export interface OpcionesAgente {
  config: ConfigAgente;
  /** Los tests inyectan los suyos; en producción son los de verdad. */
  fetch?: typeof fetch;
  ahora?: () => Date;
  nuevoId?: () => string;
  log?: Log;
  escribir?: (linea: string) => void;
  proveedores?: readonly ProveedorGps[];
  esperarReintento?: (ms: number) => Promise<void>;
}

export class AgenteGps {
  private readonly ciclo: CicloGps;
  private readonly log: Log;
  private temporizador: NodeJS.Timeout | null = null;
  private enCurso: Promise<ResumenCiclo> | null = null;
  private detenido = false;

  constructor(opciones: OpcionesAgente) {
    const { config } = opciones;
    this.log = opciones.log ?? crearLog(opciones.escribir ?? ((linea) => console.log(linea)));
    const ahora = opciones.ahora ?? (() => new Date());
    this.ciclo = new CicloGps({
      leerCuentas: () =>
        leerCuentas(config.cuentasArchivo, (aviso) => this.log({}, `gps agente: ${aviso}`, 'warn')),
      proveedores: registroProveedores(opciones.proveedores ?? []),
      api: new ClienteIngesta({
        baseUrl: config.apiUrl,
        token: config.token,
        fetch: opciones.fetch,
        timeoutMs: config.timeoutMs,
        esperar: opciones.esperarReintento,
      }),
      fetch: opciones.fetch ?? fetch,
      ahora,
      nuevoId: opciones.nuevoId ?? (() => uuidv7()),
      log: this.log,
      timeoutMs: config.timeoutMs,
      concurrencia: config.concurrencia,
      intervaloMinutos: config.intervaloMinutos,
      proveedorForzado: config.proveedorForzado,
    });
  }

  /** Una vuelta. Reentrante: si hay una en curso devuelve esa misma promesa. */
  correr(): Promise<ResumenCiclo> {
    if (this.enCurso) return this.enCurso;
    this.enCurso = this.ciclo.correr().finally(() => {
      this.enCurso = null;
    });
    return this.enCurso;
  }

  /** Primera vuelta inmediata y luego una cada `intervaloMinutos`, sin solaparse. */
  iniciar(): void {
    this.detenido = false;
    void this.vuelta();
  }

  async detener(): Promise<void> {
    this.detenido = true;
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    // Deja terminar la vuelta en curso para no cortar un envío a medias.
    await this.enCurso?.catch(() => undefined);
  }

  private async vuelta(): Promise<void> {
    try {
      await this.correr();
    } catch (error) {
      this.log(
        { error: error instanceof Error ? error.message : String(error) },
        'gps agente: la vuelta falló entera',
        'error',
      );
    }
    if (this.detenido) return;
    this.temporizador = setTimeout(() => void this.vuelta(), this.ciclo.intervaloMinutos * 60_000);
  }
}
