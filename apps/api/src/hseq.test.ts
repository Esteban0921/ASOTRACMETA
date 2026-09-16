import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { IdsSecuenciales, RelojFijo } from '@asotracmet/domain';
import { construirApp } from './app.js';
import { MensajeriaMemoria } from './auth/mensajeria.js';
import { codigoTotp } from './auth/totp.js';
import { PASSWORD_DEV, secretoTotpSemilla } from './seed.js';

// HSEQ bloqueante (TASK-0028, spec §9.2 HSEQ, §14): alertas de vencimiento 30/7/vencido y el job
// nocturno que recalcula `documentos.estado`. La semilla trae UFR114 con SOAT vencido (2026-09-01)
// y QOR007 con tecnomecánica que vence el 2026-09-28; el reloj está en el 2026-09-16.

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

interface Alerta {
  placa: string | null;
  estado: string;
  diasParaVencer: number | null;
  numero: string | null;
  tipo: { codigo: string } | null;
}

beforeAll(async () => {
  reloj = new RelojFijo(INICIO);
  mensajeria = new MensajeriaMemoria(reloj);
  ({ app } = await construirApp({
    config: { logger: false, modoE2e: true, loginRateLimitMax: 10_000 },
    reloj,
    ids: new IdsSecuenciales('hseq'),
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

describe('alertas de vencimiento y job nocturno (spec §9.2 HSEQ, §14)', () => {
  it('HSEQ ve los documentos vencidos y por vencer ordenados por urgencia; viewer con número enmascarado', async () => {
    const hseq = await login('hseq@asotracmet.test');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/documentos/alertas',
      headers: conToken(hseq),
    });
    expect(res.statusCode, res.body).toBe(200);
    const alertas = res.json() as Alerta[];
    expect(alertas.map((a) => [a.placa, a.tipo?.codigo, a.estado, a.diasParaVencer])).toEqual([
      ['UFR114', 'SOAT', 'vencido', -15],
      ['QOR007', 'TECNOMEC', 'por_vencer', 12],
    ]);
    expect(alertas[0]?.numero).toBe('SOAT-114-2025');

    // Con una ventana de 7 días la tecnomecánica de QOR007 ya no alerta.
    const urgentes = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/documentos/alertas?dias=7',
        headers: conToken(hseq),
      })
    ).json() as Alerta[];
    expect(urgentes.map((a) => a.placa)).toEqual(['UFR114']);

    // El tiempo pasa: el 2026-09-29 la tecnomecánica está vencida sin que nadie escriba nada.
    reloj.fijar('2026-09-29T13:00:00Z');
    // La sesión de hseq ya caducó y su TOTP se enroló en el primer acceso: entra superadmin.
    const hseqDespues = await login('superadmin@asotracmet.test');
    const despues = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/documentos/alertas?dias=7',
        headers: conToken(hseqDespues),
      })
    ).json() as Alerta[];
    expect(despues.map((a) => [a.placa, a.estado])).toEqual([
      ['UFR114', 'vencido'],
      ['QOR007', 'vencido'],
    ]);

    const viewer = await login('viewer@asotracmet.test');
    const enmascaradas = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/documentos/alertas',
        headers: conToken(viewer),
      })
    ).json() as Alerta[];
    expect(enmascaradas[0]?.numero).toMatch(/^\*+\d{4}$/);
  });

  it('un asociado solo ve las alertas de sus placas', async () => {
    const dueno = await login('member.fst189@asotracmet.test');
    const propias = await app.inject({
      method: 'GET',
      url: '/api/v1/documentos/alertas',
      headers: conToken(dueno),
    });
    expect(propias.statusCode, propias.body).toBe(200);
    expect(propias.json()).toEqual([]);

    // Le vence el SOAT a FST189: aparece en sus alertas y la cola la deja no elegible.
    const hseq = await login('hseq@asotracmet.test');
    const tipos = (
      await app.inject({ method: 'GET', url: '/api/v1/tipos-documento', headers: conToken(hseq) })
    ).json() as Array<{ id: string; codigo: string }>;
    const soat = tipos.find((t) => t.codigo === 'SOAT')!;
    const creado = await app.inject({
      method: 'POST',
      url: '/api/v1/documentos',
      headers: conToken(hseq),
      payload: {
        sujetoTipo: 'vehiculo',
        sujetoId: 'veh-FST189',
        tipoId: soat.id,
        venceEn: '2026-09-20',
      },
    });
    expect(creado.statusCode, creado.body).toBe(201);
    const mias = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/documentos/alertas',
        headers: conToken(dueno),
      })
    ).json() as Alerta[];
    expect(mias.map((a) => [a.placa, a.estado, a.diasParaVencer])).toEqual([
      ['FST189', 'por_vencer', 4],
    ]);
  });

  it('el job de recálculo lo dispara HSEQ o superadmin, queda auditado y ops no puede', async () => {
    const hseq = await login('hseq@asotracmet.test');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs/recalcular-documentos',
      headers: conToken(hseq),
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ hoy: '2026-09-16', recalculados: 2 });

    const audit = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/audit?entidad=documentos',
        headers: conToken(hseq),
      })
    ).json() as Array<{ accion: string; after: { recalculados: number } }>;
    expect(audit[0]).toMatchObject({ accion: 'documentos.recalcular', after: { recalculados: 2 } });

    const ops = await login('ops@asotracmet.test');
    const negado = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs/recalcular-documentos',
      headers: conToken(ops),
    });
    expect(negado.statusCode).toBe(403);
  });
});
