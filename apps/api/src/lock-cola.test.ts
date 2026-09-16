import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ErrorDominio, IdsSecuenciales, RelojFijo } from '@asotracmet/domain';
import type { Transaccion, UnidadDeTrabajo } from '@asotracmet/domain';
import { construirApp } from './app.js';
import { MensajeriaMemoria } from './auth/mensajeria.js';
import { codigoTotp } from './auth/totp.js';
import { LockMemoria, LockRedis, conLockDistribuido } from './lock-cola.js';
import { PASSWORD_DEV, secretoTotpSemilla } from './seed.js';

// Lock distribuido `cola:{clase}` (spec §7.7, TASK-0020): NX + TTL + compare-and-delete, fail-open
// si Redis no responde. La parte contra Redis real solo corre con REDIS_URL (como `test:db`).

const REDIS_URL = process.env.REDIS_URL;
const INICIO = '2026-09-16T13:00:00Z';

function uowFalso(): UnidadDeTrabajo & { clases: Array<string | null> } {
  return {
    clases: [],
    async ejecutar(claseCola, fn) {
      this.clases.push(claseCola);
      return fn({} as Transaccion);
    },
    async leer(fn) {
      return fn({} as Transaccion);
    },
  };
}

describe('conLockDistribuido', () => {
  let ahora = Date.parse(INICIO);
  let lock: LockMemoria;
  let base: ReturnType<typeof uowFalso>;

  beforeEach(() => {
    ahora = Date.parse(INICIO);
    lock = new LockMemoria(() => ahora);
    base = uowFalso();
  });

  it('toma cola:{clase} mientras dura la transacción y lo suelta al terminar, también si falla', async () => {
    const uow = conLockDistribuido(base, lock, { ttlMs: 10_000 });
    const resultado = await uow.ejecutar('TM-CBZ', async () => {
      expect(lock.dueno('cola:TM-CBZ')).not.toBeNull();
      return 'ok';
    });
    expect(resultado).toBe('ok');
    expect(lock.dueno('cola:TM-CBZ')).toBeNull();

    await expect(
      uow.ejecutar('TM-CBZ', async () => {
        throw new Error('se cae');
      }),
    ).rejects.toThrow('se cae');
    expect(lock.dueno('cola:TM-CBZ')).toBeNull();
    expect(base.clases).toEqual(['TM-CBZ', 'TM-CBZ']);
  });

  it('si otra instancia tiene la clave responde COLA_LOCKED sin abrir transacción', async () => {
    const uow = conLockDistribuido(base, lock, { ttlMs: 10_000 });
    await lock.adquirir('cola:TM-CBZ', 'otra-instancia', 10_000);
    const error = await uow.ejecutar('TM-CBZ', async () => 'no').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorDominio);
    expect(error as ErrorDominio).toMatchObject({
      code: 'COLA_LOCKED',
      details: { claseCola: 'TM-CBZ', origen: 'redis' },
    });
    expect(base.clases).toEqual([]);
    // Otra clase no se bloquea; sin clase no hay lock.
    expect(await uow.ejecutar('C100', async () => 'sí')).toBe('sí');
    expect(await uow.ejecutar(null, async () => 'sí')).toBe('sí');
    expect(base.clases).toEqual(['C100', null]);
    // Ese lock ajeno sigue intacto: el envoltorio nunca suelta lo que no tomó.
    expect(lock.dueno('cola:TM-CBZ')).toBe('otra-instancia');
  });

  it('el TTL vence solo un lock huérfano y el envoltorio no suelta un token ajeno', async () => {
    const uow = conLockDistribuido(base, lock, { ttlMs: 5_000 });
    await lock.adquirir('cola:MM', 'colgada', 5_000);
    await expect(uow.ejecutar('MM', async () => 1)).rejects.toMatchObject({ code: 'COLA_LOCKED' });
    ahora += 5_001;
    expect(await uow.ejecutar('MM', async () => 2)).toBe(2);
    expect(await lock.liberar('cola:MM', 'colgada')).toBe(false);
  });

  it('con Redis caído se degrada al lock de Postgres y avisa (fail-open)', async () => {
    const fallos: string[] = [];
    const roto = {
      adquirir: async () => {
        throw new Error('ECONNREFUSED');
      },
      liberar: async () => {
        throw new Error('ECONNREFUSED');
      },
      cerrar: async () => undefined,
    };
    const uow = conLockDistribuido(base, roto, {
      ttlMs: 10_000,
      alFallar: (error, fase) => fallos.push(`${fase}:${error.message}`),
    });
    expect(await uow.ejecutar('TM-CBZ', async () => 'sigue')).toBe('sigue');
    expect(base.clases).toEqual(['TM-CBZ']);
    expect(fallos).toEqual(['adquirir:ECONNREFUSED']);
  });

  it('un Redis que acepta la conexión pero no contesta no cuelga la cola: falla rápido y se degrada', async () => {
    const mudo: Server = createServer(() => undefined);
    await new Promise<void>((r) => mudo.listen(0, '127.0.0.1', r));
    const { port } = mudo.address() as { port: number };
    const redis = new LockRedis(`redis://127.0.0.1:${port}`, {
      commandTimeoutMs: 200,
      connectTimeoutMs: 200,
    });
    const fallos: string[] = [];
    const uow = conLockDistribuido(base, redis, {
      ttlMs: 10_000,
      alFallar: (_error, fase) => fallos.push(fase),
    });
    try {
      const inicio = Date.now();
      expect(await uow.ejecutar('TM-CBZ', async () => 'sigue')).toBe('sigue');
      expect(Date.now() - inicio).toBeLessThan(3_000);
      expect(fallos).toEqual(['adquirir']);
      expect(base.clases).toEqual(['TM-CBZ']);
    } finally {
      await redis.cerrar();
      mudo.close();
    }
  });
});

describe.skipIf(!REDIS_URL)('LockRedis contra Redis real (REDIS_URL)', () => {
  const prefijo = `test:${randomUUID()}:cola:`;
  let uno: LockRedis;
  let dos: LockRedis;

  beforeAll(() => {
    uno = new LockRedis(REDIS_URL!);
    dos = new LockRedis(REDIS_URL!);
  });

  afterAll(async () => {
    await uno.cerrar();
    await dos.cerrar();
  });

  it('SET NX PX + compare-and-delete: solo un cliente entra, el TTL libera, nadie suelta lo ajeno', async () => {
    const clave = `${prefijo}TM-CBZ`;
    expect(await uno.adquirir(clave, 'a', 500)).toBe(true);
    expect(await dos.adquirir(clave, 'b', 500)).toBe(false);
    expect(await dos.liberar(clave, 'b')).toBe(false);
    expect(await uno.ttlMs(clave)).toBeGreaterThan(0);
    expect(await uno.liberar(clave, 'a')).toBe(true);
    expect(await uno.ttlMs(clave)).toBe(-2);

    expect(await dos.adquirir(clave, 'b', 100)).toBe(true);
    await new Promise((r) => setTimeout(r, 150));
    expect(await uno.adquirir(clave, 'a', 500)).toBe(true);
    expect(await uno.liberar(clave, 'a')).toBe(true);
  });

  it('la API responde 409 COLA_LOCKED {origen: redis} mientras otra instancia tiene la clave', async () => {
    const reloj = new RelojFijo(INICIO);
    const mensajeria = new MensajeriaMemoria(reloj);
    const lock = new LockRedis(REDIS_URL!);
    const { app } = await construirApp({
      config: {
        logger: false,
        modoE2e: true,
        loginRateLimitMax: 10_000,
        lockPrefijo: prefijo,
        metricsToken: 'token-metrics',
      },
      reloj,
      ids: new IdsSecuenciales('lock'),
      mensajeria,
      lock,
    });
    await app.ready();
    try {
      const token = await entrar(app, reloj, 'ops@asotracmet.test');
      const otraInstancia = `${prefijo}TM-CBZ`;
      expect(await dos.adquirir(otraInstancia, 'instancia-2', 5_000)).toBe(true);
      const bloqueada = await app.inject({
        method: 'POST',
        url: '/api/v1/requerimientos/req-hlb-castilla/ofertas',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(bloqueada.statusCode, bloqueada.body).toBe(409);
      expect(bloqueada.json()).toMatchObject({
        code: 'COLA_LOCKED',
        details: { claseCola: 'TM-CBZ', origen: 'redis' },
      });
      expect(await dos.liberar(otraInstancia, 'instancia-2')).toBe(true);
      const creada = await app.inject({
        method: 'POST',
        url: '/api/v1/requerimientos/req-hlb-castilla/ofertas',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(creada.statusCode, creada.body).toBe(201);
      // La transacción terminó: la clave ya no existe.
      expect(await uno.ttlMs(otraInstancia)).toBe(-2);
      const metricas = await app.inject({
        method: 'GET',
        url: '/metrics',
        headers: { authorization: 'Bearer token-metrics' },
      });
      expect(metricas.body).toContain('asotracmet_lock_redis_errores_total 0');
    } finally {
      await app.close();
    }
  });
});

async function entrar(app: FastifyInstance, reloj: RelojFijo, email: string): Promise<string> {
  // Anti-replay TOTP (TASK-0040): cada acceso con código va en un paso de 30 s distinto.
  reloj.fijar(new Date(reloj.ahora().getTime() + 30_000).toISOString());
  const primero = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: PASSWORD_DEV },
  });
  const reto = primero.json() as { challenge: string };
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/2fa/verify',
    payload: {
      challenge: reto.challenge,
      codigo: codigoTotp(secretoTotpSemilla(email), reloj.ahora()),
    },
  });
  expect(res.statusCode, res.body).toBe(200);
  return (res.json() as { token: string }).token;
}
