import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import type { ClaseCola } from '@asotracmet/shared';
import { ErrorDominio, type Transaccion, type UnidadDeTrabajo } from '@asotracmet/domain';

// Lock distribuido `cola:{clase}` (spec §7.7, TASK-0020). Postgres ya serializa cada clase con un
// advisory lock de transacción; este lock lo adelanta a Redis para que, con varias instancias de
// API, el segundo coordinador reciba `COLA_LOCKED` antes de abrir transacción y para que el
// runbook tenga una clave visible (`TTL cola:TM-CBZ`). Sin Redis, o con Redis caído, se degrada al
// lock de Postgres: nunca bloquea la operación por sí solo (fail-open contado en métricas).

export interface AlmacenLock {
  /** `SET clave token NX PX ttl`: `true` si se tomó. */
  adquirir(clave: string, token: string, ttlMs: number): Promise<boolean>;
  /** Borra la clave solo si el token coincide (compare-and-delete): nunca suelta un lock ajeno. */
  liberar(clave: string, token: string): Promise<boolean>;
  cerrar(): Promise<void>;
}

const LIBERAR_SI_ES_MIO =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

export interface OpcionesLockRedis {
  /** Errores de conexión (ioredis los emite en cada reintento); sin oyente serían no manejados. */
  alError?: (error: Error) => void;
  /** Un Redis que acepta la conexión pero no contesta no debe colgar la cola: falla y se degrada. */
  commandTimeoutMs?: number;
  connectTimeoutMs?: number;
}

/**
 * Lock sobre Redis real (`ioredis`). Conecta perezosamente, no encola comandos si está caído y
 * cada comando tiene tiempo máximo: cualquier fallo se traduce en fail-open, nunca en espera.
 */
export class LockRedis implements AlmacenLock {
  private readonly redis: Redis;
  private conexion: Promise<void> | null = null;

  constructor(url: string, opciones: OpcionesLockRedis = {}) {
    this.redis = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: opciones.connectTimeoutMs ?? 1000,
      commandTimeout: opciones.commandTimeoutMs ?? 1000,
    });
    this.redis.on('error', (error: Error) => opciones.alError?.(error));
  }

  async adquirir(clave: string, token: string, ttlMs: number): Promise<boolean> {
    await this.listo();
    return (await this.redis.set(clave, token, 'PX', ttlMs, 'NX')) === 'OK';
  }

  async liberar(clave: string, token: string): Promise<boolean> {
    await this.listo();
    return (await this.redis.eval(LIBERAR_SI_ES_MIO, 1, clave, token)) === 1;
  }

  /** Milisegundos que le quedan a la clave (-2 si no existe): lo que mira el runbook. */
  async ttlMs(clave: string): Promise<number> {
    await this.listo();
    return this.redis.pttl(clave);
  }

  async cerrar(): Promise<void> {
    this.redis.disconnect();
  }

  private listo(): Promise<void> {
    if (this.redis.status === 'ready') return Promise.resolve();
    if (this.redis.status === 'wait') {
      this.conexion = this.redis.connect().finally(() => {
        this.conexion = null;
      });
    }
    // Conectando o reconectando: quien lo disparó espera; el resto falla rápido (fail-open).
    return this.conexion ?? Promise.resolve();
  }
}

/** Lock en memoria: tests y desarrollo sin Redis. Mismo contrato (NX + TTL + compare-and-delete). */
export class LockMemoria implements AlmacenLock {
  private readonly claves = new Map<string, { token: string; vence: number }>();

  constructor(private readonly ahora: () => number = () => Date.now()) {}

  async adquirir(clave: string, token: string, ttlMs: number): Promise<boolean> {
    const actual = this.claves.get(clave);
    if (actual && actual.vence > this.ahora()) return false;
    this.claves.set(clave, { token, vence: this.ahora() + ttlMs });
    return true;
  }

  async liberar(clave: string, token: string): Promise<boolean> {
    const actual = this.claves.get(clave);
    if (!actual || actual.token !== token) return false;
    this.claves.delete(clave);
    return true;
  }

  async cerrar(): Promise<void> {
    this.claves.clear();
  }

  /** Token que tiene la clave ahora mismo, o `null` si está libre o vencida. */
  dueno(clave: string): string | null {
    const actual = this.claves.get(clave);
    return actual && actual.vence > this.ahora() ? actual.token : null;
  }
}

export interface OpcionesLockCola {
  /** Vida máxima del lock: cubre una transacción colgada sin dejar la cola trabada para siempre. */
  ttlMs: number;
  /** Se llama cuando Redis falla al tomar o soltar; la operación sigue con el lock de Postgres. */
  alFallar?: (error: Error, fase: 'adquirir' | 'liberar') => void;
  prefijo?: string;
}

/**
 * Envuelve la unidad de trabajo: `ejecutar(clase, fn)` toma `cola:{clase}` en Redis durante la
 * transacción y lo suelta al terminar (también si `fn` lanza). Si la clave está tomada responde
 * `COLA_LOCKED` con `details.origen = 'redis'` sin abrir transacción.
 */
export function conLockDistribuido(
  uow: UnidadDeTrabajo,
  lock: AlmacenLock,
  opciones: OpcionesLockCola,
): UnidadDeTrabajo {
  const prefijo = opciones.prefijo ?? 'cola:';
  const ejecutar = async <T>(
    claseCola: ClaseCola | null,
    fn: (tx: Transaccion) => Promise<T>,
  ): Promise<T> => {
    if (!claseCola) return uow.ejecutar(claseCola, fn);
    const clave = `${prefijo}${claseCola}`;
    const token = randomUUID();
    let tomado: boolean;
    try {
      tomado = await lock.adquirir(clave, token, opciones.ttlMs);
    } catch (error) {
      opciones.alFallar?.(error as Error, 'adquirir');
      return uow.ejecutar(claseCola, fn);
    }
    if (!tomado) {
      throw new ErrorDominio('COLA_LOCKED', `Cola ${claseCola} bloqueada por otra operación`, {
        claseCola,
        origen: 'redis',
      });
    }
    try {
      return await uow.ejecutar(claseCola, fn);
    } finally {
      await lock
        .liberar(clave, token)
        .catch((error: unknown) => opciones.alFallar?.(error as Error, 'liberar'));
    }
  };
  return new Proxy(uow, {
    get(target, propiedad, receptor) {
      if (propiedad === 'ejecutar') return ejecutar;
      const valor = Reflect.get(target, propiedad, receptor) as unknown;
      return typeof valor === 'function'
        ? (valor as (...a: unknown[]) => unknown).bind(target)
        : valor;
    },
  });
}
