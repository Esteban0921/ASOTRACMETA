import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { IdsSecuenciales, RelojFijo } from '@asotracmet/domain';
import { construirApp } from './app.js';
import { MensajeriaMemoria } from './auth/mensajeria.js';
import { codigoTotp } from './auth/totp.js';
import { PASSWORD_DEV, secretoTotpSemilla } from './seed.js';

// Viajes, recaudo y estado de cobro (TASK-0027, spec §6.5, §8.4, §9.2 Finance, §20.7).
// El viaje nace de un TR aceptado en el flujo real; el 3 % es un parámetro y queda como snapshot.

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

interface TrCreado {
  id: string;
  codigo: string;
  placa: string;
}

/** ops ofrece el cupo HLB · Castilla y el asociado dueño (FST189 y TKM221) acepta: nace el TR. */
async function crearTr(): Promise<TrCreado> {
  const ops = await login('ops@asotracmet.test');
  const oferta = await app.inject({
    method: 'POST',
    url: '/api/v1/requerimientos/req-hlb-castilla/ofertas',
    headers: conToken(ops),
  });
  expect(oferta.statusCode, oferta.body).toBe(201);
  const dueno = await login('member.fst189@asotracmet.test');
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/ofertas/${(oferta.json() as { id: string }).id}/aceptar`,
    headers: conToken(dueno),
  });
  expect(res.statusCode, res.body).toBe(200);
  return (res.json() as { tr: TrCreado }).tr;
}

interface Viaje {
  id: string;
  estado: string;
  flete: number | null;
  porcentajeAplicado: number | null;
  valorRecaudo: number | null;
  valorPagado: number;
  tarifaId: string | null;
  asociadoDocumento: string | null;
  etiqueta: string;
  tarifasSugeridas: Array<{ id: string; modalidad: string; valor: number }>;
  recaudo: { id: string; valor: number; estado: string } | null;
}

async function crearViaje(
  token: string,
  trId: string,
  extra: Record<string, unknown> = {},
): Promise<Viaje> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/viajes',
    headers: conToken(token),
    payload: { trId, ...extra },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as Viaje;
}

beforeAll(async () => {
  reloj = new RelojFijo(INICIO);
  mensajeria = new MensajeriaMemoria(reloj);
  ({ app } = await construirApp({
    config: { logger: false, modoE2e: true, loginRateLimitMax: 10_000 },
    reloj,
    ids: new IdsSecuenciales('viajes'),
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

describe('viajes y recaudo (spec §6.5, §9.2 Finance, §20.7)', () => {
  it('finance crea el viaje desde el TR con la tarifa sugerida, fija el flete y liquida: nace el recaudo y el TR queda cumplido', async () => {
    const tr = await crearTr();
    const finance = await login('finance@asotracmet.test');
    const viaje = await crearViaje(finance, tr.id, {
      fechaCargue: '2026-09-17',
      lugarDescargue: 'CASTILLA',
      flete: 1_500_000,
    });
    expect(viaje).toMatchObject({
      estado: 'cargado',
      flete: 1_500_000,
      valorRecaudo: null,
      tarifaId: 'tar-hlb-castilla-tm',
      etiqueta: 'ASOCIADO 02 ANONIMIZADO · FST189',
      recaudo: null,
    });
    expect(viaje.tarifasSugeridas).toEqual([
      { id: 'tar-hlb-castilla-tm', modalidad: 'cama_alta', valor: 850_000 },
    ]);

    const liquidado = await app.inject({
      method: 'POST',
      url: `/api/v1/viajes/${viaje.id}/liquidar`,
      headers: conToken(finance),
    });
    expect(liquidado.statusCode, liquidado.body).toBe(200);
    expect(liquidado.json()).toMatchObject({
      estado: 'liquidado',
      porcentajeAplicado: 0.03,
      valorRecaudo: 45_000,
      valorPagado: 0,
      recaudo: { valor: 45_000, estado: 'pendiente' },
    });

    const trCerrado = await app.inject({
      method: 'GET',
      url: `/api/v1/trs/${tr.id}`,
      headers: conToken(finance),
    });
    expect(trCerrado.json()).toMatchObject({ codigo: tr.codigo, estado: 'cumplido' });

    const audit = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/audit?entidad=viajes',
        headers: conToken(finance),
      })
    ).json() as Array<{ accion: string }>;
    expect(audit.map((a) => a.accion).sort()).toEqual(['viaje.crear', 'viaje.liquidar']);
  });

  it('cambiar recaudo_porcentaje afecta solo a los viajes nuevos; los viejos conservan su snapshot (§20.7)', async () => {
    const finance = await login('finance@asotracmet.test');
    const primero = await crearViaje(finance, (await crearTr()).id, { flete: 1_500_000 });
    await app.inject({
      method: 'POST',
      url: `/api/v1/viajes/${primero.id}/liquidar`,
      headers: conToken(finance),
    });

    const superadmin = await login('superadmin@asotracmet.test');
    const cambio = await app.inject({
      method: 'PATCH',
      url: '/api/v1/parametros',
      headers: conToken(superadmin),
      payload: { recaudo_porcentaje: 0.05 },
    });
    expect(cambio.statusCode, cambio.body).toBe(200);

    const segundo = await crearViaje(finance, (await crearTr()).id);
    const liquidado = await app.inject({
      method: 'POST',
      url: `/api/v1/viajes/${segundo.id}/liquidar`,
      headers: conToken(finance),
      payload: { flete: 1_500_000 },
    });
    expect(liquidado.json()).toMatchObject({ porcentajeAplicado: 0.05, valorRecaudo: 75_000 });

    const viejo = await app.inject({
      method: 'GET',
      url: `/api/v1/viajes/${primero.id}`,
      headers: conToken(finance),
    });
    expect(viejo.json()).toMatchObject({ porcentajeAplicado: 0.03, valorRecaudo: 45_000 });

    const resumen = await app.inject({
      method: 'GET',
      url: '/api/v1/viajes/resumen?mes=2026-09',
      headers: conToken(finance),
    });
    expect(resumen.json()).toMatchObject({
      mes: '2026-09',
      porcentajeVigente: 0.05,
      viajes: 2,
      liquidados: 2,
      flete: 3_000_000,
      recaudo: 120_000,
      pagado: 0,
      pendiente: 120_000,
      porCliente: [{ cliente: 'HLB', viajes: 2, recaudo: 120_000 }],
    });
  });

  it('el estado de cobro sigue a los pagos: parcial, pagado, y no admite pagar de más ni liquidar dos veces', async () => {
    const finance = await login('finance@asotracmet.test');
    const viaje = await crearViaje(finance, (await crearTr()).id, { flete: 1_500_000 });
    const liquidado = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/viajes/${viaje.id}/liquidar`,
        headers: conToken(finance),
      })
    ).json() as Viaje;
    const recaudoId = liquidado.recaudo!.id;

    const parcial = await app.inject({
      method: 'POST',
      url: `/api/v1/recaudos/${recaudoId}/pagos`,
      headers: conToken(finance),
      payload: { valor: 20_000, fechaPago: '2026-09-20', referencia: '98765' },
    });
    expect(parcial.statusCode, parcial.body).toBe(200);
    expect(parcial.json()).toMatchObject({
      estado: 'parcial',
      valorPagado: 20_000,
      referencia: '98765',
    });

    const exceso = await app.inject({
      method: 'POST',
      url: `/api/v1/recaudos/${recaudoId}/pagos`,
      headers: conToken(finance),
      payload: { valor: 100_000, fechaPago: '2026-09-21' },
    });
    expect(exceso.statusCode).toBe(422);
    expect(exceso.json()).toMatchObject({ code: 'PAGO_INVALIDO' });

    const total = await app.inject({
      method: 'POST',
      url: `/api/v1/recaudos/${recaudoId}/pagos`,
      headers: conToken(finance),
      payload: { valor: 25_000, fechaPago: '2026-09-22' },
    });
    expect(total.json()).toMatchObject({
      estado: 'pagado',
      valorPagado: 45_000,
      fechaPago: '2026-09-22',
    });

    const cerrado = await app.inject({
      method: 'POST',
      url: `/api/v1/recaudos/${recaudoId}/pagos`,
      headers: conToken(finance),
      payload: { valor: 1, fechaPago: '2026-09-23' },
    });
    expect(cerrado.json()).toMatchObject({ code: 'RECAUDO_CERRADO' });

    const otraVez = await app.inject({
      method: 'POST',
      url: `/api/v1/viajes/${viaje.id}/liquidar`,
      headers: conToken(finance),
    });
    expect(otraVez.json()).toMatchObject({ code: 'VIAJE_LIQUIDADO' });

    const flete = await app.inject({
      method: 'PATCH',
      url: `/api/v1/viajes/${viaje.id}`,
      headers: conToken(finance),
      payload: { flete: 2_000_000 },
    });
    expect(flete.json()).toMatchObject({ code: 'VIAJE_LIQUIDADO' });

    const recaudos = await app.inject({
      method: 'GET',
      url: '/api/v1/recaudos?mes=2026-09&estado=pagado',
      headers: conToken(finance),
    });
    expect(recaudos.json()).toHaveLength(1);
  });

  it('un TR cancelado no admite viaje, un TR no tiene dos viajes, y sin flete no se liquida', async () => {
    const finance = await login('finance@asotracmet.test');
    const tr = await crearTr();
    const viaje = await crearViaje(finance, tr.id);
    const duplicado = await app.inject({
      method: 'POST',
      url: '/api/v1/viajes',
      headers: conToken(finance),
      payload: { trId: tr.id },
    });
    expect(duplicado.statusCode).toBe(409);
    expect(duplicado.json()).toMatchObject({ code: 'VIAJE_YA_EXISTE' });

    const sinFlete = await app.inject({
      method: 'POST',
      url: `/api/v1/viajes/${viaje.id}/liquidar`,
      headers: conToken(finance),
    });
    expect(sinFlete.statusCode).toBe(422);
    expect(sinFlete.json()).toMatchObject({ code: 'VIAJE_NO_LIQUIDABLE' });

    const ops = await login('ops@asotracmet.test');
    const otroTr = await crearTr();
    await app.inject({
      method: 'POST',
      url: `/api/v1/trs/${otroTr.id}/cancelar`,
      headers: conToken(ops),
      payload: { motivo: 'Cliente canceló el servicio' },
    });
    const cancelado = await app.inject({
      method: 'POST',
      url: '/api/v1/viajes',
      headers: conToken(finance),
      payload: { trId: otroTr.id },
    });
    expect(cancelado.statusCode).toBe(422);
    expect(cancelado.json()).toMatchObject({ code: 'TR_NO_VIAJABLE' });
  });

  it('anular un viaje liquidado sin pagos castiga el recaudo y lo saca del resumen', async () => {
    const finance = await login('finance@asotracmet.test');
    const viaje = await crearViaje(finance, (await crearTr()).id, { flete: 1_000_000 });
    await app.inject({
      method: 'POST',
      url: `/api/v1/viajes/${viaje.id}/liquidar`,
      headers: conToken(finance),
    });
    const anulado = await app.inject({
      method: 'POST',
      url: `/api/v1/viajes/${viaje.id}/anular`,
      headers: conToken(finance),
      payload: { motivo: 'Servicio no prestado' },
    });
    expect(anulado.statusCode, anulado.body).toBe(200);
    expect(anulado.json()).toMatchObject({
      estado: 'anulado',
      recaudo: { estado: 'castigado' },
    });
    const resumen = await app.inject({
      method: 'GET',
      url: '/api/v1/viajes/resumen?mes=2026-09',
      headers: conToken(finance),
    });
    expect(resumen.json()).toMatchObject({ viajes: 0, recaudo: 0 });
  });

  it('RBAC: ops actualiza pero no crea ni liquida; viewer y member ven la cédula enmascarada; member solo lo suyo', async () => {
    const finance = await login('finance@asotracmet.test');
    const tr = await crearTr();
    const viaje = await crearViaje(finance, tr.id, { flete: 1_500_000 });

    const ops = await login('ops@asotracmet.test');
    const creaOps = await app.inject({
      method: 'POST',
      url: '/api/v1/viajes',
      headers: conToken(ops),
      payload: { trId: tr.id },
    });
    expect(creaOps.statusCode).toBe(403);
    const editaOps = await app.inject({
      method: 'PATCH',
      url: `/api/v1/viajes/${viaje.id}`,
      headers: conToken(ops),
      payload: { lugarDescargue: 'CASTILLA 60', fechaCargue: '2026-09-17' },
    });
    expect(editaOps.statusCode, editaOps.body).toBe(200);
    expect(editaOps.json()).toMatchObject({ lugarDescargue: 'CASTILLA 60', estado: 'cargado' });
    const liquidaOps = await app.inject({
      method: 'POST',
      url: `/api/v1/viajes/${viaje.id}/liquidar`,
      headers: conToken(ops),
    });
    expect(liquidaOps.statusCode).toBe(403);

    const viewer = await login('viewer@asotracmet.test');
    const lista = (
      await app.inject({ method: 'GET', url: '/api/v1/viajes', headers: conToken(viewer) })
    ).json() as Viaje[];
    expect(lista).toHaveLength(1);
    expect(lista[0]?.asociadoDocumento).toMatch(/^\*+\d{4}$/);
    const completa = (
      await app.inject({ method: 'GET', url: '/api/v1/viajes', headers: conToken(finance) })
    ).json() as Viaje[];
    expect(completa[0]?.asociadoDocumento).toBe('10020000202');

    const ajeno = await login('member.swi750@asotracmet.test');
    const nada = await app.inject({
      method: 'GET',
      url: '/api/v1/viajes',
      headers: conToken(ajeno),
    });
    expect(nada.json()).toEqual([]);
    const negado = await app.inject({
      method: 'GET',
      url: `/api/v1/viajes/${viaje.id}`,
      headers: conToken(ajeno),
    });
    expect(negado.statusCode).toBe(403);
    expect(negado.json()).toMatchObject({ code: 'FORBIDDEN_OWN_SCOPE' });

    const dueno = await login('member.fst189@asotracmet.test');
    const mios = (
      await app.inject({ method: 'GET', url: '/api/v1/viajes', headers: conToken(dueno) })
    ).json() as Viaje[];
    expect(mios).toHaveLength(1);
    expect(mios[0]?.asociadoDocumento).toMatch(/^\*+\d{4}$/);
    const resumenMember = await app.inject({
      method: 'GET',
      url: '/api/v1/viajes/resumen?mes=2026-09',
      headers: conToken(dueno),
    });
    expect(resumenMember.statusCode).toBe(403);
  });
});
