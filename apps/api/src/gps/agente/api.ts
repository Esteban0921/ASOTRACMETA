import {
  ResultadoIngestaGpsSchema,
  type LoteUbicacionesGps,
  type ResultadoIngestaGps,
} from '@asotracmet/shared';

// Cliente de la ingesta (ADR-0007, TASK-0064): lo único que el agente le manda a la API. Un lote
// por cuenta, con el token de servicio. `fetch` es inyectable para poder probarlo sin red.

export type MotivoFalloIngesta = 'token' | 'rechazado' | 'red';

export class ErrorIngesta extends Error {
  constructor(
    readonly motivo: MotivoFalloIngesta,
    mensaje: string,
    readonly status?: number,
  ) {
    super(mensaje);
    this.name = 'ErrorIngesta';
  }
}

export interface OpcionesIngesta {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Espera entre el envío y su único reintento; los tests la sustituyen por una inmediata. */
  esperar?: (ms: number) => Promise<void>;
  reintentoMs?: number;
}

const dormir = (ms: number): Promise<void> =>
  new Promise((resolver) => {
    setTimeout(resolver, ms).unref?.();
  });

export class ClienteIngesta {
  private readonly llamar: typeof fetch;
  private readonly url: string;

  constructor(private readonly opciones: OpcionesIngesta) {
    this.llamar = opciones.fetch ?? fetch;
    this.url = `${opciones.baseUrl.replace(/\/$/, '')}/api/v1/gps/ubicaciones`;
  }

  /**
   * Envía un lote. Un solo reintento: la API se reinicia en segundos durante un despliegue y
   * perder una muestra de veinte minutos no es grave, pero insistir sí puede serlo. Como la
   * ingesta es idempotente por placa e instante, reintentar nunca duplica.
   */
  async enviar(lote: LoteUbicacionesGps): Promise<ResultadoIngestaGps> {
    try {
      return await this.intentar(lote);
    } catch (error) {
      // Un token rechazado o un lote inválido no mejoran esperando.
      if (error instanceof ErrorIngesta && error.motivo !== 'red') throw error;
      await (this.opciones.esperar ?? dormir)(this.opciones.reintentoMs ?? 30_000);
      return this.intentar(lote);
    }
  }

  private async intentar(lote: LoteUbicacionesGps): Promise<ResultadoIngestaGps> {
    let respuesta: Response;
    try {
      respuesta = await this.llamar(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.opciones.token}`,
        },
        body: JSON.stringify(lote),
        signal: AbortSignal.timeout(this.opciones.timeoutMs ?? 15_000),
      });
    } catch (error) {
      throw new ErrorIngesta('red', `La API no respondió: ${mensajeDe(error)}`);
    }
    if (respuesta.status === 401) {
      throw new ErrorIngesta('token', 'La API rechazó el token de ingesta', 401);
    }
    if (!respuesta.ok) {
      throw new ErrorIngesta('rechazado', `La API respondió ${respuesta.status}`, respuesta.status);
    }
    return ResultadoIngestaGpsSchema.parse(await respuesta.json());
  }
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
