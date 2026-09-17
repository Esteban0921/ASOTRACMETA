import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { IdsSecuenciales, RelojFijo } from '@asotracmet/domain';
import { construirApp } from './app.js';
import { MensajeriaMemoria } from './auth/mensajeria.js';
import { codigoTotp } from './auth/totp.js';
import { PASSWORD_DEV, secretoTotpSemilla } from './seed.js';
import { SoportesLocales } from './soportes/local.js';

// Soportes HSEQ (spec §6.3, §12; TASK-0043) con el almacén local: pedir URL → subir → confirmar,
// descarga con el rol del actor (member solo de sus placas) y auditoría de subida y descarga.

const INICIO = '2026-09-16T13:00:00Z';
const PDF = Buffer.from('%PDF-1.4\n% soporte de prueba\n');

let app: FastifyInstance;
let reloj: RelojFijo;
let mensajeria: MensajeriaMemoria;
let dir: string;

const conToken = (token: string, extra: Record<string, string> = {}) => ({
  authorization: `Bearer ${token}`,
  ...extra,
});

async function login(email: string): Promise<string> {
  if (email.startsWith('member.')) {
    await app.inject({ method: 'POST', url: '/api/v1/auth/magic-link', payload: { email } });
    const enlace = mensajeria.ultimoPara(email, 'enlace')?.enlace;
    const token = new URL(enlace!).searchParams.get('token');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/magic-link/canjear',
      payload: { token },
    });
    expect(res.statusCode, res.body).toBe(200);
    return (res.json() as { token: string }).token;
  }
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

async function crearDocumento(hseq: string, sujetoId = 'veh-FST189'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/documentos',
    headers: conToken(hseq),
    payload: {
      sujetoTipo: 'vehiculo',
      sujetoId,
      tipoId: 'tipo-SOAT',
      numero: 'S-1',
      venceEn: '2027-01-01',
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  return (res.json() as { id: string }).id;
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'soportes-'));
  reloj = new RelojFijo(INICIO);
  mensajeria = new MensajeriaMemoria(reloj);
  ({ app } = await construirApp({
    config: { logger: false, modoE2e: true, loginRateLimitMax: 10_000 },
    reloj,
    ids: new IdsSecuenciales('sop'),
    mensajeria,
    soportes: new SoportesLocales(dir),
  }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  reloj.fijar(INICIO);
  await app.inject({ method: 'POST', url: '/api/v1/__e2e/reset' });
});

describe('soportes HSEQ', () => {
  it('pedir URL → subir PDF → confirmar guarda la referencia; descarga con el rol del actor; auditado', async () => {
    const hseq = await login('hseq@asotracmet.test');
    const documentoId = await crearDocumento(hseq);

    const solicitud = await app.inject({
      method: 'POST',
      url: `/api/v1/documentos/${documentoId}/soporte`,
      headers: conToken(hseq),
      payload: { nombre: 'soat.pdf', tipo: 'application/pdf', tamano: PDF.length },
    });
    expect(solicitud.statusCode, solicitud.body).toBe(200);
    const subida = solicitud.json() as {
      clave: string;
      metodo: string;
      url: string;
      cabeceras: Record<string, string>;
      expiraEn: string;
    };
    expect(subida.clave).toMatch(new RegExp(`^documentos/${documentoId}/[A-Za-z0-9_-]+\\.pdf$`));
    expect(subida).toMatchObject({
      metodo: 'PUT',
      url: `/api/v1/soportes/${subida.clave}`,
      cabeceras: { 'content-type': 'application/pdf' },
      expiraEn: '2026-09-16T13:05:30.000Z',
    });

    // Confirmar antes de subir: no hay objeto.
    const prematuro = await app.inject({
      method: 'POST',
      url: `/api/v1/documentos/${documentoId}/soporte/confirmar`,
      headers: conToken(hseq),
      payload: { clave: subida.clave },
    });
    expect(prematuro.statusCode).toBe(404);

    const puesto = await app.inject({
      method: 'PUT',
      url: subida.url,
      headers: conToken(hseq, subida.cabeceras),
      payload: PDF,
    });
    expect(puesto.statusCode, puesto.body).toBe(201);
    expect(puesto.json()).toEqual({ clave: subida.clave, tamano: PDF.length });

    const confirmado = await app.inject({
      method: 'POST',
      url: `/api/v1/documentos/${documentoId}/soporte/confirmar`,
      headers: conToken(hseq),
      payload: { clave: subida.clave },
    });
    expect(confirmado.statusCode, confirmado.body).toBe(200);
    expect(confirmado.json()).toMatchObject({
      id: documentoId,
      archivoUrl: `local://${subida.clave}`,
    });

    const descarga = await app.inject({
      method: 'GET',
      url: `/api/v1/documentos/${documentoId}/soporte`,
      headers: conToken(hseq),
    });
    expect(descarga.statusCode, descarga.body).toBe(200);
    expect(descarga.headers['content-type']).toContain('application/pdf');
    expect(descarga.headers['content-disposition']).toMatch(/^inline; filename="/);
    expect(descarga.rawPayload.equals(PDF)).toBe(true);

    // El asociado dueño de la placa lo ve; otro asociado no; nadie sin token.
    const dueno = await login('member.fst189@asotracmet.test');
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/documentos/${documentoId}/soporte`,
          headers: conToken(dueno),
        })
      ).statusCode,
    ).toBe(200);
    const ajeno = await login('member.swi750@asotracmet.test');
    const negado = await app.inject({
      method: 'GET',
      url: `/api/v1/documentos/${documentoId}/soporte`,
      headers: conToken(ajeno),
    });
    expect(negado.statusCode).toBe(403);
    expect(negado.json()).toMatchObject({ code: 'FORBIDDEN_OWN_SCOPE' });
    expect(
      (await app.inject({ method: 'GET', url: `/api/v1/documentos/${documentoId}/soporte` }))
        .statusCode,
    ).toBe(401);

    const superadmin = await login('superadmin@asotracmet.test');
    const audit = await app.inject({
      method: 'GET',
      url: '/api/v1/audit?entidad=documentos',
      headers: conToken(superadmin),
    });
    const acciones = (audit.json() as Array<{ accion: string; entidadId: string }>)
      .filter((e) => e.entidadId === documentoId)
      .map((e) => e.accion);
    expect(acciones).toContain('documento.soporte');
    expect(acciones.filter((a) => a === 'documento.descargar')).toHaveLength(2);
  });

  it('rechaza tipo no permitido, tamaño excesivo, clave ajena, cuerpo vacío y subidas de quien no edita', async () => {
    const hseq = await login('hseq@asotracmet.test');
    const documentoId = await crearDocumento(hseq);
    const otroId = await crearDocumento(hseq, 'veh-SWI750');

    const texto = await app.inject({
      method: 'POST',
      url: `/api/v1/documentos/${documentoId}/soporte`,
      headers: conToken(hseq),
      payload: { nombre: 'x.txt', tipo: 'text/plain', tamano: 10 },
    });
    expect(texto.statusCode).toBe(400);
    const enorme = await app.inject({
      method: 'POST',
      url: `/api/v1/documentos/${documentoId}/soporte`,
      headers: conToken(hseq),
      payload: { nombre: 'x.pdf', tipo: 'application/pdf', tamano: 11 * 1024 * 1024 },
    });
    expect(enorme.statusCode).toBe(400);

    const solicitud = await app.inject({
      method: 'POST',
      url: `/api/v1/documentos/${documentoId}/soporte`,
      headers: conToken(hseq),
      payload: { nombre: 'soat.pdf', tipo: 'application/pdf', tamano: PDF.length },
    });
    const { clave, url } = solicitud.json() as { clave: string; url: string };

    const vacio = await app.inject({
      method: 'PUT',
      url,
      headers: conToken(hseq, { 'content-type': 'application/pdf' }),
      payload: '',
    });
    expect(vacio.statusCode).toBe(400);
    const tipoMalo = await app.inject({
      method: 'PUT',
      url,
      headers: conToken(hseq, { 'content-type': 'text/plain' }),
      payload: 'hola',
    });
    expect([400, 415]).toContain(tipoMalo.statusCode);
    const traversal = await app.inject({
      method: 'PUT',
      url: '/api/v1/soportes/documentos/x/..%2F..%2Fetc.pdf',
      headers: conToken(hseq, { 'content-type': 'application/pdf' }),
      payload: PDF,
    });
    expect(traversal.statusCode).toBe(400);

    const ops = await login('ops@asotracmet.test');
    const sinPermiso = await app.inject({
      method: 'PUT',
      url,
      headers: conToken(ops, { 'content-type': 'application/pdf' }),
      payload: PDF,
    });
    expect(sinPermiso.statusCode).toBe(403);

    const puesto = await app.inject({
      method: 'PUT',
      url,
      headers: conToken(hseq, { 'content-type': 'application/pdf' }),
      payload: PDF,
    });
    expect(puesto.statusCode, puesto.body).toBe(201);
    // La clave pertenece a otro documento: no se puede colgar de este.
    const cruzado = await app.inject({
      method: 'POST',
      url: `/api/v1/documentos/${otroId}/soporte/confirmar`,
      headers: conToken(hseq),
      payload: { clave },
    });
    expect(cruzado.statusCode).toBe(400);
    const sinSoporte = await app.inject({
      method: 'GET',
      url: `/api/v1/documentos/${otroId}/soporte`,
      headers: conToken(hseq),
    });
    expect(sinSoporte.statusCode).toBe(404);
  });

  it('un archivo_url externo registrado a mano se sirve como redirección', async () => {
    const hseq = await login('hseq@asotracmet.test');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documentos',
      headers: conToken(hseq),
      payload: {
        sujetoTipo: 'vehiculo',
        sujetoId: 'veh-FST189',
        tipoId: 'tipo-SOAT',
        archivoUrl: 'https://archivo.example.org/soat.pdf',
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    const descarga = await app.inject({
      method: 'GET',
      url: `/api/v1/documentos/${(res.json() as { id: string }).id}/soporte`,
      headers: conToken(hseq),
    });
    expect(descarga.statusCode).toBe(302);
    expect(descarga.headers.location).toBe('https://archivo.example.org/soat.pdf');
  });
});
