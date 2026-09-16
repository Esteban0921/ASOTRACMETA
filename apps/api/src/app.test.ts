import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { AlmacenMemoria, IdsSecuenciales, RelojFijo, type Transaccion } from '@asotracmet/domain';
import type { ClaseCola } from '@asotracmet/shared';
import { construirApp, type AppConstruida } from './app.js';
import { PASSWORD_DEV, crearSeed } from './seed.js';
import { AlmacenUsuarios } from './usuarios.js';

let construida: AppConstruida;
let app: FastifyInstance;
let reloj: RelojFijo;

async function login(email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: PASSWORD_DEV },
  });
  expect(res.statusCode, res.body).toBe(200);
  return (res.json() as { token: string }).token;
}

function conToken(token: string) {
  return { authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  reloj = new RelojFijo('2026-09-16T13:00:00Z');
  construida = await construirApp({
    config: { logger: false, modoE2e: true, loginRateLimitMax: 10_000 },
    reloj,
    ids: new IdsSecuenciales('api'),
  });
  app = construida.app;
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
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

  it('credenciales inválidas → 401; válidas → token y usuario', async () => {
    const mal = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'ops@asotracmet.test', password: 'incorrecta!' },
    });
    expect(mal.statusCode).toBe(401);
    const token = await login('ops@asotracmet.test');
    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: conToken(token) });
    expect(me.json()).toMatchObject({ rol: 'admin_ops', email: 'ops@asotracmet.test' });
  });

  it('el token expira según la duración del rol (superadmin 4 h)', async () => {
    const token = await login('superadmin@asotracmet.test');
    reloj.avanzarMinutos(4 * 60 + 1);
    const res = await app.inject({ method: 'GET', url: '/api/v1/me', headers: conToken(token) });
    expect(res.statusCode).toBe(401);
    reloj.fijar('2026-09-16T13:00:00Z');
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
    reloj.avanzarMinutos(121);
    const superadmin = await login('superadmin@asotracmet.test');
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
    reloj.fijar('2026-09-16T13:00:00Z');
  });
});

describe('concurrencia HTTP (spec §16, §20.3)', () => {
  it('20 POST /ofertas paralelos sobre la misma clase → 1×201 y 19×409 COLA_LOCKED', async () => {
    // Almacén con transacciones lentas para garantizar solape real entre requests.
    const relojLento = new RelojFijo('2026-09-16T13:00:00Z');
    const ids = new IdsSecuenciales('lento');
    const seed = crearSeed(relojLento.ahora());
    const almacen = new AlmacenMemoria(seed.estado, { reloj: relojLento, ids });
    const original = almacen.ejecutar.bind(almacen);
    almacen.ejecutar = <T>(clase: ClaseCola | null, fn: (tx: Transaccion) => Promise<T>) =>
      original(clase, async (tx) => {
        await new Promise((r) => setTimeout(r, 30));
        return fn(tx);
      });
    const lenta = await construirApp({
      config: { logger: false, loginRateLimitMax: 10_000 },
      reloj: relojLento,
      ids,
      almacen,
      usuarios: new AlmacenUsuarios(seed.usuarios),
    });
    await lenta.app.ready();
    try {
      const loginRes = await lenta.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'ops@asotracmet.test', password: PASSWORD_DEV },
      });
      const token = (loginRes.json() as { token: string }).token;
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
