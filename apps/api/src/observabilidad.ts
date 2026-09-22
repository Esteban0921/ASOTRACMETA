import { connect } from 'node:net';
import { metrics, type Counter, type Histogram } from '@opentelemetry/api';

// Observabilidad (spec §15, TASK-0030): métricas de operación en formato Prometheus (`/metrics`) y,
// si hay telemetría OTLP configurada, las mismas métricas vía OpenTelemetry. Sin PII: solo conteos.

const PREFIJO = 'asotracmet';
const BUCKETS_MS = [25, 50, 100, 250, 500, 1000, 2500, 5000] as const;

export interface GaugesEnVivo {
  ofertasAbiertas: number;
  declinacionesHoy: number;
  /** Segundos desde el último lote del agente GPS; `null` si nunca llegó uno (ADR-0007). */
  gpsUltimoLoteSegundos?: number | null;
  /** Placas activas sin señal: distingue "agente caído" de "camión sin reportar". */
  gpsPlacasSinSenal?: number;
}

function claseHttp(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}

/** Registro en memoria del proceso (una instancia hoy; con varias, cada una expone la suya). */
export class RegistroMetricas {
  private readonly inicio = Date.now();
  private readonly httpPorClase = new Map<string, number>();
  private readonly erroresPorCodigo = new Map<string, number>();
  private readonly latenciaOfrecer = {
    count: 0,
    sum: 0,
    max: 0,
    buckets: new Map<number, number>(),
  };
  private ofrecerErrores = 0;
  private declinaciones = 0;
  private lockRedisErrores = 0;
  private gpsLotes = 0;
  private readonly gpsUbicaciones = new Map<string, number>();

  private readonly otelHttp: Counter;
  private readonly otelErrores: Counter;
  private readonly otelOfrecer: Histogram;
  private readonly otelDeclinaciones: Counter;
  private readonly otelLockRedis: Counter;
  private readonly otelGpsLotes: Counter;
  private readonly otelGpsUbicaciones: Counter;

  constructor() {
    for (const b of BUCKETS_MS) this.latenciaOfrecer.buckets.set(b, 0);
    // Instrumentos OTel: sin SDK registrado son no-op; con OTLP configurado se exportan (§15).
    const meter = metrics.getMeter(`${PREFIJO}-api`);
    this.otelHttp = meter.createCounter(`${PREFIJO}.http.respuestas`);
    this.otelErrores = meter.createCounter(`${PREFIJO}.errores.dominio`);
    this.otelOfrecer = meter.createHistogram(`${PREFIJO}.ofrecer.latencia`, { unit: 'ms' });
    this.otelDeclinaciones = meter.createCounter(`${PREFIJO}.declinaciones`);
    this.otelLockRedis = meter.createCounter(`${PREFIJO}.lock_redis.errores`);
    this.otelGpsLotes = meter.createCounter(`${PREFIJO}.gps.lotes`);
    this.otelGpsUbicaciones = meter.createCounter(`${PREFIJO}.gps.ubicaciones`);
  }

  httpRespuesta(status: number): void {
    const clase = claseHttp(status);
    this.httpPorClase.set(clase, (this.httpPorClase.get(clase) ?? 0) + 1);
    this.otelHttp.add(1, { clase });
  }

  /** Errores de negocio con código estable; `COLA_LOCKED` es el que vigila la spec. */
  errorDominio(codigo: string): void {
    this.erroresPorCodigo.set(codigo, (this.erroresPorCodigo.get(codigo) ?? 0) + 1);
    this.otelErrores.add(1, { codigo });
  }

  ofrecer(latenciaMs: number, ok: boolean): void {
    if (!ok) this.ofrecerErrores += 1;
    const h = this.latenciaOfrecer;
    h.count += 1;
    h.sum += latenciaMs;
    h.max = Math.max(h.max, latenciaMs);
    for (const b of BUCKETS_MS) if (latenciaMs <= b) h.buckets.set(b, (h.buckets.get(b) ?? 0) + 1);
    this.otelOfrecer.record(latenciaMs, { resultado: ok ? 'ok' : 'error' });
  }

  declinacion(): void {
    this.declinaciones += 1;
    this.otelDeclinaciones.add(1);
  }

  /** Redis no respondió al tomar o soltar `cola:{clase}`: la operación siguió con Postgres (TASK-0020). */
  lockRedisError(): void {
    this.lockRedisErrores += 1;
    this.otelLockRedis.add(1);
  }

  /**
   * Un lote del agente GPS (ADR-0007). Solo conteos por resultado: ni placas ni coordenadas, que
   * son dato personal del conductor (spec §12).
   */
  gpsLote(resultado: { guardadas: number; duplicadas: number; ignoradas: number }): void {
    this.gpsLotes += 1;
    this.otelGpsLotes.add(1);
    // Solo estos tres, nombrados a mano: el resultado de la ingesta trae además el id del lote y
    // el intervalo, que no son conteos y no tienen nada que hacer en una métrica.
    const conteos = {
      guardadas: resultado.guardadas,
      duplicadas: resultado.duplicadas,
      ignoradas: resultado.ignoradas,
    };
    for (const [clave, valor] of Object.entries(conteos)) {
      if (!Number.isFinite(valor) || valor <= 0) continue;
      this.gpsUbicaciones.set(clave, (this.gpsUbicaciones.get(clave) ?? 0) + valor);
      this.otelGpsUbicaciones.add(valor, { resultado: clave });
    }
  }

  get resumen() {
    return {
      http: Object.fromEntries(this.httpPorClase),
      errores: Object.fromEntries(this.erroresPorCodigo),
      ofrecer: {
        ...this.latenciaOfrecer,
        buckets: Object.fromEntries(this.latenciaOfrecer.buckets),
      },
      declinaciones: this.declinaciones,
      lockRedisErrores: this.lockRedisErrores,
      gpsLotes: this.gpsLotes,
      gpsUbicaciones: Object.fromEntries(this.gpsUbicaciones),
    };
  }

  /** Exposición Prometheus (texto). Los gauges en vivo los calcula quien expone (consultas). */
  exponer(enVivo: GaugesEnVivo): string {
    const lineas: string[] = [];
    const metrica = (nombre: string, tipo: string, ayuda: string) => {
      lineas.push(`# HELP ${PREFIJO}_${nombre} ${ayuda}`, `# TYPE ${PREFIJO}_${nombre} ${tipo}`);
    };
    metrica('http_respuestas_total', 'counter', 'Respuestas HTTP por clase de estado');
    for (const [clase, n] of [...this.httpPorClase].sort()) {
      lineas.push(`${PREFIJO}_http_respuestas_total{clase="${clase}"} ${n}`);
    }
    metrica(
      'errores_dominio_total',
      'counter',
      'Errores de negocio por código estable (COLA_LOCKED, etc.)',
    );
    for (const [codigo, n] of [...this.erroresPorCodigo].sort()) {
      lineas.push(`${PREFIJO}_errores_dominio_total{codigo="${codigo}"} ${n}`);
    }
    lineas.push(`${PREFIJO}_cola_locked_total ${this.erroresPorCodigo.get('COLA_LOCKED') ?? 0}`);
    metrica('ofrecer_latencia_ms', 'histogram', 'Latencia de la transacción ofrecer (ms)');
    for (const b of BUCKETS_MS) {
      lineas.push(
        `${PREFIJO}_ofrecer_latencia_ms_bucket{le="${b}"} ${this.latenciaOfrecer.buckets.get(b) ?? 0}`,
      );
    }
    lineas.push(
      `${PREFIJO}_ofrecer_latencia_ms_bucket{le="+Inf"} ${this.latenciaOfrecer.count}`,
      `${PREFIJO}_ofrecer_latencia_ms_sum ${this.latenciaOfrecer.sum}`,
      `${PREFIJO}_ofrecer_latencia_ms_count ${this.latenciaOfrecer.count}`,
    );
    metrica('ofrecer_errores_total', 'counter', 'Intentos de ofrecer que terminaron en error');
    lineas.push(`${PREFIJO}_ofrecer_errores_total ${this.ofrecerErrores}`);
    metrica('declinaciones_total', 'counter', 'Declinaciones desde el arranque del proceso');
    lineas.push(`${PREFIJO}_declinaciones_total ${this.declinaciones}`);
    metrica(
      'lock_redis_errores_total',
      'counter',
      'Fallos de Redis al tomar o soltar cola:{clase} (se siguió con Postgres)',
    );
    lineas.push(`${PREFIJO}_lock_redis_errores_total ${this.lockRedisErrores}`);
    metrica('ofertas_abiertas', 'gauge', 'Ofertas abiertas ahora');
    lineas.push(`${PREFIJO}_ofertas_abiertas ${enVivo.ofertasAbiertas}`);
    metrica('declinaciones_hoy', 'gauge', 'Declinaciones del día (zona de la operación)');
    lineas.push(`${PREFIJO}_declinaciones_hoy ${enVivo.declinacionesHoy}`);
    // Ubicación GPS (ADR-0007): sin placas ni coordenadas, solo conteos.
    metrica('gps_lotes_total', 'counter', 'Lotes de ubicaciones recibidos del agente GPS');
    lineas.push(`${PREFIJO}_gps_lotes_total ${this.gpsLotes}`);
    metrica('gps_ubicaciones_total', 'counter', 'Ubicaciones recibidas por resultado');
    for (const [resultado, valor] of this.gpsUbicaciones) {
      lineas.push(`${PREFIJO}_gps_ubicaciones_total{resultado="${resultado}"} ${valor}`);
    }
    if (enVivo.gpsUltimoLoteSegundos !== undefined && enVivo.gpsUltimoLoteSegundos !== null) {
      metrica('gps_ultimo_lote_segundos', 'gauge', 'Segundos desde el último lote del agente GPS');
      lineas.push(`${PREFIJO}_gps_ultimo_lote_segundos ${enVivo.gpsUltimoLoteSegundos}`);
    }
    if (enVivo.gpsPlacasSinSenal !== undefined) {
      metrica('gps_placas_sin_senal', 'gauge', 'Placas activas sin señal GPS');
      lineas.push(`${PREFIJO}_gps_placas_sin_senal ${enVivo.gpsPlacasSinSenal}`);
    }
    metrica('uptime_seconds', 'gauge', 'Segundos desde el arranque');
    lineas.push(`${PREFIJO}_uptime_seconds ${Math.round((Date.now() - this.inicio) / 1000)}`);
    return `${lineas.join('\n')}\n`;
  }
}

export interface ResultadoPing {
  ok: boolean;
  ms: number;
  error?: string;
}

/** `PING` a Redis por TCP sin cliente (bastan `+PONG`): readiness de la fase producto (§15). */
export function pingRedis(url: string, timeoutMs = 500): Promise<ResultadoPing> {
  const inicio = Date.now();
  return new Promise((resolve) => {
    let destino: URL;
    try {
      destino = new URL(url);
    } catch {
      resolve({ ok: false, ms: 0, error: 'REDIS_URL inválida' });
      return;
    }
    const socket = connect({ host: destino.hostname, port: Number(destino.port || 6379) });
    let terminado = false;
    const fin = (resultado: ResultadoPing) => {
      if (terminado) return;
      terminado = true;
      socket.destroy();
      resolve({ ...resultado, ms: Date.now() - inicio });
    };
    socket.setTimeout(timeoutMs, () => fin({ ok: false, ms: 0, error: 'timeout' }));
    socket.once('error', (e) => fin({ ok: false, ms: 0, error: e.message }));
    socket.once('connect', () => {
      const auth = destino.password ? `AUTH ${decodeURIComponent(destino.password)}\r\n` : '';
      socket.write(`${auth}PING\r\n`);
    });
    socket.on('data', (datos) => {
      const texto = datos.toString('utf8');
      if (texto.includes('+PONG')) fin({ ok: true, ms: 0 });
      else if (texto.startsWith('-')) fin({ ok: false, ms: 0, error: texto.trim() });
    });
  });
}
