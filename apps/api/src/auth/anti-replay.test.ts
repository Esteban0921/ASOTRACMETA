import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { IdsSecuenciales, RelojFijo } from '@asotracmet/domain';
import { construirApp } from '../app.js';
import { PASSWORD_DEV, secretoTotpSemilla } from '../seed.js';
import { MensajeriaMemoria } from './mensajeria.js';
import { codigoTotp, pasoTotpValido } from './totp.js';

// Anti-replay del código TOTP y límite de retos por usuario (TASK-0040, RFC 6238 §5.2).

const INICIO = '2026-09-16T13:00:00Z';
const OPS = 'ops@asotracmet.test';

let app: FastifyInstance;
let reloj: RelojFijo;

const conToken = (token: string) => ({ authorization: `Bearer ${token}` });
const avanzar = (segundos: number) =>
  reloj.fijar(new Date(reloj.ahora().getTime() + segundos * 1000).toISOString());

async function reto(email = OPS): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: PASSWORD_DEV },
  });
  expect(res.statusCode, res.body).toBe(200);
  return (res.json() as { challenge: string }).challenge;
}

function verificar(challenge: string, codigo: string) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/2fa/verify',
    payload: { challenge, codigo },
  });
}

beforeAll(async () => {
  reloj = new RelojFijo(INICIO);
  ({ app } = await construirApp({
    config: { logger: false, modoE2e: true, loginRateLimitMax: 10_000 },
    reloj,
    ids: new IdsSecuenciales('replay'),
    mensajeria: new MensajeriaMemoria(reloj),
  }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  reloj.fijar(INICIO);
  await app.inject({ method: 'POST', url: '/api/v1/__e2e/reset' });
});

describe('anti-replay TOTP', () => {
  it('pasoTotpValido devuelve el paso que casa dentro de la ventana', () => {
    const secreto = secretoTotpSemilla(OPS);
    const ahora = new Date(INICIO);
    const paso = Math.floor(ahora.getTime() / 1000 / 30);
    expect(pasoTotpValido(secreto, codigoTotp(secreto, ahora), ahora)).toBe(paso);
    expect(pasoTotpValido(secreto, codigoTotp(secreto, ahora, 1), ahora)).toBe(paso + 1);
    expect(pasoTotpValido(secreto, codigoTotp(secreto, ahora, -1), ahora)).toBe(paso - 1);
    expect(pasoTotpValido(secreto, codigoTotp(secreto, ahora, 2), ahora)).toBeNull();
    expect(pasoTotpValido(secreto, '000000', ahora)).toBeNull();
  });

  it('el mismo código no entra dos veces; el siguiente paso sí', async () => {
    const secreto = secretoTotpSemilla(OPS);
    const codigo = codigoTotp(secreto, reloj.ahora());
    const primera = await verificar(await reto(), codigo);
    expect(primera.statusCode, primera.body).toBe(200);

    const repetida = await verificar(await reto(), codigo);
    expect(repetida.statusCode).toBe(401);
    expect(repetida.json()).toMatchObject({ code: 'CODIGO_INVALIDO' });

    // Un paso anterior tampoco vale aunque esté dentro de la ventana.
    const anterior = await verificar(await reto(), codigoTotp(secreto, reloj.ahora(), -1));
    expect(anterior.statusCode).toBe(401);

    avanzar(30);
    const siguiente = await verificar(await reto(), codigoTotp(secreto, reloj.ahora()));
    expect(siguiente.statusCode, siguiente.body).toBe(200);
  });

  it('el código usado para entrar no sirve para re-autenticarse; el siguiente sí', async () => {
    const secreto = secretoTotpSemilla(OPS);
    const codigo = codigoTotp(secreto, reloj.ahora());
    const sesion = await verificar(await reto(), codigo);
    const token = (sesion.json() as { token: string }).token;
    const reauth = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reauth',
      headers: conToken(token),
      payload: { codigo },
    });
    expect(reauth.statusCode).toBe(401);
    expect(reauth.json()).toMatchObject({ code: 'CODIGO_INVALIDO' });

    avanzar(30);
    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reauth',
      headers: conToken(token),
      payload: { codigo: codigoTotp(secreto, reloj.ahora()) },
    });
    expect(ok.statusCode, ok.body).toBe(200);
  });

  it('con cinco retos vivos el sexto responde 429; al resolver uno se libera', async () => {
    const retos: string[] = [];
    for (let i = 0; i < 5; i += 1) retos.push(await reto());
    const sexto = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: OPS, password: PASSWORD_DEV },
    });
    expect(sexto.statusCode).toBe(429);
    expect(sexto.json()).toMatchObject({ code: 'DEMASIADOS_INTENTOS' });

    const resuelto = await verificar(retos[0]!, codigoTotp(secretoTotpSemilla(OPS), reloj.ahora()));
    expect(resuelto.statusCode, resuelto.body).toBe(200);
    expect((await reto()).length).toBeGreaterThan(10);

    // Los retos caducan a los cinco minutos: pasado ese tiempo no cuentan.
    for (let i = 0; i < 4; i += 1) await reto();
    avanzar(6 * 60);
    expect((await reto()).length).toBeGreaterThan(10);
  });

  it('el atajo e2e devuelve un código que sigue valiendo tras usar el paso actual', async () => {
    const secreto = secretoTotpSemilla(OPS);
    await verificar(await reto(), codigoTotp(secreto, reloj.ahora()));
    const siguiente = await app.inject({ method: 'GET', url: `/api/v1/__e2e/totp?email=${OPS}` });
    const { codigo } = siguiente.json() as { codigo: string };
    expect(codigo).toBe(codigoTotp(secreto, reloj.ahora(), 1));
    const entra = await verificar(await reto(), codigo);
    expect(entra.statusCode, entra.body).toBe(200);
  });
});
