import { createServer, type Server } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { IdsSecuenciales, RelojFijo } from '@asotracmet/domain';
import { construirApp } from './app.js';
import { MensajeriaMemoria } from './auth/mensajeria.js';
import { codigoTotp } from './auth/totp.js';
import { LockMemoria } from './lock-cola.js';
import { RegistroMetricas, pingRedis } from './observabilidad.js';
import { PASSWORD_DEV, secretoTotpSemilla } from './seed.js';

// Observabilidad (TASK-0030, spec §15): /readyz con Redis, /metrics en formato Prometheus y
// contadores de negocio (COLA_LOCKED, latencia de ofrecer, declinaciones, ofertas abiertas).

const INICIO = '2026-09-16T13:00:00Z';

/** Redis de mentira: contesta +PONG a PING. */
function redisFalso(): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((socket) => {
      socket.on('data', (d) => {
        if (d.toString().includes('PING')) socket.write('+PONG\r\n');
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      resolve({ server, url: `redis://127.0.0.1:${port}` });
    });
  });
}

describe('registro de métricas (formato Prometheus)', () => {
  it('expone contadores, histograma de ofrecer y gauges en vivo', () => {
    const r = new RegistroMetricas();
    r.httpRespuesta(200);
    r.httpRespuesta(201);
    r.httpRespuesta(409);
    r.errorDominio('COLA_LOCKED');
    r.errorDominio('COLA_LOCKED');
    r.ofrecer(80, true);
    r.ofrecer(3000, false);
    r.declinacion();
    const texto = r.exponer({ ofertasAbiertas: 2, declinacionesHoy: 1 });
    expect(texto).toContain('asotracmet_http_respuestas_total{clase="2xx"} 2');
    expect(texto).toContain('asotracmet_http_respuestas_total{clase="4xx"} 1');
    expect(texto).toContain('asotracmet_cola_locked_total 2');
    expect(texto).toContain('asotracmet_ofrecer_latencia_ms_bucket{le="100"} 1');
    expect(texto).toContain('asotracmet_ofrecer_latencia_ms_bucket{le="+Inf"} 2');
    expect(texto).toContain('asotracmet_ofrecer_latencia_ms_sum 3080');
    expect(texto).toContain('asotracmet_ofrecer_errores_total 1');
    expect(texto).toContain('asotracmet_declinaciones_total 1');
    expect(texto).toContain('asotracmet_ofertas_abiertas 2');
    expect(texto).toContain('asotracmet_declinaciones_hoy 1');
    expect(texto).toMatch(/# TYPE asotracmet_ofrecer_latencia_ms histogram/);
  });

  it('hace PING a Redis por TCP y distingue caído de vivo', async () => {
    const { server, url } = await redisFalso();
    try {
      expect(await pingRedis(url)).toMatchObject({ ok: true });
      server.close();
    } finally {
      server.close();
    }
    const caido = await pingRedis('redis://127.0.0.1:1', 300);
    expect(caido.ok).toBe(false);
    expect(caido.error).toBeDefined();
    expect(await pingRedis('no-es-url')).toMatchObject({ ok: false, error: 'REDIS_URL inválida' });
  });
});

describe('/readyz y /metrics en la API', () => {
  let app: FastifyInstance;
  let reloj: RelojFijo;
  let mensajeria: MensajeriaMemoria;
  let redis: { server: Server; url: string };
  const conToken = (token: string) => ({ authorization: `Bearer ${token}` });

  async function login(email: string): Promise<string> {
    if (email.startsWith('member.')) {
      await app.inject({ method: 'POST', url: '/api/v1/auth/magic-link', payload: { email } });
      const enlace = mensajeria.ultimoPara(email)?.enlace;
      const token = new URL(enlace!).searchParams.get('token');
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/magic-link/canjear',
        payload: { token },
      });
      return (res.json() as { token: string }).token;
    }
    // Anti-replay TOTP (TASK-0040): cada acceso con código va en un paso de 30 s distinto.
    reloj.fijar(new Date(reloj.ahora().getTime() + 30_000).toISOString());
    const primero = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: PASSWORD_DEV },
    });
    const reto = primero.json() as { paso: string; challenge: string; secret?: string };
    const secreto = reto.paso === 'totp_enrolar' ? reto.secret! : secretoTotpSemilla(email);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/verify',
      payload: { challenge: reto.challenge, codigo: codigoTotp(secreto, reloj.ahora()) },
    });
    expect(res.statusCode, res.body).toBe(200);
    return (res.json() as { token: string }).token;
  }

  beforeAll(async () => {
    redis = await redisFalso();
    reloj = new RelojFijo(INICIO);
    mensajeria = new MensajeriaMemoria(reloj);
    ({ app } = await construirApp({
      config: {
        logger: false,
        modoE2e: true,
        loginRateLimitMax: 10_000,
        redisUrl: redis.url,
        metricsToken: 'token-de-prueba',
      },
      reloj,
      ids: new IdsSecuenciales('obs'),
      mensajeria,
      // El Redis de mentira solo contesta PING: el lock de cola (TASK-0020) va en memoria.
      lock: new LockMemoria(),
    }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    redis.server.close();
  });

  beforeEach(async () => {
    reloj.fijar(INICIO);
    await app.inject({ method: 'POST', url: '/api/v1/__e2e/reset' });
  });

  it('readyz reporta la base y el ping a Redis', async () => {
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, db: { ok: true }, redis: { ok: true } });
  });

  it('metrics exige el token, cuenta respuestas, COLA_LOCKED, latencia de ofrecer y declinaciones', async () => {
    expect((await app.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(401);
    const ops = await login('ops@asotracmet.test');
    // 3 intentos en paralelo sobre la misma clase: uno entra, los otros chocan con el lock (§7.7).
    const intentos = await Promise.all(
      [1, 2, 3].map(() =>
        app.inject({
          method: 'POST',
          url: '/api/v1/requerimientos/req-hlb-castilla/ofertas',
          headers: conToken(ops),
        }),
      ),
    );
    const creadas = intentos.filter((r) => r.statusCode === 201);
    const bloqueadas = intentos.filter((r) => r.statusCode === 409);
    expect(creadas.length).toBeGreaterThanOrEqual(1);
    const dueno = await login('member.fst189@asotracmet.test');
    const oferta = creadas[0]!.json() as { id: string };
    const declinada = await app.inject({
      method: 'POST',
      url: `/api/v1/ofertas/${oferta.id}/declinar`,
      headers: conToken(dueno),
      payload: { motivoId: 'mot-mantenimiento' },
    });
    expect(declinada.statusCode, declinada.body).toBe(200);

    const res = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: conToken('token-de-prueba'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    const texto = res.body;
    expect(texto).toMatch(/asotracmet_http_respuestas_total\{clase="2xx"\} [1-9]\d*/);
    expect(texto).toMatch(new RegExp(`asotracmet_cola_locked_total ${bloqueadas.length}`));
    expect(texto).toMatch(/asotracmet_ofrecer_latencia_ms_count [1-9]/);
    expect(texto).toContain('asotracmet_declinaciones_total 1');
    expect(texto).toContain('asotracmet_declinaciones_hoy 1');
    expect(texto).toMatch(/asotracmet_ofertas_abiertas [0-9]+/);
  });
});
