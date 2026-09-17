import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { IdsSecuenciales, RelojFijo } from '@asotracmet/domain';
import { construirApp, type AppConstruida } from './app.js';
import { MensajeriaMemoria, type Mensajeria } from './auth/mensajeria.js';
import { codigoTotp } from './auth/totp.js';
import { WorkerNotificaciones } from './notificaciones/worker.js';
import type { Notificacion } from './notificaciones/tipos.js';
import { PASSWORD_DEV, secretoTotpSemilla } from './seed.js';

// Notificaciones de producto (spec §11, §14; ADR-0006): outbox → worker → bandeja + canales
// según preferencias; jobs por tiempo idempotentes; un canal caído no bloquea la bandeja.

const INICIO = '2026-09-16T13:00:00Z';
const MEMBER = 'member.fst189@asotracmet.test';
const OPS = 'ops@asotracmet.test';

let app: FastifyInstance;
let construida: AppConstruida;
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

async function ofrecer(ops: string): Promise<{ id: string; expiraEn: string; vehiculoId: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/requerimientos/req-hlb-castilla/ofertas',
    headers: conToken(ops),
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { id: string; expiraEn: string; vehiculoId: string };
}

async function bandeja(token: string, consulta = ''): Promise<Notificacion[]> {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/me/notificaciones${consulta}`,
    headers: conToken(token),
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as Notificacion[];
}

beforeAll(async () => {
  reloj = new RelojFijo(INICIO);
  mensajeria = new MensajeriaMemoria(reloj);
  construida = await construirApp({
    config: { logger: false, modoE2e: true, loginRateLimitMax: 10_000 },
    reloj,
    ids: new IdsSecuenciales('notif'),
    mensajeria,
  });
  app = construida.app;
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  reloj.fijar(INICIO);
  await app.inject({ method: 'POST', url: '/api/v1/__e2e/reset' });
});

describe('notificaciones (spec §11)', () => {
  it('ofrecer deja el aviso en la outbox; el worker lo entrega a la bandeja del asociado y por correo', async () => {
    const ops = await login(OPS);
    const oferta = await ofrecer(ops);
    expect(await construida.almacenamiento.notificaciones.pendientes()).toBe(1);

    expect(await construida.worker.procesar()).toEqual({ avisos: 1, entregas: 1, fallos: 0 });
    expect(await construida.almacenamiento.notificaciones.pendientes()).toBe(0);

    const correo = mensajeria.mensajes.find(
      (m) => m.canal === 'correo' && m.para === MEMBER && m.asunto.startsWith('Nuevo turno'),
    );
    expect(correo?.asunto).toBe('Nuevo turno para FST189');
    expect(correo?.texto).toContain('FST189');
    expect(correo?.texto).toContain('/me');

    const member = await login(MEMBER);
    const avisos = await bandeja(member);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({
      evento: 'oferta.abierta',
      asunto: 'Nuevo turno para FST189',
      leidaEn: null,
      canales: { correo: 'enviada' },
      datos: { ofertaId: oferta.id, placa: 'FST189' },
    });
    // La bandeja es personal: ops no ve el aviso del asociado.
    expect(await bandeja(ops)).toEqual([]);

    // Marcar leída: idempotente y solo sobre lo propio.
    const id = avisos[0]!.id;
    const leida = await app.inject({
      method: 'POST',
      url: `/api/v1/me/notificaciones/${id}/leer`,
      headers: conToken(member),
    });
    expect(leida.statusCode, leida.body).toBe(200);
    expect(await bandeja(member, '?noLeidas=true')).toEqual([]);
    expect((await bandeja(member))[0]?.leidaEn).toBe(reloj.ahora().toISOString());
    const otraVez = await app.inject({
      method: 'POST',
      url: `/api/v1/me/notificaciones/${id}/leer`,
      headers: conToken(member),
    });
    expect(otraVez.statusCode).toBe(200);
    const ajena = await app.inject({
      method: 'POST',
      url: `/api/v1/me/notificaciones/${id}/leer`,
      headers: conToken(ops),
    });
    expect(ajena.statusCode).toBe(404);
  });

  it('aceptar avisa tr.asignado a asociado y ops; declinar avisa a ops con el motivo', async () => {
    const ops = await login(OPS);
    const oferta = await ofrecer(ops);
    const member = await login(MEMBER);
    await construida.worker.procesar();

    const aceptada = await app.inject({
      method: 'POST',
      url: `/api/v1/ofertas/${oferta.id}/aceptar`,
      headers: conToken(member),
    });
    expect(aceptada.statusCode, aceptada.body).toBe(200);
    expect(await construida.worker.procesar()).toEqual({ avisos: 1, entregas: 2, fallos: 0 });
    const deOps = await bandeja(ops);
    expect(deOps.map((n) => n.evento)).toEqual(['tr.asignado']);
    expect(deOps[0]?.asunto).toMatch(/^TR TR-\d+ asignado a FST189$/);
    expect((await bandeja(member)).map((n) => n.evento)).toEqual(['tr.asignado', 'oferta.abierta']);

    // Segunda ronda: la siguiente oferta se declina → aviso a ops + reoferta al siguiente.
    const segunda = await ofrecer(ops);
    await construida.worker.procesar();
    // Ops declina en nombre del asociado (spec §7.4): el aviso va a ops igual.
    const declinada = await app.inject({
      method: 'POST',
      url: `/api/v1/ofertas/${segunda.id}/declinar`,
      headers: conToken(ops),
      payload: { motivoId: 'mot-mantenimiento', nota: 'en taller' },
    });
    expect(declinada.statusCode, declinada.body).toBe(200);
    const entrega = await construida.worker.procesar();
    expect(entrega.avisos).toBeGreaterThanOrEqual(1);
    const aviso = (await bandeja(ops)).find((n) => n.evento === 'oferta.declinada');
    expect(aviso?.asunto).toMatch(/declinó el turno$/);
    expect(aviso?.texto).toContain('en taller');
  });

  it('las preferencias mandan: sin correo no hay mensaje; con WhatsApp y celular sale por ese canal', async () => {
    const member = await login(MEMBER);
    const invalida = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me/preferencias',
      headers: conToken(member),
      payload: { correo: true, whatsapp: true, celular: null },
    });
    expect(invalida.statusCode).toBe(400);
    const cambio = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me/preferencias',
      headers: conToken(member),
      payload: { correo: false, whatsapp: true, celular: '+573001234567' },
    });
    expect(cambio.statusCode, cambio.body).toBe(200);
    const leidas = await app.inject({
      method: 'GET',
      url: '/api/v1/me/preferencias',
      headers: conToken(member),
    });
    expect(leidas.json()).toEqual({ correo: false, whatsapp: true, celular: '+573001234567' });

    const ops = await login(OPS);
    await ofrecer(ops);
    mensajeria.limpiar();
    expect(await construida.worker.procesar()).toEqual({ avisos: 1, entregas: 1, fallos: 0 });
    expect(mensajeria.mensajes.filter((m) => m.canal === 'correo')).toEqual([]);
    const whatsapp = mensajeria.mensajes.find((m) => m.canal === 'celular');
    expect(whatsapp).toMatchObject({ para: '+573001234567', asunto: 'Nuevo turno para FST189' });
    expect((await bandeja(member))[0]?.canales).toEqual({ whatsapp: 'enviada' });

    // Auditado sin PII: el celular no viaja al log, solo si existe.
    const superadmin = await login('superadmin@asotracmet.test');
    const audit = await app.inject({
      method: 'GET',
      url: '/api/v1/audit?entidad=usuarios',
      headers: conToken(superadmin),
    });
    const evento = (audit.json() as Array<{ accion: string; after: unknown }>).find(
      (e) => e.accion === 'preferencias.cambiar',
    );
    expect(evento?.after).toEqual({ correo: false, whatsapp: true, celular: true });
    expect(JSON.stringify(audit.json())).not.toContain('573001234567');
  });

  it('un canal caído no bloquea la bandeja (queda "fallida"); un fallo del repositorio reintenta y cierra con error', async () => {
    const ops = await login(OPS);
    await ofrecer(ops);
    const rota: Mensajeria = {
      enviar: async () => {
        throw new Error('SMTP caído');
      },
    };
    const avisosLog: string[] = [];
    const base = construida.almacenamiento;
    const conCanalRoto = new WorkerNotificaciones({
      notificaciones: base.notificaciones,
      usuarios: base.usuarios,
      consultas: base.consultas,
      maestros: base.maestros,
      mensajeria: rota,
      reloj,
      ids: new IdsSecuenciales('roto'),
      urlWeb: 'http://web.test',
      log: (_nivel, _datos, mensaje) => avisosLog.push(mensaje),
    });
    expect(await conCanalRoto.procesar()).toEqual({ avisos: 1, entregas: 1, fallos: 1 });
    const member = await login(MEMBER);
    expect((await bandeja(member))[0]?.canales).toEqual({ correo: 'fallida' });
    expect(avisosLog.some((m) => m.includes('SMTP caído'))).toBe(true);
    expect(avisosLog.join('\n')).not.toContain(MEMBER);

    // Repositorio que falla al guardar: el aviso vuelve a salir tras `reintentoMs` y a los
    // `maxIntentos` se cierra con error.
    await ofrecer(ops);
    const repo = base.notificaciones;
    const fallando = new Proxy(repo, {
      get(target, prop, receptor) {
        if (prop === 'guardar') {
          return async () => {
            throw new Error('base caída');
          };
        }
        const valor = Reflect.get(target, prop, receptor) as unknown;
        return typeof valor === 'function'
          ? (valor as (...a: unknown[]) => unknown).bind(target)
          : valor;
      },
    });
    const conRepoRoto = new WorkerNotificaciones({
      notificaciones: fallando,
      usuarios: base.usuarios,
      consultas: base.consultas,
      maestros: base.maestros,
      mensajeria,
      reloj,
      ids: new IdsSecuenciales('repo'),
      urlWeb: 'http://web.test',
      maxIntentos: 2,
      reintentoMs: 1_000,
    });
    expect(await conRepoRoto.procesar()).toEqual({ avisos: 1, entregas: 0, fallos: 1 });
    expect(await repo.pendientes()).toBe(1);
    // Aún no pasó el tiempo de reintento: no lo vuelve a tomar.
    expect(await conRepoRoto.procesar()).toEqual({ avisos: 0, entregas: 0, fallos: 0 });
    reloj.fijar(new Date(reloj.ahora().getTime() + 1_500).toISOString());
    expect(await conRepoRoto.procesar()).toEqual({ avisos: 1, entregas: 0, fallos: 1 });
    // Segundo intento fallido con maxIntentos 2: cerrado con error, ya no pendiente.
    expect(await repo.pendientes()).toBe(0);
  });

  it('jobs por tiempo: oferta por expirar (T-15), documento por vencer (30/7) y digest de recaudo, idempotentes', async () => {
    const ops = await login(OPS);
    const superadmin = await login('superadmin@asotracmet.test');
    const oferta = await ofrecer(ops);
    await construida.worker.procesar();
    // A 10 minutos de expirar entra en la ventana; correr el job dos veces no repite.
    reloj.fijar(new Date(Date.parse(oferta.expiraEn) - 10 * 60_000).toISOString());
    const primera = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs/avisos',
      headers: conToken(superadmin),
    });
    expect(primera.statusCode, primera.body).toBe(200);
    const resumen = primera.json() as { porExpirar: number; documentos: number; recaudos: boolean };
    expect(resumen.porExpirar).toBe(1);
    expect(resumen.documentos).toBeGreaterThanOrEqual(1);
    const segunda = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/jobs/avisos',
        headers: conToken(superadmin),
      })
    ).json() as { porExpirar: number; documentos: number; recaudos: boolean };
    expect(segunda).toMatchObject({ porExpirar: 0, documentos: 0, recaudos: false });

    const entrega = await construida.worker.procesar();
    expect(entrega.avisos).toBe(
      resumen.porExpirar + resumen.documentos + (resumen.recaudos ? 1 : 0),
    );
    const member = await login(MEMBER);
    const porExpirar = (await bandeja(member)).find((n) => n.evento === 'oferta.por_expirar');
    expect(porExpirar?.asunto).toBe('El turno de FST189 vence en 10 min');
    expect((await bandeja(ops)).some((n) => n.evento === 'oferta.por_expirar')).toBe(true);
    const hseq = await login('hseq@asotracmet.test');
    const vencimiento = (await bandeja(hseq)).find((n) => n.evento === 'documento.por_vencer');
    expect(vencimiento?.asunto).toMatch(/vence en \d+ días$/);
  });
});
