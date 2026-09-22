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

interface FilaCola {
  placa: string;
  elegibilidad: { elegible: boolean; motivo: string | null; detalle: string | null };
}

async function filaDeCola(token: string, placa: string): Promise<FilaCola | undefined> {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/colas/TM-CBZ?clienteId=cli-hlb',
    headers: conToken(token),
  });
  expect(res.statusCode, res.body).toBe(200);
  const cola = res.json() as { posiciones: FilaCola[] };
  expect(JSON.stringify(cola)).not.toMatch(/médico|examen/);
  return cola.posiciones.find((p) => p.placa === placa);
}

// Catálogo cerrado de motivos de bloqueo (spec §6.3, §12; TASK-0059): el texto libre se fue, la
// nota de HSEQ es interna y la cola (y por tanto el acta de turno) solo ve el nombre del catálogo.
describe('catálogo de motivos de bloqueo (spec §6.3, §12)', () => {
  const url = '/api/v1/vehiculos/veh-FST189/habilitaciones/cli-hlb';

  it('no apta exige código del catálogo; la vista trae código, nombre y nota; la cola solo el nombre', async () => {
    const hseq = await login('hseq@asotracmet.test');
    for (const payload of [
      { apto: false },
      { apto: false, nota: 'sin curso' },
      { apto: false, motivoBloqueo: 'Curso HLB vencido' },
      { apto: false, motivoBloqueoCodigo: 'CURSO_HLB' },
      { apto: false, motivoBloqueoCodigo: 'OTRO' },
    ]) {
      const res = await app.inject({ method: 'PUT', url, headers: conToken(hseq), payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect((res.json() as { code: string }).code).toBe('VALIDATION_ERROR');
    }

    const bloqueo = await app.inject({
      method: 'PUT',
      url,
      headers: conToken(hseq),
      payload: {
        apto: false,
        motivoBloqueoCodigo: 'CURSO_VENCIDO',
        nota: 'examen médico del conductor pendiente',
      },
    });
    expect(bloqueo.statusCode, bloqueo.body).toBe(200);
    expect(bloqueo.json()).toMatchObject({
      apto: false,
      cliente: 'HLB',
      motivoBloqueoCodigo: 'CURSO_VENCIDO',
      motivoBloqueo: 'Curso del cliente vencido',
      nota: 'examen médico del conductor pendiente',
    });
    const ficha = await app.inject({
      method: 'GET',
      url: '/api/v1/vehiculos/veh-FST189/ficha',
      headers: conToken(hseq),
    });
    const habilitacion = (
      ficha.json() as { habilitaciones: Array<{ clienteId: string; nota: string | null }> }
    ).habilitaciones.find((h) => h.clienteId === 'cli-hlb');
    expect(habilitacion).toMatchObject({
      motivoBloqueoCodigo: 'CURSO_VENCIDO',
      nota: 'examen médico del conductor pendiente',
    });

    // La cola (lo que lee el acta de turno) lleva el nombre del catálogo y nunca la nota.
    const ops = await login('ops@asotracmet.test');
    expect((await filaDeCola(ops, 'FST189'))?.elegibilidad).toEqual({
      elegible: false,
      motivo: 'VEHICULO_NO_HABILITADO',
      detalle: 'FST189 no apta para HLB (Curso del cliente vencido)',
    });
    // La semilla también viene del catálogo: SPS413 no está habilitada con HLB.
    expect((await filaDeCola(ops, 'SPS413'))?.elegibilidad.detalle).toBe(
      'SPS413 no apta para HLB (Curso del cliente vencido)',
    );

    // Volver a apta limpia código, nombre y nota; "OTRO" con nota sí vale.
    const apta = await app.inject({
      method: 'PUT',
      url,
      headers: conToken(hseq),
      payload: { apto: true },
    });
    expect(apta.statusCode, apta.body).toBe(200);
    expect(apta.json()).toMatchObject({
      apto: true,
      motivoBloqueoCodigo: null,
      motivoBloqueo: null,
      nota: null,
    });
    expect((await filaDeCola(ops, 'FST189'))?.elegibilidad.elegible).toBe(true);
    const otro = await app.inject({
      method: 'PUT',
      url,
      headers: conToken(hseq),
      payload: { apto: false, motivoBloqueoCodigo: 'OTRO', nota: 'Pendiente visita del cliente' },
    });
    expect(otro.statusCode, otro.body).toBe(200);
    expect((await filaDeCola(ops, 'FST189'))?.elegibilidad.detalle).toBe(
      'FST189 no apta para HLB (Otro motivo (ver nota))',
    );
  });

  it('un documento vencido del conductor no cuesta el turno de la placa: solo cuentan los del vehículo', async () => {
    const hseq = await login('hseq@asotracmet.test');
    const tipos = (
      await app.inject({ method: 'GET', url: '/api/v1/tipos-documento', headers: conToken(hseq) })
    ).json() as Array<{ id: string; codigo: string }>;
    const licencia = tipos.find((t) => t.codigo === 'LICENCIA')!;
    const soat = tipos.find((t) => t.codigo === 'SOAT')!;
    // con-01 es el conductor principal de FST189 y su licencia está vencida y es bloqueante.
    const delConductor = await app.inject({
      method: 'POST',
      url: '/api/v1/documentos',
      headers: conToken(hseq),
      payload: {
        sujetoTipo: 'conductor',
        sujetoId: 'con-01',
        tipoId: licencia.id,
        venceEn: '2026-09-01',
      },
    });
    expect(delConductor.statusCode, delConductor.body).toBe(201);
    expect(delConductor.json()).toMatchObject({ estado: 'vencido' });

    const ops = await login('ops@asotracmet.test');
    expect((await filaDeCola(ops, 'FST189'))?.elegibilidad).toEqual({
      elegible: true,
      motivo: null,
      detalle: null,
    });

    // Un documento del vehículo sí, y el detalle nombra solo ese tipo.
    const delVehiculo = await app.inject({
      method: 'POST',
      url: '/api/v1/documentos',
      headers: conToken(hseq),
      payload: {
        sujetoTipo: 'vehiculo',
        sujetoId: 'veh-FST189',
        tipoId: soat.id,
        venceEn: '2026-09-01',
      },
    });
    expect(delVehiculo.statusCode, delVehiculo.body).toBe(201);
    expect((await filaDeCola(ops, 'FST189'))?.elegibilidad).toEqual({
      elegible: false,
      motivo: 'DOCUMENTO_VENCIDO',
      detalle: 'FST189 con documento vencido: SOAT',
    });
  });
});
