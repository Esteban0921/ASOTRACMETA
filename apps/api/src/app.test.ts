import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  AlmacenMemoria,
  IdsSecuenciales,
  RelojFijo,
  type Reloj,
  type Transaccion,
} from '@asotracmet/domain';
import type { ClaseCola } from '@asotracmet/shared';
import { construirApp, type AppConstruida } from './app.js';
import { claveDesdeEntorno } from './auth/cifrado.js';
import { MensajeriaMemoria } from './auth/mensajeria.js';
import { exigir, exigirReauth } from './auth/plugin.js';
import { codigoTotp } from './auth/totp.js';
import { PASSWORD_DEV, crearSeed, secretoTotpSemilla } from './seed.js';
import { AlmacenUsuarios } from './usuarios.js';

const INICIO = '2026-09-16T13:00:00Z';

interface Contexto {
  app: FastifyInstance;
  reloj: Reloj;
  mensajeria: MensajeriaMemoria;
}

let construida: AppConstruida;
let app: FastifyInstance;
let reloj: RelojFijo;
let mensajeria: MensajeriaMemoria;

function conToken(token: string) {
  return { authorization: `Bearer ${token}` };
}

const esMember = (email: string) => email.startsWith('member.');

/** Completa el flujo de acceso real (spec §3.3) y devuelve el token de sesión. */
async function iniciarSesion(ctx: Contexto, email: string): Promise<string> {
  if (esMember(email)) {
    const pedido = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/magic-link',
      payload: { email },
    });
    expect(pedido.statusCode, pedido.body).toBe(200);
    const enlace = ctx.mensajeria.ultimoPara(email)?.enlace;
    expect(enlace).toBeDefined();
    const token = new URL(enlace!).searchParams.get('token');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/magic-link/canjear',
      payload: { token },
    });
    expect(res.statusCode, res.body).toBe(200);
    return (res.json() as { token: string }).token;
  }
  const primero = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: PASSWORD_DEV },
  });
  expect(primero.statusCode, primero.body).toBe(200);
  const reto = primero.json() as { paso: string; challenge: string; secret?: string };
  const secreto = reto.paso === 'totp_enrolar' ? reto.secret! : secretoTotpSemilla(email);
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/2fa/verify',
    payload: { challenge: reto.challenge, codigo: codigoTotp(secreto, ctx.reloj.ahora()) },
  });
  expect(res.statusCode, res.body).toBe(200);
  return (res.json() as { token: string }).token;
}

const login = (email: string) => iniciarSesion({ app, reloj, mensajeria }, email);

beforeAll(async () => {
  reloj = new RelojFijo(INICIO);
  mensajeria = new MensajeriaMemoria(reloj);
  construida = await construirApp({
    config: { logger: false, modoE2e: true, loginRateLimitMax: 10_000 },
    reloj,
    ids: new IdsSecuenciales('api'),
    mensajeria,
  });
  app = construida.app;
  // Ruta solo de test para probar el guard de re-autenticación (spec §3.3).
  app.post(
    '/api/v1/__test/sensible',
    { preHandler: [exigir('cola', 'U'), exigirReauth(reloj)] },
    async () => ({ ok: true }),
  );
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  reloj.fijar(INICIO);
  await app.inject({ method: 'POST', url: '/api/v1/__e2e/reset' });
});

describe('salud y autenticación', () => {
  it('healthz responde sin token', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
  });

  it('sin token → 401 UNAUTHORIZED con código estable', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/requerimientos' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('contraseña incorrecta → 401; flujo completo → sesión y usuario', async () => {
    const mal = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'ops@asotracmet.test', password: 'incorrecta!' },
    });
    expect(mal.statusCode).toBe(401);
    const token = await login('ops@asotracmet.test');
    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: conToken(token) });
    expect(me.json()).toMatchObject({
      rol: 'admin_ops',
      email: 'ops@asotracmet.test',
      totpConfigurado: true,
    });
  });

  it('la sesión expira según la duración del rol (superadmin 4 h)', async () => {
    const token = await login('superadmin@asotracmet.test');
    reloj.avanzarMinutos(4 * 60 + 1);
    const res = await app.inject({ method: 'GET', url: '/api/v1/me', headers: conToken(token) });
    expect(res.statusCode).toBe(401);
  });

  it('body inválido → 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'no-es-correo' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('autenticación de producto (spec §3.3)', () => {
  it('contraseña + TOTP: el reto no abre sesión y un código incorrecto no entra', async () => {
    const primero = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'ops@asotracmet.test', password: PASSWORD_DEV },
    });
    expect(primero.statusCode).toBe(200);
    const reto = primero.json() as { paso: string; challenge: string; token?: string };
    expect(reto.paso).toBe('totp');
    expect(reto.token).toBeUndefined();

    const correcto = codigoTotp(secretoTotpSemilla('ops@asotracmet.test'), reloj.ahora());
    const incorrecto = String((Number(correcto) + 1) % 1_000_000).padStart(6, '0');
    const mal = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/verify',
      payload: { challenge: reto.challenge, codigo: incorrecto },
    });
    expect(mal.statusCode).toBe(401);
    expect(mal.json()).toMatchObject({ code: 'CODIGO_INVALIDO' });

    const bien = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/verify',
      payload: { challenge: reto.challenge, codigo: correcto },
    });
    expect(bien.statusCode).toBe(200);
    expect(bien.json()).toMatchObject({ usuario: { rol: 'admin_ops' } });
    expect((bien.json() as { token: string }).token.startsWith('sess_')).toBe(true);
  });

  it('un rol interno sin segundo factor lo configura en el primer acceso y lo usa después', async () => {
    const primero = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'hseq@asotracmet.test', password: PASSWORD_DEV },
    });
    const enrolar = primero.json() as {
      paso: string;
      challenge: string;
      secret: string;
      otpauthUrl: string;
    };
    expect(enrolar.paso).toBe('totp_enrolar');
    expect(enrolar.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(enrolar.otpauthUrl.startsWith('otpauth://totp/')).toBe(true);

    const activado = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/verify',
      payload: { challenge: enrolar.challenge, codigo: codigoTotp(enrolar.secret, reloj.ahora()) },
    });
    expect(activado.statusCode, activado.body).toBe(200);
    expect(activado.json()).toMatchObject({ usuario: { totpConfigurado: true } });

    const segundo = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'hseq@asotracmet.test', password: PASSWORD_DEV },
    });
    const reto = segundo.json() as { paso: string; challenge: string; secret?: string };
    expect(reto.paso).toBe('totp');
    expect(reto.secret).toBeUndefined();
    const sesion = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/verify',
      payload: { challenge: reto.challenge, codigo: codigoTotp(enrolar.secret, reloj.ahora()) },
    });
    expect(sesion.statusCode).toBe(200);
  });

  it('el reto TOTP caduca a los cinco minutos', async () => {
    const primero = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'ops@asotracmet.test', password: PASSWORD_DEV },
    });
    const { challenge } = primero.json() as { challenge: string };
    reloj.avanzarMinutos(6);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/verify',
      payload: {
        challenge,
        codigo: codigoTotp(secretoTotpSemilla('ops@asotracmet.test'), reloj.ahora()),
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'CHALLENGE_INVALIDO' });
  });

  it('código por correo: sin contraseña llega un código de un solo uso', async () => {
    const pedido = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'viewer@asotracmet.test' },
    });
    expect(pedido.statusCode).toBe(200);
    expect(pedido.json()).toEqual({ paso: 'codigo_enviado' });
    const mensaje = mensajeria.ultimoPara('viewer@asotracmet.test');
    expect(mensaje?.codigo).toMatch(/^\d{6}$/);

    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { email: 'viewer@asotracmet.test', codigo: mensaje!.codigo },
    });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json()).toMatchObject({ usuario: { rol: 'viewer' } });

    const repetido = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { email: 'viewer@asotracmet.test', codigo: mensaje!.codigo },
    });
    expect(repetido.statusCode).toBe(401);
    expect(repetido.json()).toMatchObject({ code: 'CODIGO_INVALIDO' });
  });

  it('cinco códigos incorrectos bloquean el código vigente, incluso el correcto', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'finance@asotracmet.test' },
    });
    const codigo = mensajeria.ultimoPara('finance@asotracmet.test')!.codigo!;
    const incorrecto = String((Number(codigo) + 1) % 1_000_000).padStart(6, '0');
    for (let intento = 0; intento < 5; intento += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/otp/verify',
        payload: { email: 'finance@asotracmet.test', codigo: incorrecto },
      });
      expect(res.statusCode).toBe(401);
    }
    const bloqueado = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { email: 'finance@asotracmet.test', codigo },
    });
    expect(bloqueado.statusCode).toBe(429);
    expect(bloqueado.json()).toMatchObject({ code: 'DEMASIADOS_INTENTOS' });
  });

  it('un correo desconocido recibe la misma respuesta y no genera mensajes; un member no entra con contraseña', async () => {
    const antes = mensajeria.mensajes.length;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'nadie@asotracmet.test' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ paso: 'codigo_enviado' });
    expect(mensajeria.mensajes.length).toBe(antes);

    const member = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'member.fst189@asotracmet.test', password: PASSWORD_DEV },
    });
    expect(member.statusCode).toBe(401);
  });

  it('member: enlace mágico de un solo uso que caduca a los quince minutos', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/magic-link',
      payload: { email: 'member.fst189@asotracmet.test' },
    });
    const enlace = mensajeria.ultimoPara('member.fst189@asotracmet.test')!.enlace!;
    expect(enlace).toContain('/entrar?token=');
    const token = new URL(enlace).searchParams.get('token');

    const primero = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/magic-link/canjear',
      payload: { token },
    });
    expect(primero.statusCode, primero.body).toBe(200);
    expect(primero.json()).toMatchObject({ usuario: { rol: 'member' } });

    const segundo = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/magic-link/canjear',
      payload: { token },
    });
    expect(segundo.statusCode).toBe(401);
    expect(segundo.json()).toMatchObject({ code: 'CODIGO_INVALIDO' });

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/magic-link',
      payload: { email: 'member.fst189@asotracmet.test' },
    });
    const vencido = new URL(
      mensajeria.ultimoPara('member.fst189@asotracmet.test')!.enlace!,
    ).searchParams.get('token');
    reloj.avanzarMinutos(16);
    const tarde = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/magic-link/canjear',
      payload: { token: vencido },
    });
    expect(tarde.statusCode).toBe(401);
  });

  it('logout revoca la sesión: el mismo token deja de valer', async () => {
    const token = await login('ops@asotracmet.test');
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/me', headers: conToken(token) })).statusCode,
    ).toBe(200);
    const salida = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: conToken(token),
    });
    expect(salida.statusCode).toBe(204);
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/me', headers: conToken(token) })).statusCode,
    ).toBe(401);
  });

  it('las acciones sensibles exigen re-autenticación reciente', async () => {
    const token = await login('superadmin@asotracmet.test');
    const sinReauth = await app.inject({
      method: 'POST',
      url: '/api/v1/__test/sensible',
      headers: conToken(token),
    });
    expect(sinReauth.statusCode).toBe(403);
    expect(sinReauth.json()).toMatchObject({ code: 'REAUTH_REQUERIDA' });

    const mala = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reauth',
      headers: conToken(token),
      payload: { password: 'incorrecta!' },
    });
    expect(mala.statusCode).toBe(401);

    const buena = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reauth',
      headers: conToken(token),
      payload: { password: PASSWORD_DEV },
    });
    expect(buena.statusCode, buena.body).toBe(200);
    expect((buena.json() as { reauthHasta: string }).reauthHasta).toBe('2026-09-16T13:05:00.000Z');

    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/__test/sensible',
          headers: conToken(token),
        })
      ).statusCode,
    ).toBe(200);
    reloj.avanzarMinutos(6);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/__test/sensible',
          headers: conToken(token),
        })
      ).statusCode,
    ).toBe(403);
  });
});

describe('RBAC (spec §20.1, §20.2)', () => {
  it('viewer no puede mutar ninguna entidad (prueba de API, no de UI)', async () => {
    const token = await login('viewer@asotracmet.test');
    const intentos = [
      app.inject({
        method: 'POST',
        url: '/api/v1/requerimientos',
        headers: conToken(token),
        payload: {},
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/requerimientos/req-hlb-castilla/ofertas',
        headers: conToken(token),
      }),
      app.inject({
        method: 'PATCH',
        url: '/api/v1/parametros',
        headers: conToken(token),
        payload: { oferta_ttl_minutos: 1 },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/trs/x/cancelar',
        headers: conToken(token),
        payload: { motivo: 'x' },
      }),
    ];
    for (const res of await Promise.all(intentos)) {
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: 'FORBIDDEN' });
    }
    const cola = await app.inject({
      method: 'GET',
      url: '/api/v1/colas/TM-CBZ?clienteId=cli-hlb',
      headers: conToken(token),
    });
    expect(cola.statusCode).toBe(200);
  });

  it('viewer ve la cédula enmascarada; ops la ve completa', async () => {
    const viewer = await login('viewer@asotracmet.test');
    const ops = await login('ops@asotracmet.test');
    const [v, o] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/v1/colas/TM-CBZ', headers: conToken(viewer) }),
      app.inject({ method: 'GET', url: '/api/v1/colas/TM-CBZ', headers: conToken(ops) }),
    ]);
    const docViewer = (v.json() as { posiciones: Array<{ asociado: { documento: string } }> })
      .posiciones[0]?.asociado.documento;
    const docOps = (o.json() as { posiciones: Array<{ asociado: { documento: string } }> })
      .posiciones[0]?.asociado.documento;
    expect(docViewer).toMatch(/^\*+\d{4}$/);
    expect(docOps).toMatch(/^\d+$/);
  });

  it('member no lista TR ajenos ni lee la cola completa', async () => {
    const ops = await login('ops@asotracmet.test');
    const oferta = await app.inject({
      method: 'POST',
      url: '/api/v1/requerimientos/req-hlb-castilla/ofertas',
      headers: conToken(ops),
    });
    expect(oferta.statusCode).toBe(201);
    const aceptada = await app.inject({
      method: 'POST',
      url: `/api/v1/ofertas/${(oferta.json() as { id: string }).id}/aceptar`,
      headers: conToken(ops),
    });
    const trId = (aceptada.json() as { tr: { id: string } }).tr.id;

    const swi750 = await login('member.swi750@asotracmet.test');
    const lista = await app.inject({
      method: 'GET',
      url: '/api/v1/trs',
      headers: conToken(swi750),
    });
    expect(lista.json()).toEqual([]);
    const detalle = await app.inject({
      method: 'GET',
      url: `/api/v1/trs/${trId}`,
      headers: conToken(swi750),
    });
    expect(detalle.statusCode).toBe(403);
    expect(detalle.json()).toMatchObject({ code: 'FORBIDDEN_OWN_SCOPE' });
    const cola = await app.inject({
      method: 'GET',
      url: '/api/v1/colas/TM-CBZ',
      headers: conToken(swi750),
    });
    expect(cola.statusCode).toBe(403);

    const fst189 = await login('member.fst189@asotracmet.test');
    const propios = await app.inject({
      method: 'GET',
      url: '/api/v1/me/trs',
      headers: conToken(fst189),
    });
    expect(propios.json()).toEqual([
      expect.objectContaining({ codigo: 'TR-41947', placa: 'FST189' }),
    ]);
  });

  it('audit: superadmin ve todo; ops solo su módulo; viewer nada', async () => {
    const ops = await login('ops@asotracmet.test');
    await app.inject({
      method: 'POST',
      url: '/api/v1/requerimientos/req-hlb-castilla/ofertas',
      headers: conToken(ops),
    });
    const superadmin = await login('superadmin@asotracmet.test');
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/parametros',
      headers: conToken(superadmin),
      payload: { oferta_ttl_minutos: 90 },
    });

    const todo = (
      await app.inject({ method: 'GET', url: '/api/v1/audit', headers: conToken(superadmin) })
    ).json() as Array<{ entidad: string }>;
    expect(todo.map((e) => e.entidad)).toEqual(expect.arrayContaining(['ofertas', 'parametros']));
    const deOps = (
      await app.inject({ method: 'GET', url: '/api/v1/audit', headers: conToken(ops) })
    ).json() as Array<{ entidad: string }>;
    expect(deOps.every((e) => e.entidad !== 'parametros')).toBe(true);
    const viewer = await login('viewer@asotracmet.test');
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/audit', headers: conToken(viewer) }))
        .statusCode,
    ).toBe(403);
  });
});

describe('flujo ofrecer → aceptar / declinar (spec §16, §20)', () => {
  it('ops ofrece: la cabeza SPS413 no es apta para HLB, la oferta va a FST189', async () => {
    const ops = await login('ops@asotracmet.test');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/requerimientos/req-hlb-castilla/ofertas',
      headers: conToken(ops),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ estado: 'abierta', placa: 'FST189' });
  });

  it('member ajeno no acepta (FORBIDDEN_OWN_SCOPE); el dueño acepta y nace el TR', async () => {
    const ops = await login('ops@asotracmet.test');
    const oferta = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/requerimientos/req-hlb-castilla/ofertas',
        headers: conToken(ops),
      })
    ).json() as { id: string };
    const ajeno = await login('member.swi750@asotracmet.test');
    const negado = await app.inject({
      method: 'POST',
      url: `/api/v1/ofertas/${oferta.id}/aceptar`,
      headers: conToken(ajeno),
    });
    expect(negado.statusCode).toBe(403);
    expect(negado.json()).toMatchObject({ code: 'FORBIDDEN_OWN_SCOPE' });

    const dueno = await login('member.fst189@asotracmet.test');
    const ok = await app.inject({
      method: 'POST',
      url: `/api/v1/ofertas/${oferta.id}/aceptar`,
      headers: conToken(dueno),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({
      tr: { codigo: 'TR-41947', estado: 'asignado', placa: 'FST189', cliente: 'HLB' },
    });
  });

  it('declinar exige motivo de catálogo y reoferta automáticamente a la siguiente placa', async () => {
    const ops = await login('ops@asotracmet.test');
    const oferta = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/requerimientos/req-hlb-castilla/ofertas',
        headers: conToken(ops),
      })
    ).json() as { id: string };
    const dueno = await login('member.fst189@asotracmet.test');
    const sinMotivo = await app.inject({
      method: 'POST',
      url: `/api/v1/ofertas/${oferta.id}/declinar`,
      headers: conToken(dueno),
      payload: {},
    });
    expect(sinMotivo.statusCode).toBe(400);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/ofertas/${oferta.id}/declinar`,
      headers: conToken(dueno),
      payload: { motivoId: 'mot-mantenimiento', nota: 'Cambio de aceite' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      oferta: { estado: 'declinada', motivoDeclinacion: 'Vehículo en mantenimiento' },
      siguiente: { estado: 'abierta', placa: 'TKM221' },
    });
  });

  it('acepta POST de acción sin cuerpo aunque llegue content-type JSON (TASK-0037)', async () => {
    const ops = await login('ops@asotracmet.test');
    const oferta = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/requerimientos/req-hlb-castilla/ofertas',
        headers: { ...conToken(ops), 'content-type': 'application/json' },
      })
    ).json() as { id: string };
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/ofertas/${oferta.id}/aceptar`,
      headers: { ...conToken(ops), 'content-type': 'application/json' },
      payload: '',
    });
    expect(res.statusCode).toBe(200);
    const malformado = await app.inject({
      method: 'POST',
      url: '/api/v1/requerimientos',
      headers: { ...conToken(ops), 'content-type': 'application/json' },
      payload: '{ esto no es json',
    });
    expect(malformado.statusCode).toBe(400);
    expect(malformado.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('cancelar TR conserva historia y libera el cupo', async () => {
    const ops = await login('ops@asotracmet.test');
    const oferta = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/requerimientos/req-hlb-castilla/ofertas',
        headers: conToken(ops),
      })
    ).json() as { id: string };
    const { tr } = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/ofertas/${oferta.id}/aceptar`,
        headers: conToken(ops),
      })
    ).json() as { tr: { id: string } };
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/trs/${tr.id}/cancelar`,
      headers: conToken(ops),
      payload: { motivo: 'HLB canceló' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      tr: { estado: 'cancelado', motivoCancelacion: 'HLB canceló' },
      siguiente: { estado: 'abierta' },
    });
    const lista = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/trs?estado=cancelado',
        headers: conToken(ops),
      })
    ).json() as unknown[];
    expect(lista).toHaveLength(1);
  });

  it('Idempotency-Key: repetir el POST devuelve la misma oferta sin crear otra', async () => {
    const ops = await login('ops@asotracmet.test');
    const headers = { ...conToken(ops), 'idempotency-key': 'abc-123' };
    const a = await app.inject({
      method: 'POST',
      url: '/api/v1/requerimientos/req-hlb-castilla/ofertas',
      headers,
    });
    const b = await app.inject({
      method: 'POST',
      url: '/api/v1/requerimientos/req-hlb-castilla/ofertas',
      headers,
    });
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    expect((a.json() as { id: string }).id).toBe((b.json() as { id: string }).id);
    const abiertas = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/ofertas?estado=abierta',
        headers: conToken(ops),
      })
    ).json() as unknown[];
    expect(abiertas).toHaveLength(1);
  });

  it('el porcentaje de recaudo cambia por parámetros y queda auditado (§20.7)', async () => {
    const superadmin = await login('superadmin@asotracmet.test');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/parametros',
      headers: conToken(superadmin),
      payload: { recaudo_porcentaje: 0.035 },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { recaudo_porcentaje: number }).recaudo_porcentaje).toBe(0.035);
    const audit = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/audit?entidad=parametros',
        headers: conToken(superadmin),
      })
    ).json() as Array<{ accion: string; before: unknown; after: unknown }>;
    expect(audit[0]).toMatchObject({
      accion: 'parametros.cambiar',
      before: { recaudo_porcentaje: 0.03 },
      after: { recaudo_porcentaje: 0.035 },
    });
  });

  it('el job de expiración cierra ofertas vencidas y reoferta', async () => {
    const ops = await login('ops@asotracmet.test');
    await app.inject({
      method: 'POST',
      url: '/api/v1/requerimientos/req-hlb-castilla/ofertas',
      headers: conToken(ops),
    });
    const superadmin = await login('superadmin@asotracmet.test');
    reloj.avanzarMinutos(121);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs/expirar-ofertas',
      headers: conToken(superadmin),
    });
    expect(res.json()).toEqual({ expiradas: 1 });
    const abiertas = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/ofertas?estado=abierta',
        headers: conToken(ops),
      })
    ).json() as Array<{ placa: string }>;
    expect(abiertas.map((o) => o.placa)).toEqual(['TKM221']);
  });
});

describe('concurrencia HTTP (spec §16, §20.3)', () => {
  it('20 POST /ofertas paralelos sobre la misma clase → 1×201 y 19×409 COLA_LOCKED', async () => {
    // Almacén con transacciones lentas para garantizar solape real entre requests.
    const relojLento = new RelojFijo(INICIO);
    const ids = new IdsSecuenciales('lento');
    const seed = crearSeed(relojLento.ahora(), claveDesdeEntorno({}));
    const almacen = new AlmacenMemoria(seed.estado, { reloj: relojLento, ids });
    const original = almacen.ejecutar.bind(almacen);
    almacen.ejecutar = <T>(clase: ClaseCola | null, fn: (tx: Transaccion) => Promise<T>) =>
      original(clase, async (tx) => {
        await new Promise((r) => setTimeout(r, 30));
        return fn(tx);
      });
    const mensajeriaLenta = new MensajeriaMemoria(relojLento);
    const lenta = await construirApp({
      config: { logger: false, loginRateLimitMax: 10_000 },
      reloj: relojLento,
      ids,
      almacen,
      usuarios: new AlmacenUsuarios(seed.usuarios),
      mensajeria: mensajeriaLenta,
    });
    await lenta.app.ready();
    try {
      const token = await iniciarSesion(
        { app: lenta.app, reloj: relojLento, mensajeria: mensajeriaLenta },
        'ops@asotracmet.test',
      );
      const creado = await lenta.app.inject({
        method: 'POST',
        url: '/api/v1/requerimientos',
        headers: conToken(token),
        payload: {
          clienteId: 'cli-hlb',
          claseCola: 'TM-CBZ',
          fechaServicio: '2026-09-20',
          cantidadCupos: 20,
        },
      });
      const reqId = (creado.json() as { id: string }).id;
      const respuestas = await Promise.all(
        Array.from({ length: 20 }, () =>
          lenta.app.inject({
            method: 'POST',
            url: `/api/v1/requerimientos/${reqId}/ofertas`,
            headers: conToken(token),
          }),
        ),
      );
      const codigos = respuestas.map((r) => r.statusCode).sort();
      expect(codigos.filter((c) => c === 201)).toHaveLength(1);
      expect(codigos.filter((c) => c === 409)).toHaveLength(19);
      expect(respuestas.find((r) => r.statusCode === 409)?.json()).toMatchObject({
        code: 'COLA_LOCKED',
      });
    } finally {
      await lenta.app.close();
    }
  });
});

describe('override y reset de cola (spec §7.1.5, §9.2, §21)', () => {
  const codigoSuperadmin = () =>
    codigoTotp(secretoTotpSemilla('superadmin@asotracmet.test'), reloj.ahora());

  it('override: solo superadmin re-autenticado; queda auditado y el veedor lo ve', async () => {
    const ops = await login('ops@asotracmet.test');
    const cuerpo = { vehiculoId: 'veh-SUL470', posicion: 1, motivo: 'Acuerdo de asamblea' };
    const negado = await app.inject({
      method: 'POST',
      url: '/api/v1/colas/TM-CBZ/override',
      headers: conToken(ops),
      payload: cuerpo,
    });
    expect(negado.statusCode).toBe(403);
    expect(negado.json()).toMatchObject({ code: 'FORBIDDEN' });

    const superadmin = await login('superadmin@asotracmet.test');
    const sinReauth = await app.inject({
      method: 'POST',
      url: '/api/v1/colas/TM-CBZ/override',
      headers: conToken(superadmin),
      payload: cuerpo,
    });
    expect(sinReauth.statusCode).toBe(403);
    expect(sinReauth.json()).toMatchObject({ code: 'REAUTH_REQUERIDA' });

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reauth',
      headers: conToken(superadmin),
      payload: { password: PASSWORD_DEV },
    });
    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/colas/TM-CBZ/override',
      headers: conToken(superadmin),
      payload: cuerpo,
    });
    expect(ok.statusCode, ok.body).toBe(200);
    const cola = ok.json() as { posiciones: Array<{ placa: string; posicion: number }> };
    expect(cola.posiciones[0]).toMatchObject({ placa: 'SUL470', posicion: 1 });
    expect(cola.posiciones.map((p) => p.posicion)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const viewer = await login('viewer@asotracmet.test');
    const intervenciones = await app.inject({
      method: 'GET',
      url: '/api/v1/colas/TM-CBZ/intervenciones',
      headers: conToken(viewer),
    });
    expect(intervenciones.statusCode).toBe(200);
    expect(intervenciones.json()).toEqual([
      expect.objectContaining({
        accion: 'cola.override',
        actorRol: 'superadmin',
        after: expect.objectContaining({ motivo: 'Acuerdo de asamblea', posicion: 1 }),
      }),
    ]);
  });

  it('reset: confirmación literal y segundo factor cuando reset_cola_requiere_2fa', async () => {
    const superadmin = await login('superadmin@asotracmet.test');
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reauth',
      headers: conToken(superadmin),
      payload: { password: PASSWORD_DEV },
    });
    const conPassword = await app.inject({
      method: 'POST',
      url: '/api/v1/colas/TM-CBZ/reset',
      headers: conToken(superadmin),
      payload: { motivo: 'Nueva ronda', confirmacion: 'RESETEAR' },
    });
    expect(conPassword.statusCode).toBe(403);
    expect(conPassword.json()).toMatchObject({ code: 'REAUTH_REQUERIDA' });

    const reauth = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reauth',
      headers: conToken(superadmin),
      payload: { codigo: codigoSuperadmin() },
    });
    expect(reauth.statusCode, reauth.body).toBe(200);
    const malConfirmado = await app.inject({
      method: 'POST',
      url: '/api/v1/colas/TM-CBZ/reset',
      headers: conToken(superadmin),
      payload: { motivo: 'Nueva ronda', confirmacion: 'resetear' },
    });
    expect(malConfirmado.statusCode).toBe(400);

    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/colas/TM-CBZ/reset',
      headers: conToken(superadmin),
      payload: {
        motivo: 'Nueva ronda acordada en asamblea',
        confirmacion: 'RESETEAR',
        orden: ['veh-SUL470'],
      },
    });
    expect(ok.statusCode, ok.body).toBe(200);
    const cola = ok.json() as {
      total: number;
      posiciones: Array<{ placa: string; ciclo: number; turnosTomados: number }>;
    };
    expect(cola.total).toBe(10);
    expect(cola.posiciones.slice(0, 3).map((p) => p.placa)).toEqual(['SUL470', 'FST189', 'QOR007']);
    expect(cola.posiciones.every((p) => p.ciclo === 1 && p.turnosTomados === 0)).toBe(true);

    const viewer = await login('viewer@asotracmet.test');
    const intervenciones = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/colas/TM-CBZ/intervenciones',
        headers: conToken(viewer),
      })
    ).json() as Array<{ accion: string }>;
    expect(intervenciones.map((i) => i.accion)).toEqual(['cola.reset']);
  });

  it('con reset_cola_requiere_2fa=false basta la contraseña para re-autenticarse', async () => {
    const superadmin = await login('superadmin@asotracmet.test');
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/parametros',
      headers: conToken(superadmin),
      payload: { reset_cola_requiere_2fa: false },
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reauth',
      headers: conToken(superadmin),
      payload: { password: PASSWORD_DEV },
    });
    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/colas/C100/reset',
      headers: conToken(superadmin),
      payload: { motivo: 'Ronda nueva C100', confirmacion: 'RESETEAR' },
    });
    expect(ok.statusCode, ok.body).toBe(200);
    expect((ok.json() as { total: number }).total).toBe(3);
  });
});

describe('IAM: usuarios, roles y scope member (spec §3.1, §8.2)', () => {
  it('los admins listan usuarios sin secretos; solo superadmin crea; viewer ni lista', async () => {
    const ops = await login('ops@asotracmet.test');
    const lista = await app.inject({
      method: 'GET',
      url: '/api/v1/usuarios',
      headers: conToken(ops),
    });
    expect(lista.statusCode).toBe(200);
    const usuarios = lista.json() as Array<{
      email: string;
      totpConfigurado: boolean;
      activo: boolean;
    }>;
    expect(usuarios.map((u) => u.email)).toContain('member.fst189@asotracmet.test');
    expect(lista.body).not.toMatch(/passwordHash|totpSecretEnc|scrypt\$|v1\./);
    const crear = await app.inject({
      method: 'POST',
      url: '/api/v1/usuarios',
      headers: conToken(ops),
      payload: { email: 'x@asotracmet.test', nombre: 'Equis', rol: 'viewer' },
    });
    expect(crear.statusCode).toBe(403);
    const viewer = await login('viewer@asotracmet.test');
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/usuarios', headers: conToken(viewer) }))
        .statusCode,
    ).toBe(403);
  });

  it('superadmin crea un rol interno que entra con código por correo; el correo no se repite', async () => {
    const superadmin = await login('superadmin@asotracmet.test');
    const payload = {
      email: 'nueva.hseq@asotracmet.test',
      nombre: 'Nueva HSEQ',
      rol: 'admin_hseq',
    };
    const creado = await app.inject({
      method: 'POST',
      url: '/api/v1/usuarios',
      headers: conToken(superadmin),
      payload,
    });
    expect(creado.statusCode, creado.body).toBe(201);
    expect(creado.json()).toMatchObject({
      rol: 'admin_hseq',
      activo: true,
      totpConfigurado: false,
      vehiculoIds: [],
    });
    const duplicado = await app.inject({
      method: 'POST',
      url: '/api/v1/usuarios',
      headers: conToken(superadmin),
      payload,
    });
    expect(duplicado.statusCode).toBe(409);
    expect(duplicado.json()).toMatchObject({ code: 'EMAIL_EN_USO' });

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'nueva.hseq@asotracmet.test' },
    });
    const codigo = mensajeria.ultimoPara('nueva.hseq@asotracmet.test')?.codigo;
    expect(codigo).toMatch(/^\d{6}$/);
    const sesion = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { email: 'nueva.hseq@asotracmet.test', codigo },
    });
    expect(sesion.statusCode, sesion.body).toBe(200);
    expect(sesion.json()).toMatchObject({ usuario: { rol: 'admin_hseq' } });

    const memberConPassword = await app.inject({
      method: 'POST',
      url: '/api/v1/usuarios',
      headers: conToken(superadmin),
      payload: {
        email: 'otro@asotracmet.test',
        nombre: 'Otro',
        rol: 'member',
        password: PASSWORD_DEV,
      },
    });
    expect(memberConPassword.statusCode).toBe(400);
  });

  it('superadmin crea un asociado con placas: entra con enlace y ve su posición', async () => {
    const superadmin = await login('superadmin@asotracmet.test');
    const creado = await app.inject({
      method: 'POST',
      url: '/api/v1/usuarios',
      headers: conToken(superadmin),
      payload: {
        email: 'member.qor007@asotracmet.test',
        nombre: 'Asociado 03',
        rol: 'member',
        asociadoId: 'a-03',
        vehiculoIds: ['veh-QOR007'],
      },
    });
    expect(creado.statusCode, creado.body).toBe(201);
    const token = await login('member.qor007@asotracmet.test');
    const cola = await app.inject({
      method: 'GET',
      url: '/api/v1/me/cola',
      headers: conToken(token),
    });
    expect(cola.json()).toEqual([{ placa: 'QOR007', claseCola: 'TM-CBZ', posicion: 5, total: 10 }]);

    const placaInexistente = await app.inject({
      method: 'POST',
      url: '/api/v1/usuarios',
      headers: conToken(superadmin),
      payload: {
        email: 'm2@asotracmet.test',
        nombre: 'Eme Dos',
        rol: 'member',
        vehiculoIds: ['veh-NOEXISTE'],
      },
    });
    expect(placaInexistente.statusCode).toBe(400);
  });

  it('cambiar el rol revoca las sesiones y limpia las placas al dejar de ser asociado', async () => {
    const superadmin = await login('superadmin@asotracmet.test');
    const member = await login('member.swi750@asotracmet.test');
    const cambio = await app.inject({
      method: 'POST',
      url: '/api/v1/usuarios/usr-member-swi750/roles',
      headers: conToken(superadmin),
      payload: { rol: 'viewer' },
    });
    expect(cambio.statusCode, cambio.body).toBe(200);
    expect(cambio.json()).toMatchObject({ rol: 'viewer', vehiculoIds: [] });
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/me', headers: conToken(member) }))
        .statusCode,
    ).toBe(401);
    const propio = await app.inject({
      method: 'POST',
      url: '/api/v1/usuarios/usr-super/roles',
      headers: conToken(superadmin),
      payload: { rol: 'viewer' },
    });
    expect(propio.statusCode).toBe(400);
  });

  it('desactivar revoca sesiones e impide entrar; nadie se desactiva a sí mismo', async () => {
    const superadmin = await login('superadmin@asotracmet.test');
    const ops = await login('ops@asotracmet.test');
    const baja = await app.inject({
      method: 'PATCH',
      url: '/api/v1/usuarios/usr-ops',
      headers: conToken(superadmin),
      payload: { activo: false },
    });
    expect(baja.statusCode, baja.body).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/me', headers: conToken(ops) })).statusCode,
    ).toBe(401);
    const intento = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'ops@asotracmet.test', password: PASSWORD_DEV },
    });
    expect(intento.statusCode).toBe(401);
    const propio = await app.inject({
      method: 'PATCH',
      url: '/api/v1/usuarios/usr-super',
      headers: conToken(superadmin),
      payload: { activo: false },
    });
    expect(propio.statusCode).toBe(400);
    const alta = await app.inject({
      method: 'PATCH',
      url: '/api/v1/usuarios/usr-ops',
      headers: conToken(superadmin),
      payload: { activo: true },
    });
    expect(alta.statusCode).toBe(200);
  });

  it('las placas se asignan solo a asociados y cada cambio queda auditado', async () => {
    const superadmin = await login('superadmin@asotracmet.test');
    const interno = await app.inject({
      method: 'POST',
      url: '/api/v1/usuarios/usr-ops/vehiculos',
      headers: conToken(superadmin),
      payload: { vehiculoIds: ['veh-SUL470'] },
    });
    expect(interno.statusCode).toBe(400);
    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/usuarios/usr-member-swi750/vehiculos',
      headers: conToken(superadmin),
      payload: { vehiculoIds: ['veh-SWI750', 'veh-SUL470'] },
    });
    expect(ok.statusCode, ok.body).toBe(200);
    expect((ok.json() as { vehiculoIds: string[] }).vehiculoIds).toEqual([
      'veh-SWI750',
      'veh-SUL470',
    ]);
    const token = await login('member.swi750@asotracmet.test');
    const cola = (
      await app.inject({ method: 'GET', url: '/api/v1/me/cola', headers: conToken(token) })
    ).json() as Array<{ placa: string }>;
    expect(cola.map((p) => p.placa)).toEqual(['SUL470', 'SWI750']);
    const audit = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/audit?entidad=usuarios',
        headers: conToken(superadmin),
      })
    ).json() as Array<{ accion: string; after: unknown }>;
    expect(audit[0]).toMatchObject({
      accion: 'usuario.vehiculos',
      after: { vehiculoIds: ['veh-SWI750', 'veh-SUL470'] },
    });
  });
});

describe('maestros: vehículos, documentos, habilitaciones, asociados, catálogos y tarifas (spec §6.2-6.4, §8.3)', () => {
  type Cola = {
    total: number;
    posiciones: Array<{
      placa: string;
      elegibilidad: { elegible: boolean; motivo: string | null };
    }>;
  };
  const cola = async (token: string, consulta = '') =>
    (
      await app.inject({
        method: 'GET',
        url: `/api/v1/colas/TM-CBZ${consulta}`,
        headers: conToken(token),
      })
    ).json() as Cola;

  it('HSEQ da de alta una placa que entra al final de su cola; la baja lógica la retira y conserva la ficha', async () => {
    const hseq = await login('hseq@asotracmet.test');
    const payload = {
      placa: 'zza 111',
      clase: 'TM',
      asociadoId: 'a-01',
      modelo: 2019,
      gpsProveedor: 'SATRACK',
    };
    const creado = await app.inject({
      method: 'POST',
      url: '/api/v1/vehiculos',
      headers: conToken(hseq),
      payload,
    });
    expect(creado.statusCode, creado.body).toBe(201);
    expect(creado.json()).toMatchObject({
      placa: 'ZZA111',
      claseCola: 'TM-CBZ',
      estado: 'activo',
      gpsProveedor: 'SATRACK',
      cola: [{ claseCola: 'TM-CBZ', accion: 'incorporado' }],
    });
    const id = (creado.json() as { id: string }).id;

    const ops = await login('ops@asotracmet.test');
    const conNueva = await cola(ops);
    expect(conNueva.total).toBe(11);
    expect(conNueva.posiciones.at(-1)?.placa).toBe('ZZA111');

    const repetida = await app.inject({
      method: 'POST',
      url: '/api/v1/vehiculos',
      headers: conToken(hseq),
      payload,
    });
    expect(repetida.statusCode).toBe(409);
    expect(repetida.json()).toMatchObject({ code: 'PLACA_EN_USO' });
    const opsCrea = await app.inject({
      method: 'POST',
      url: '/api/v1/vehiculos',
      headers: conToken(ops),
      payload: { placa: 'ZZB222', clase: 'TM', asociadoId: 'a-01' },
    });
    expect(opsCrea.statusCode).toBe(403);

    const baja = await app.inject({
      method: 'DELETE',
      url: `/api/v1/vehiculos/${id}`,
      headers: conToken(hseq),
    });
    expect(baja.statusCode, baja.body).toBe(200);
    expect(baja.json()).toMatchObject({
      estado: 'inactivo',
      cola: [{ claseCola: 'TM-CBZ', accion: 'retirado' }],
    });
    expect((baja.json() as { eliminadoEn: string | null }).eliminadoEn).not.toBeNull();
    expect((await cola(ops)).total).toBe(10);
    const ficha = await app.inject({
      method: 'GET',
      url: `/api/v1/vehiculos/${id}/ficha`,
      headers: conToken(hseq),
    });
    expect(ficha.statusCode).toBe(200);
    expect(ficha.json()).toMatchObject({ vehiculo: { placa: 'ZZA111' }, enCola: null });
  });

  it('cambiar estado o clase exige motivo y mueve la placa entre colas', async () => {
    const hseq = await login('hseq@asotracmet.test');
    const patch = (payload: Record<string, unknown>) =>
      app.inject({
        method: 'PATCH',
        url: '/api/v1/vehiculos/veh-SUL470',
        headers: conToken(hseq),
        payload,
      });
    expect((await patch({ estado: 'inactivo' })).statusCode).toBe(400);

    const taller = await patch({ estado: 'inactivo', motivo: 'Taller por dos semanas' });
    expect(taller.statusCode, taller.body).toBe(200);
    expect(taller.json()).toMatchObject({
      estado: 'inactivo',
      cola: [{ claseCola: 'TM-CBZ', accion: 'retirado' }],
    });
    const ops = await login('ops@asotracmet.test');
    expect((await cola(ops)).total).toBe(9);

    const vuelve = await patch({ estado: 'activo', motivo: 'Vuelve del taller' });
    expect(vuelve.json()).toMatchObject({ cola: [{ accion: 'incorporado' }] });
    const deVuelta = await cola(ops);
    expect(deVuelta.total).toBe(10);
    expect(deVuelta.posiciones.at(-1)?.placa).toBe('SUL470');

    const cambio = await patch({ clase: 'C100', motivo: 'Cambio de carrocería' });
    expect(cambio.json()).toMatchObject({ clase: 'C100', claseCola: 'C100' });
    expect((cambio.json() as { cola: unknown[] }).cola).toEqual([
      { claseCola: 'C100', accion: 'incorporado' },
      { claseCola: 'TM-CBZ', accion: 'retirado' },
    ]);
    const c100 = (
      await app.inject({ method: 'GET', url: '/api/v1/colas/C100', headers: conToken(ops) })
    ).json() as Cola;
    expect(c100.total).toBe(4);
    expect(c100.posiciones.at(-1)?.placa).toBe('SUL470');
    expect((await cola(ops)).total).toBe(9);
  });

  it('un SOAT vencido deja la placa no elegible; al renovarlo vuelve a serlo', async () => {
    const hseq = await login('hseq@asotracmet.test');
    const doc = await app.inject({
      method: 'POST',
      url: '/api/v1/documentos',
      headers: conToken(hseq),
      payload: {
        sujetoTipo: 'vehiculo',
        sujetoId: 'veh-FST189',
        tipoId: 'tipo-SOAT',
        numero: 'SOAT-189-2025',
        venceEn: '2026-09-01',
      },
    });
    expect(doc.statusCode, doc.body).toBe(201);
    expect(doc.json()).toMatchObject({
      estado: 'vencido',
      diasParaVencer: -15,
      tipo: { codigo: 'SOAT', bloqueante: true },
    });

    const ops = await login('ops@asotracmet.test');
    const bloqueada = await cola(ops, '?clienteId=cli-hlb');
    expect(bloqueada.posiciones.find((p) => p.placa === 'FST189')?.elegibilidad.motivo).toBe(
      'DOCUMENTO_VENCIDO',
    );

    const renovado = await app.inject({
      method: 'PATCH',
      url: `/api/v1/documentos/${(doc.json() as { id: string }).id}`,
      headers: conToken(hseq),
      payload: { venceEn: '2027-09-01' },
    });
    expect(renovado.json()).toMatchObject({ estado: 'vigente' });
    const libre = await cola(ops, '?clienteId=cli-hlb');
    expect(libre.posiciones.find((p) => p.placa === 'FST189')?.elegibilidad.elegible).toBe(true);

    const noAplica = await app.inject({
      method: 'POST',
      url: '/api/v1/documentos',
      headers: conToken(hseq),
      payload: { sujetoTipo: 'vehiculo', sujetoId: 'veh-FST189', tipoId: 'tipo-LICENCIA' },
    });
    expect(noAplica.statusCode).toBe(400);
    const finance = await login('finance@asotracmet.test');
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/documentos', headers: conToken(finance) }))
        .statusCode,
    ).toBe(403);
  });

  it('la ficha reúne asociado, conductores, documentos, habilitaciones y posición; viewer enmascarado; member solo lo suyo', async () => {
    const hseq = await login('hseq@asotracmet.test');
    const ficha = await app.inject({
      method: 'GET',
      url: '/api/v1/vehiculos/veh-FST189/ficha',
      headers: conToken(hseq),
    });
    expect(ficha.statusCode, ficha.body).toBe(200);
    expect(ficha.json()).toMatchObject({
      vehiculo: { placa: 'FST189', claseCola: 'TM-CBZ' },
      asociado: { documento: '10020000202', nombre: 'ASOCIADO 02 ANONIMIZADO' },
      conductores: [{ nombres: 'CONDUCTOR 01 ANONIMIZADO', esPrincipal: true }],
      semaforo: 'vigente',
      enCola: { placa: 'FST189', claseCola: 'TM-CBZ', posicion: 2, total: 10 },
    });
    expect((ficha.json() as { habilitaciones: unknown[] }).habilitaciones).toHaveLength(2);

    const viewer = await login('viewer@asotracmet.test');
    const enmascarada = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/vehiculos/veh-FST189/ficha',
        headers: conToken(viewer),
      })
    ).json() as {
      asociado: { documento: string; correo: string | null };
      conductores: Array<{ documento: string }>;
    };
    expect(enmascarada.asociado.documento).toMatch(/^\*+\d{4}$/);
    expect(enmascarada.asociado.correo).toBeNull();
    expect(enmascarada.conductores[0]?.documento).toMatch(/^\*+\d{4}$/);

    const ajeno = await login('member.swi750@asotracmet.test');
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/vehiculos/veh-FST189/ficha',
          headers: conToken(ajeno),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/vehiculos/veh-SWI750/ficha',
          headers: conToken(ajeno),
        })
      ).statusCode,
    ).toBe(200);

    const bloqueo = await app.inject({
      method: 'PUT',
      url: '/api/v1/vehiculos/veh-FST189/habilitaciones/cli-hlb',
      headers: conToken(hseq),
      payload: { apto: false, motivoBloqueo: 'Curso HLB vencido' },
    });
    expect(bloqueo.statusCode, bloqueo.body).toBe(200);
    expect(bloqueo.json()).toMatchObject({
      apto: false,
      cliente: 'HLB',
      motivoBloqueo: 'Curso HLB vencido',
    });
    const sinMotivo = await app.inject({
      method: 'PUT',
      url: '/api/v1/vehiculos/veh-FST189/habilitaciones/cli-hlb',
      headers: conToken(hseq),
      payload: { apto: false },
    });
    expect(sinMotivo.statusCode).toBe(400);
    const ops = await login('ops@asotracmet.test');
    const noApta = await cola(ops, '?clienteId=cli-hlb');
    expect(noApta.posiciones.find((p) => p.placa === 'FST189')?.elegibilidad.motivo).toBe(
      'VEHICULO_NO_HABILITADO',
    );
  });

  it('asociados y conductores: documento único, cuenta bancaria nunca sale, baja lógica', async () => {
    const superadmin = await login('superadmin@asotracmet.test');
    const payload = {
      tipo: 'persona',
      nombres: 'NUEVO',
      apellidos: 'ASOCIADO',
      documento: '10990001',
      celular: '3100000099',
      cuentaBancaria: '123456789012',
    };
    const creado = await app.inject({
      method: 'POST',
      url: '/api/v1/asociados',
      headers: conToken(superadmin),
      payload,
    });
    expect(creado.statusCode, creado.body).toBe(201);
    expect(creado.json()).toMatchObject({
      nombre: 'NUEVO ASOCIADO',
      documentoTipo: 'CC',
      cuentaBancariaRegistrada: true,
    });
    expect(creado.body).not.toContain('123456789012');
    const id = (creado.json() as { id: string }).id;
    const duplicado = await app.inject({
      method: 'POST',
      url: '/api/v1/asociados',
      headers: conToken(superadmin),
      payload,
    });
    expect(duplicado.statusCode).toBe(409);
    expect(duplicado.json()).toMatchObject({ code: 'DOCUMENTO_EN_USO' });
    const empresa = await app.inject({
      method: 'POST',
      url: '/api/v1/asociados',
      headers: conToken(superadmin),
      payload: { tipo: 'empresa', documento: '9020703052' },
    });
    expect(empresa.statusCode).toBe(400);

    const hseq = await login('hseq@asotracmet.test');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/asociados',
          headers: conToken(hseq),
          payload: { ...payload, documento: '10990002' },
        })
      ).statusCode,
    ).toBe(403);
    const editado = await app.inject({
      method: 'PATCH',
      url: `/api/v1/asociados/${id}`,
      headers: conToken(hseq),
      payload: { celular: '3100000098' },
    });
    expect(editado.statusCode, editado.body).toBe(200);
    expect(editado.json()).toMatchObject({ celular: '3100000098', cuentaBancariaRegistrada: true });

    const baja = await app.inject({
      method: 'DELETE',
      url: `/api/v1/asociados/${id}`,
      headers: conToken(superadmin),
    });
    expect(baja.json()).toMatchObject({ estado: 'retirado' });
    const lista = (
      await app.inject({ method: 'GET', url: '/api/v1/asociados', headers: conToken(superadmin) })
    ).json() as Array<{ id: string }>;
    expect(lista.some((a) => a.id === id)).toBe(false);
    const conEliminados = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/asociados?incluirEliminados=1',
        headers: conToken(superadmin),
      })
    ).json() as Array<{ id: string }>;
    expect(conEliminados.some((a) => a.id === id)).toBe(true);

    const conductor = await app.inject({
      method: 'POST',
      url: '/api/v1/conductores',
      headers: conToken(hseq),
      payload: {
        nombres: 'CONDUCTOR NUEVO',
        documento: '2001000303',
        licenciaCategoria: 'C3',
        licenciaVence: '2028-01-01',
      },
    });
    expect(conductor.statusCode, conductor.body).toBe(201);
    const asignado = await app.inject({
      method: 'PUT',
      url: '/api/v1/vehiculos/veh-SUL470/conductores',
      headers: conToken(hseq),
      payload: {
        conductores: [{ conductorId: (conductor.json() as { id: string }).id, esPrincipal: true }],
      },
    });
    expect(asignado.statusCode, asignado.body).toBe(200);
    expect(asignado.json()).toEqual([
      expect.objectContaining({ nombres: 'CONDUCTOR NUEVO', esPrincipal: true }),
    ]);
    const member = await login('member.fst189@asotracmet.test');
    const propios = (
      await app.inject({ method: 'GET', url: '/api/v1/conductores', headers: conToken(member) })
    ).json() as Array<{ nombres: string }>;
    expect(propios.map((c) => c.nombres)).toEqual(['CONDUCTOR 01 ANONIMIZADO']);
  });

  it('catálogos y tarifas: finance crea, ops solo actualiza, hseq no ve tarifas', async () => {
    const finance = await login('finance@asotracmet.test');
    const transportadora = await app.inject({
      method: 'POST',
      url: '/api/v1/transportadoras',
      headers: conToken(finance),
      payload: { nombre: 'nueva transportadora' },
    });
    expect(transportadora.statusCode, transportadora.body).toBe(201);
    expect(transportadora.json()).toMatchObject({ nombre: 'NUEVA TRANSPORTADORA', activo: true });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/transportadoras',
          headers: conToken(finance),
          payload: { nombre: 'nueva transportadora' },
        })
      ).statusCode,
    ).toBe(409);

    const destino = await app.inject({
      method: 'POST',
      url: '/api/v1/destinos',
      headers: conToken(finance),
      payload: { nombre: 'puerto lópez', km: 90 },
    });
    expect(destino.statusCode, destino.body).toBe(201);
    expect(destino.json()).toMatchObject({ nombre: 'PUERTO LÓPEZ', km: 90 });
    const destinoId = (destino.json() as { id: string }).id;

    const ops = await login('ops@asotracmet.test');
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/destinos/${destinoId}`,
          headers: conToken(ops),
          payload: { km: 95 },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/destinos',
          headers: conToken(ops),
          payload: { nombre: 'x y' },
        })
      ).statusCode,
    ).toBe(403);
    const member = await login('member.fst189@asotracmet.test');
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/transportadoras',
          headers: conToken(member),
        })
      ).statusCode,
    ).toBe(200);

    const payloadTarifa = {
      clienteId: 'cli-hlb',
      destinoId,
      clase: 'TM',
      modalidad: 'Cama_Alta',
      valor: 900_000,
      vigenciaDesde: '2026-10-01',
    };
    const tarifa = await app.inject({
      method: 'POST',
      url: '/api/v1/tarifas',
      headers: conToken(finance),
      payload: payloadTarifa,
    });
    expect(tarifa.statusCode, tarifa.body).toBe(201);
    expect(tarifa.json()).toMatchObject({
      modalidad: 'cama_alta',
      origen: 'VILLAVICENCIO',
      vigenciaHasta: null,
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/tarifas',
          headers: conToken(finance),
          payload: payloadTarifa,
        })
      ).statusCode,
    ).toBe(409);
    const hoy = (
      await app.inject({
        method: 'GET',
        url: `/api/v1/tarifas?vigentesEn=2026-09-16&destinoId=${destinoId}`,
        headers: conToken(finance),
      })
    ).json() as unknown[];
    expect(hoy).toEqual([]);
    const octubre = (
      await app.inject({
        method: 'GET',
        url: `/api/v1/tarifas?vigentesEn=2026-10-15&destinoId=${destinoId}`,
        headers: conToken(finance),
      })
    ).json() as unknown[];
    expect(octubre).toHaveLength(1);
    const hseq = await login('hseq@asotracmet.test');
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/tarifas', headers: conToken(hseq) }))
        .statusCode,
    ).toBe(403);
    const cerrada = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tarifas/${(tarifa.json() as { id: string }).id}`,
      headers: conToken(finance),
    });
    expect(cerrada.json()).toMatchObject({ vigenciaHasta: '2026-10-01' });
  });
});
