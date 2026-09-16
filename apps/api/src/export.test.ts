import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { IdsSecuenciales, RelojFijo } from '@asotracmet/domain';
import { construirApp } from './app.js';
import { MensajeriaMemoria } from './auth/mensajeria.js';
import { codigoTotp } from './auth/totp.js';
import { aCsv, celdaCsv } from './rutas/export.js';
import { PASSWORD_DEV, secretoTotpSemilla } from './seed.js';

// Export CSV por rol con watermark (TASK-0034, spec §8.5, §12) y extracto habeas data (TASK-0036).

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
  // Anti-replay TOTP (TASK-0040): cada acceso con código va en un paso de 30 s distinto.
  reloj.fijar(new Date(reloj.ahora().getTime() + 30_000).toISOString());
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

/** TR de FST189 con viaje liquidado (flete 1.500.000 → recaudo 45.000). */
async function viajeLiquidado(): Promise<string> {
  const ops = await login('ops@asotracmet.test');
  const oferta = await app.inject({
    method: 'POST',
    url: '/api/v1/requerimientos/req-hlb-castilla/ofertas',
    headers: conToken(ops),
  });
  const dueno = await login('member.fst189@asotracmet.test');
  const aceptada = await app.inject({
    method: 'POST',
    url: `/api/v1/ofertas/${(oferta.json() as { id: string }).id}/aceptar`,
    headers: conToken(dueno),
  });
  const tr = (aceptada.json() as { tr: { id: string; codigo: string } }).tr;
  const finance = await login('finance@asotracmet.test');
  const viaje = await app.inject({
    method: 'POST',
    url: '/api/v1/viajes',
    headers: conToken(finance),
    payload: {
      trId: tr.id,
      fechaCargue: '2026-09-17',
      lugarDescargue: 'CASTILLA, ZONA "A"',
      flete: 1_500_000,
    },
  });
  expect(viaje.statusCode, viaje.body).toBe(201);
  await app.inject({
    method: 'POST',
    url: `/api/v1/viajes/${(viaje.json() as { id: string }).id}/liquidar`,
    headers: conToken(finance),
  });
  return tr.codigo;
}

beforeAll(async () => {
  reloj = new RelojFijo(INICIO);
  mensajeria = new MensajeriaMemoria(reloj);
  ({ app } = await construirApp({
    config: { logger: false, modoE2e: true, loginRateLimitMax: 10_000 },
    reloj,
    ids: new IdsSecuenciales('export'),
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

describe('CSV (RFC 4180)', () => {
  it('escapa comas, comillas y saltos de línea', () => {
    expect(celdaCsv('CASTILLA, ZONA "A"')).toBe('"CASTILLA, ZONA ""A"""');
    expect(celdaCsv(45_000)).toBe('45000');
    expect(celdaCsv(null)).toBe('');
    expect(aCsv(['a', 'b'], [[1, 'x,y']])).toBe('a,b\r\n1,"x,y"');
  });
});

describe('export de viajes por rol con watermark (spec §3.2, §12)', () => {
  it('finance recibe el CSV completo con marca de agua y queda auditado', async () => {
    const codigo = await viajeLiquidado();
    const finance = await login('finance@asotracmet.test');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/export/viajes.csv?mes=2026-09',
      headers: conToken(finance),
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('viajes-2026-09.csv');
    const lineas = res.body.trim().split('\r\n');
    expect(lineas[0]).toMatch(
      /^# ASOTRACMET · exportado por finance@asotracmet\.test \(admin_finance\) el 2026-09-16T13:0\d:\d\d\.000Z · uso interno, no redistribuir$/,
    );
    expect(lineas[1]).toBe(
      'tr,placa,asociado,documento,cliente,destino,lugar_descargue,fecha_cargue,fecha_descargue,transportadora,flete,porcentaje,recaudo,pagado,estado',
    );
    expect(lineas[2]).toBe(
      `${codigo},FST189,ASOCIADO 02 ANONIMIZADO,10020000202,HLB,CASTILLA LA NUEVA,"CASTILLA, ZONA ""A""",2026-09-17,,,1500000,0.03,45000,0,liquidado`,
    );
    const audit = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/audit?entidad=export',
        headers: conToken(await login('superadmin@asotracmet.test')),
      })
    ).json() as Array<{ accion: string; entidadId: string; after: { filas: number } }>;
    expect(audit[0]).toMatchObject({
      accion: 'export.viajes',
      entidadId: '2026-09',
      after: { filas: 1 },
    });
  });

  it('viewer exporta sin PII (cédula enmascarada) y member solo lo propio', async () => {
    await viajeLiquidado();
    const viewer = await login('viewer@asotracmet.test');
    const sinPii = await app.inject({
      method: 'GET',
      url: '/api/v1/export/viajes.csv?mes=2026-09',
      headers: conToken(viewer),
    });
    expect(sinPii.statusCode).toBe(200);
    expect(sinPii.body).not.toContain('10020000202');
    expect(sinPii.body).toMatch(/\*+0202/);

    const ajeno = await login('member.swi750@asotracmet.test');
    const vacio = await app.inject({
      method: 'GET',
      url: '/api/v1/export/viajes.csv?mes=2026-09',
      headers: conToken(ajeno),
    });
    expect(vacio.statusCode).toBe(200);
    expect(vacio.body.trim().split('\r\n')).toHaveLength(2); // marca de agua + cabecera

    const dueno = await login('member.fst189@asotracmet.test');
    const propio = await app.inject({
      method: 'GET',
      url: '/api/v1/export/viajes.csv?mes=2026-09',
      headers: conToken(dueno),
    });
    expect(propio.body.trim().split('\r\n')).toHaveLength(3);
    expect(propio.body).toContain('member.fst189@asotracmet.test (member)');
  });
});

describe('habeas data: extracto del asociado (spec §12)', () => {
  it('el asociado recibe sus placas, TR, viajes y recaudos con los textos de habeas data, y queda auditado', async () => {
    const codigo = await viajeLiquidado();
    const dueno = await login('member.fst189@asotracmet.test');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/extracto',
      headers: conToken(dueno),
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      generadoEn: expect.stringMatching(/^2026-09-16T13:0\d:/) as string,
      asociado: { nombre: 'ASOCIADO 02 ANONIMIZADO', documento: '10020000202' },
      placas: [{ placa: 'FST189' }, { placa: 'TKM221' }],
      trs: [{ codigo, placa: 'FST189', estado: 'cumplido' }],
      viajes: [{ tr: codigo, flete: 1_500_000, valorRecaudo: 45_000, estado: 'liquidado' }],
      recaudos: [{ tr: codigo, valor: 45_000, estado: 'pendiente' }],
    });
    const { habeasData } = res.json() as { habeasData: Record<string, string> };
    expect(Object.keys(habeasData)).toEqual(['proposito', 'acceso', 'cancelacion']);

    const superadmin = await login('superadmin@asotracmet.test');
    const audit = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/audit?entidad=asociados',
        headers: conToken(superadmin),
      })
    ).json() as Array<{ accion: string; entidadId: string }>;
    expect(audit[0]).toMatchObject({ accion: 'habeas.extracto', entidadId: 'a-02' });

    const interno = await app.inject({
      method: 'GET',
      url: '/api/v1/me/extracto',
      headers: conToken(superadmin),
    });
    expect(interno.statusCode).toBe(403);
  });
});
