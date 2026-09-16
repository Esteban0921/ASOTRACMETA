import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { IdsSecuenciales, RelojFijo } from '@asotracmet/domain';
import { construirApp } from './app.js';
import { MensajeriaMemoria } from './auth/mensajeria.js';
import { codigoTotp } from './auth/totp.js';
import { PASSWORD_DEV, secretoTotpSemilla } from './seed.js';
import { finDeMes, mesAnterior } from './rutas/tablero.js';

// Tablero del veedor y snapshot mensual de equidad (TASK-0029, spec §8.5, §9.2 Viewer, §14).

const INICIO = '2026-09-16T13:00:00Z';

let app: FastifyInstance;
let reloj: RelojFijo;
let mensajeria: MensajeriaMemoria;

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
    expect(res.statusCode, res.body).toBe(200);
    return (res.json() as { token: string }).token;
  }
  const primero = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: PASSWORD_DEV },
  });
  expect(primero.statusCode, primero.body).toBe(200);
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

interface Tablero {
  mes: string;
  ofertas: { ofrecidas: number; aceptadas: number; declinadas: number; abiertas: number };
  trs: { asignados: number; cumplidos: number };
  viajes: { total: number; recaudo: number };
  equidad: Array<{
    placa: string;
    ofrecidas: number;
    tomadas: number;
    declinadas: number;
    trs: number;
  }>;
  declinacionesPorMotivo: Array<{ motivo: string; total: number }>;
}

/** ops ofrece dos cupos: FST189 acepta el primero; TKM221 declina el segundo y se reoferta. */
async function escenario(): Promise<void> {
  const ops = await login('ops@asotracmet.test');
  const primera = await app.inject({
    method: 'POST',
    url: '/api/v1/requerimientos/req-hlb-castilla/ofertas',
    headers: conToken(ops),
  });
  expect(primera.json()).toMatchObject({ placa: 'FST189' });
  const dueno = await login('member.fst189@asotracmet.test');
  await app.inject({
    method: 'POST',
    url: `/api/v1/ofertas/${(primera.json() as { id: string }).id}/aceptar`,
    headers: conToken(dueno),
  });
  const segunda = await app.inject({
    method: 'POST',
    url: '/api/v1/requerimientos/req-hlb-castilla/ofertas',
    headers: conToken(ops),
  });
  expect(segunda.json()).toMatchObject({ placa: 'TKM221' });
  const declinada = await app.inject({
    method: 'POST',
    url: `/api/v1/ofertas/${(segunda.json() as { id: string }).id}/declinar`,
    headers: conToken(dueno),
    payload: { motivoId: 'mot-mantenimiento' },
  });
  expect(declinada.statusCode, declinada.body).toBe(200);
}

beforeAll(async () => {
  reloj = new RelojFijo(INICIO);
  mensajeria = new MensajeriaMemoria(reloj);
  ({ app } = await construirApp({
    config: { logger: false, modoE2e: true, loginRateLimitMax: 10_000 },
    reloj,
    ids: new IdsSecuenciales('tablero'),
    mensajeria,
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

describe('tablero y equidad (spec §9.2 Viewer, §14)', () => {
  it('el veedor ve ofertas, TR y equidad por placa del mes; un member no', async () => {
    await escenario();
    const viewer = await login('viewer@asotracmet.test');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tablero?mes=2026-09',
      headers: conToken(viewer),
    });
    expect(res.statusCode, res.body).toBe(200);
    const t = res.json() as Tablero;
    expect(t.ofertas).toMatchObject({ ofrecidas: 3, aceptadas: 1, declinadas: 1, abiertas: 1 });
    expect(t.trs).toMatchObject({ asignados: 1, cumplidos: 0 });
    expect(t.declinacionesPorMotivo).toEqual([{ motivo: 'Vehículo en mantenimiento', total: 1 }]);
    const porPlaca = Object.fromEntries(t.equidad.map((e) => [e.placa, e]));
    expect(porPlaca.FST189).toMatchObject({ ofrecidas: 1, tomadas: 1, declinadas: 0, trs: 1 });
    expect(porPlaca.TKM221).toMatchObject({ ofrecidas: 1, tomadas: 0, declinadas: 1 });
    expect(porPlaca.SWI750).toMatchObject({ ofrecidas: 1, tomadas: 0 });

    const otroMes = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/tablero?mes=2026-08',
        headers: conToken(viewer),
      })
    ).json() as Tablero;
    expect(otroMes.ofertas.ofrecidas).toBe(0);

    const member = await login('member.fst189@asotracmet.test');
    const negado = await app.inject({
      method: 'GET',
      url: '/api/v1/tablero?mes=2026-09',
      headers: conToken(member),
    });
    expect(negado.statusCode).toBe(403);
  });

  it('el snapshot mensual es reproducible: dos corridas dan lo mismo que el tablero en vivo y queda auditado', async () => {
    await escenario();
    const superadmin = await login('superadmin@asotracmet.test');
    const primera = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs/snapshot-metricas',
      headers: conToken(superadmin),
      payload: { mes: '2026-09' },
    });
    expect(primera.statusCode, primera.body).toBe(200);
    const segunda = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs/snapshot-metricas',
      headers: conToken(superadmin),
      payload: { mes: '2026-09' },
    });
    expect(segunda.json()).toEqual(primera.json());

    const viewer = await login('viewer@asotracmet.test');
    const guardado = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/tablero/snapshots?mes=2026-09',
        headers: conToken(viewer),
      })
    ).json() as { mes: string; filas: Tablero['equidad'] };
    const vivo = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/tablero?mes=2026-09',
        headers: conToken(viewer),
      })
    ).json() as Tablero;
    expect(guardado.filas).toEqual(vivo.equidad);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/tablero/snapshots',
          headers: conToken(viewer),
        })
      ).json(),
    ).toEqual({ meses: ['2026-09'] });

    const audit = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/audit?entidad=metricas_mes',
        headers: conToken(superadmin),
      })
    ).json() as Array<{ accion: string; entidadId: string }>;
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ accion: 'metricas.snapshot', entidadId: '2026-09' });

    // Sin mes, el job cierra el mes anterior al de hoy.
    const porDefecto = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs/snapshot-metricas',
      headers: conToken(superadmin),
    });
    expect(porDefecto.json()).toMatchObject({ mes: '2026-08', filas: [] });
    expect(mesAnterior('2026-01')).toBe('2025-12');
    expect(finDeMes('2026-02')).toBe('2026-02-28');
    expect(finDeMes('2028-02')).toBe('2028-02-29');
    expect(finDeMes('2026-09')).toBe('2026-09-30');
  });
});
