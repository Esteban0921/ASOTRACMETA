import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { IdsSecuenciales, RelojFijo } from '@asotracmet/domain';
import type { ResultadoIngestaGps, VistaFicha, VistaUbicacion } from '@asotracmet/shared';
import { construirApp } from './app.js';
import { MensajeriaMemoria } from './auth/mensajeria.js';
import { codigoTotp } from './auth/totp.js';
import type { Almacenamiento } from './persistencia/almacenamiento.js';
import { PASSWORD_DEV, secretoTotpSemilla } from './seed.js';

// Ingesta de ubicaciones GPS (ADR-0007, TASK-0062). El agente satélite es el único que habla con
// las plataformas; aquí se prueba el contrato de entrada: token de servicio, idempotencia por
// placa e instante, y qué se descarta sin romper el lote. La semilla trae 17 placas activas.

const INICIO = '2026-09-16T13:00:00Z';
const TOKEN = 'token-de-ingesta-para-pruebas-0123456789';
const TOKEN_ANTERIOR = 'token-anterior-para-pruebas-9876543210';

let app: FastifyInstance;
let almacenamiento: Almacenamiento;
let reloj: RelojFijo;
let lineasLog: string[] = [];

const lote = (ubicaciones: unknown[], loteId = '0199b1f0-1111-7000-8000-00000000000a') => ({
  loteId,
  cuentaId: 'cuenta-uno',
  ubicaciones,
});

const lectura = (placa: string, extra: Record<string, unknown> = {}) => ({
  placa,
  latitud: 4.1421,
  longitud: -73.6266,
  capturadaEn: INICIO,
  proveedor: 'SATRACK',
  ...extra,
});

function ingerir(cuerpo: unknown, token: string | null = TOKEN) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/gps/ubicaciones',
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
    payload: cuerpo as Record<string, unknown>,
  });
}

let mensajeria: MensajeriaMemoria;
let ultimoPasoLogin = new Date(INICIO).getTime();

const conToken = (token: string) => ({ authorization: `Bearer ${token}` });

/** Acceso por rol, como en el resto de los tests de API: TOTP para internos, enlace para member. */
async function login(email: string): Promise<string> {
  if (email.startsWith('member.')) {
    await app.inject({ method: 'POST', url: '/api/v1/auth/magic-link', payload: { email } });
    const enlace = mensajeria.ultimoPara(email)?.enlace;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/magic-link/canjear',
      payload: { token: new URL(enlace!).searchParams.get('token') },
    });
    expect(res.statusCode, res.body).toBe(200);
    return (res.json() as { token: string }).token;
  }
  // Anti-replay TOTP (TASK-0040): cada acceso cae en un paso de 30 s nunca usado, aunque el caso
  // anterior haya movido el reloj hacia atrás. Al terminar se devuelve el reloj donde estaba.
  const delTest = reloj.ahora();
  ultimoPasoLogin = Math.max(ultimoPasoLogin, delTest.getTime()) + 30_000;
  reloj.fijar(new Date(ultimoPasoLogin).toISOString());
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
  reloj.fijar(delTest.toISOString());
  expect(res.statusCode, res.body).toBe(200);
  return (res.json() as { token: string }).token;
}

function ubicaciones(token: string) {
  return app.inject({
    method: 'GET',
    url: '/api/v1/vehiculos/ubicaciones',
    headers: conToken(token),
  });
}

async function construir(tokens: string[]): Promise<void> {
  if (app) await app.close();
  reloj = new RelojFijo(INICIO);
  mensajeria = new MensajeriaMemoria(reloj);
  const construida = await construirApp({
    config: {
      logger: false,
      gpsIngestaTokens: tokens,
      gpsIngestaRateLimitMax: 10_000,
      // Este archivo entra y sale con varios roles; el límite real de acceso se prueba aparte.
      loginRateLimitMax: 10_000,
    },
    reloj,
    ids: new IdsSecuenciales('gps'),
    mensajeria,
  });
  app = construida.app;
  almacenamiento = construida.almacenamiento;
  ultimoPasoLogin = new Date(INICIO).getTime();
  lineasLog = [];
  // El log del servidor no puede llevar coordenadas ni el token (spec §12, RULE-021).
  app.log.info = ((datos: unknown, mensaje?: string) => {
    lineasLog.push(JSON.stringify({ datos, mensaje }));
  }) as typeof app.log.info;
}

beforeAll(async () => {
  await construir([TOKEN, TOKEN_ANTERIOR]);
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  almacenamiento.ubicaciones.limpiar?.();
  lineasLog = [];
});

describe('ingesta de ubicaciones GPS (ADR-0007)', () => {
  it('sin token responde 401 y no guarda nada', async () => {
    const res = await ingerir(lote([lectura('FST189')]), null);
    expect(res.statusCode).toBe(401);
    expect(await almacenamiento.ubicaciones.ultimas()).toHaveLength(0);
  });

  it('con un token que no es el configurado responde 401', async () => {
    const res = await ingerir(lote([lectura('FST189')]), 'token-inventado-que-no-es-el-bueno-000');
    expect(res.statusCode).toBe(401);
  });

  it('acepta el token anterior mientras se rota', async () => {
    const res = await ingerir(lote([lectura('FST189')]), TOKEN_ANTERIOR);
    expect(res.statusCode, res.body).toBe(200);
  });

  it('guarda un lote válido y devuelve cada cuántos minutos volver', async () => {
    const res = await ingerir(lote([lectura('FST189'), lectura('SWI750')]));
    expect(res.statusCode, res.body).toBe(200);
    const cuerpo = res.json() as ResultadoIngestaGps;
    expect(cuerpo.recibidas).toBe(2);
    expect(cuerpo.guardadas).toBe(2);
    expect(cuerpo.duplicadas).toBe(0);
    expect(cuerpo.ignoradas).toBe(0);
    // El intervalo sale de `parametros`, no de una constante del agente (RULE-012).
    expect(cuerpo.intervaloMinutos).toBe(20);
    expect(await almacenamiento.ubicaciones.ultimas()).toHaveLength(2);
  });

  it('reenviar el mismo lote no duplica: es idempotente por placa e instante', async () => {
    await ingerir(lote([lectura('FST189')]));
    const res = await ingerir(lote([lectura('FST189')]));
    const cuerpo = res.json() as ResultadoIngestaGps;
    expect(cuerpo.guardadas).toBe(0);
    expect(cuerpo.duplicadas).toBe(1);
    expect(await almacenamiento.ubicaciones.ultimas()).toHaveLength(1);
  });

  it('el lote vacío con el que el agente comprueba el token responde 200 sin guardar', async () => {
    const res = await ingerir(lote([]));
    expect(res.statusCode, res.body).toBe(200);
    const cuerpo = res.json() as ResultadoIngestaGps;
    expect(cuerpo.recibidas).toBe(0);
    expect(cuerpo.guardadas).toBe(0);
    expect(cuerpo.intervaloMinutos).toBe(20);
  });

  it('una placa que no está en los maestros se reporta, no rompe el lote', async () => {
    const res = await ingerir(lote([lectura('ZZZ999'), lectura('FST189')]));
    const cuerpo = res.json() as ResultadoIngestaGps;
    expect(cuerpo.guardadas).toBe(1);
    expect(cuerpo.ignoradas).toBe(1);
    expect(cuerpo.placasDesconocidas).toEqual(['ZZZ999']);
  });

  it('descarta capturas con el reloj del GPS en el futuro', async () => {
    const futura = new Date(reloj.ahora().getTime() + 60 * 60_000).toISOString();
    const res = await ingerir(lote([lectura('FST189', { capturadaEn: futura })]));
    const cuerpo = res.json() as ResultadoIngestaGps;
    expect(cuerpo.guardadas).toBe(0);
    expect(cuerpo.ignoradas).toBe(1);
  });

  it('descarta capturas más viejas que la retención', async () => {
    const vieja = new Date(reloj.ahora().getTime() - 400 * 24 * 60 * 60_000).toISOString();
    const res = await ingerir(lote([lectura('FST189', { capturadaEn: vieja })]));
    expect((res.json() as ResultadoIngestaGps).ignoradas).toBe(1);
  });

  it('no cuenta discrepancia de proveedor si la ficha no declara ninguno', async () => {
    const res = await ingerir(lote([lectura('SWI750', { proveedor: '  SATRACK  ' })]));
    expect((res.json() as ResultadoIngestaGps).proveedorDistinto).toBe(0);
  });

  it('un cuerpo con campos de más del proveedor es 400: minimización (spec §12)', async () => {
    const res = await ingerir(lote([lectura('FST189', { conductor: 'Nombre Apellido' })]));
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code: string }).code).toBe('VALIDATION_ERROR');
  });

  it('la línea de log de la ingesta no lleva coordenadas, placas ni el token', async () => {
    await ingerir(lote([lectura('FST189')]));
    // Solo la línea que escribe la ruta: el log de petición de Fastify es otra cosa y en
    // producción sus serializadores no incluyen el cuerpo.
    const propia = lineasLog.filter((l) => l.includes('gps ingesta'));
    expect(propia).toHaveLength(1);
    const registrado = propia.join(' ');
    expect(registrado).not.toContain('FST189');
    expect(registrado).not.toContain('4.1421');
    expect(registrado).not.toContain(TOKEN);
    // Sí lleva los conteos, que es lo que sirve para operar.
    expect(registrado).toContain('"guardadas":1');
  });

  it('sin tokens configurados la ruta existe pero rechaza todo (satélite apagado)', async () => {
    await construir([]);
    const res = await ingerir(lote([lectura('FST189')]));
    expect(res.statusCode).toBe(401);
    await construir([TOKEN, TOKEN_ANTERIOR]);
  });
});

describe('lectura de ubicaciones por rol (TASK-0063, criterio §20.11)', () => {
  beforeEach(async () => {
    // FST189 y TKM221 son del mismo asociado (member.fst189); SWI750 es de otro.
    await ingerir(lote([lectura('FST189'), lectura('TKM221'), lectura('SWI750')]));
  });

  it('un rol interno ve todas las placas que reportaron, con coordenadas', async () => {
    const res = await ubicaciones(await login('ops@asotracmet.test'));
    expect(res.statusCode, res.body).toBe(200);
    const filas = res.json() as VistaUbicacion[];
    expect(filas.map((f) => f.placa)).toEqual(['FST189', 'SWI750', 'TKM221']);
    expect(filas[0]!.latitud).toBeCloseTo(4.1421);
    expect(filas[0]!.enmascarada).toBe(false);
    expect(filas[0]!.frescura).toBe('reciente');
  });

  it('el asociado solo ve las suyas', async () => {
    const res = await ubicaciones(await login('member.fst189@asotracmet.test'));
    expect(res.statusCode, res.body).toBe(200);
    const placas = (res.json() as VistaUbicacion[]).map((f) => f.placa);
    expect(placas).toEqual(['FST189', 'TKM221']);
    expect(placas).not.toContain('SWI750');
  });

  it('el veedor recibe la frescura sin coordenadas ni velocidad', async () => {
    const res = await ubicaciones(await login('viewer@asotracmet.test'));
    expect(res.statusCode, res.body).toBe(200);
    const filas = res.json() as VistaUbicacion[];
    expect(filas).toHaveLength(3);
    for (const fila of filas) {
      expect(fila.enmascarada).toBe(true);
      expect(fila.latitud).toBeNull();
      expect(fila.longitud).toBeNull();
      expect(fila.velocidadKmh).toBeNull();
      // Lo que sí necesita para vigilar la cola: si el camión reporta y hace cuánto.
      expect(fila.frescura).toBe('reciente');
      expect(typeof fila.minutosDesde).toBe('number');
    }
  });

  it('la ficha del vehículo trae la ubicación, y al veedor se la enmascara igual', async () => {
    const ficha = async (email: string) =>
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/vehiculos/veh-FST189/ficha',
          headers: conToken(await login(email)),
        })
      ).json() as VistaFicha;

    const deOps = await ficha('ops@asotracmet.test');
    expect(deOps.ubicacion?.latitud).toBeCloseTo(4.1421);

    const delVeedor = await ficha('viewer@asotracmet.test');
    expect(delVeedor.ubicacion?.enmascarada).toBe(true);
    expect(delVeedor.ubicacion?.latitud).toBeNull();
  });

  it('la frescura cambia con el reloj según los parámetros, no según el navegador', async () => {
    const token = await login('ops@asotracmet.test');
    reloj.fijar(new Date(new Date(INICIO).getTime() + 45 * 60_000).toISOString());
    const desactualizada = (await ubicaciones(token)).json() as VistaUbicacion[];
    expect(desactualizada[0]!.frescura).toBe('desactualizada');
    expect(desactualizada[0]!.minutosDesde).toBe(45);

    reloj.fijar(new Date(new Date(INICIO).getTime() + 5 * 60 * 60_000).toISOString());
    const sinSenal = (await ubicaciones(token)).json() as VistaUbicacion[];
    expect(sinSenal[0]!.frescura).toBe('sin_senal');
    reloj.fijar(INICIO);
  });

  it('la purga conserva la última lectura de cada placa y queda auditada', async () => {
    // Una lectura vieja de FST189 además de la reciente del `beforeEach`.
    await ingerir(
      lote(
        [lectura('FST189', { capturadaEn: '2026-09-14T13:00:00Z' })],
        '0199b1f0-1111-7000-8000-00000000000f',
      ),
    );
    const token = await login('superadmin@asotracmet.test');
    // El corte sale del parámetro, no de una constante: con un día, la del 14 queda fuera.
    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/v1/parametros',
      headers: conToken(token),
      payload: { gps_retencion_dias: 1 },
    });
    expect(patch.statusCode, patch.body).toBe(200);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs/purgar-ubicaciones',
      headers: conToken(token),
    });
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as { borradas: number }).borradas).toBe(1);
    // Queda la última de cada placa: la ficha puede decir "sin señal desde…".
    expect(await almacenamiento.ubicaciones.ultimas()).toHaveLength(3);

    const audit = await app.inject({
      method: 'GET',
      url: '/api/v1/audit?entidad=vehiculos',
      headers: conToken(token),
    });
    const acciones = (audit.json() as { accion: string }[]).map((e) => e.accion);
    expect(acciones).toContain('gps.purgar');
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/parametros',
      headers: conToken(token),
      payload: { gps_retencion_dias: 30 },
    });
  });

  it('el recorrido de una placa lo ve el coordinador y el dueño, nunca el veedor ni un ajeno', async () => {
    // Dos lecturas más de FST189 en horas distintas: eso es el recorrido.
    await ingerir(
      lote(
        [
          lectura('FST189', { capturadaEn: '2026-09-16T12:00:00Z', latitud: 4.2 }),
          lectura('FST189', { capturadaEn: '2026-09-16T11:00:00Z', latitud: 4.3 }),
        ],
        '0199b1f0-1111-7000-8000-0000000000aa',
      ),
    );
    const recorrido = async (email: string, id = 'veh-FST189', query = '') =>
      app.inject({
        method: 'GET',
        url: `/api/v1/vehiculos/${id}/ubicaciones${query}`,
        headers: conToken(await login(email)),
      });

    const deOps = await recorrido('ops@asotracmet.test');
    expect(deOps.statusCode, deOps.body).toBe(200);
    const puntos = deOps.json() as VistaUbicacion[];
    expect(puntos).toHaveLength(3);
    // Del más reciente al más antiguo, con coordenadas.
    expect(puntos[0]!.capturadaEn > puntos[1]!.capturadaEn).toBe(true);
    expect(puntos[0]!.latitud).not.toBeNull();

    const delDueno = await recorrido('member.fst189@asotracmet.test');
    expect(delDueno.statusCode).toBe(200);

    const deOtro = await recorrido('member.swi750@asotracmet.test');
    expect(deOtro.statusCode).toBe(403);
    expect((deOtro.json() as { code: string }).code).toBe('FORBIDDEN_OWN_SCOPE');

    // El veedor no sigue camiones: su función es la equidad de la cola.
    const delVeedor = await recorrido('viewer@asotracmet.test');
    expect(delVeedor.statusCode).toBe(403);
    expect((delVeedor.json() as { code: string }).code).toBe('FORBIDDEN');

    const acotado = await recorrido('ops@asotracmet.test', 'veh-FST189', '?limite=1');
    expect(acotado.json() as VistaUbicacion[]).toHaveLength(1);
  });

  it('habeas data: se borra el historial de una placa con motivo, re-autenticación y rastro', async () => {
    const token = await login('superadmin@asotracmet.test');
    const borrar = (cabeceras: Record<string, string>) =>
      app.inject({
        method: 'DELETE',
        url: '/api/v1/vehiculos/veh-FST189/ubicaciones',
        headers: cabeceras,
        payload: { motivo: 'El propietario retiró su autorización' },
      });

    // Sin confirmar identidad no se borra nada: es una acción sensible como el reset de cola.
    const sinReauth = await borrar(conToken(token));
    expect(sinReauth.statusCode).toBe(403);
    expect((sinReauth.json() as { code: string }).code).toBe('REAUTH_REQUERIDA');

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reauth',
      headers: conToken(token),
      payload: { password: PASSWORD_DEV },
    });
    const res = await borrar(conToken(token));
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as { borradas: number }).borradas).toBe(1);

    const quedan = await almacenamiento.ubicaciones.ultimas();
    expect(quedan.some((u) => u.vehiculoId === 'veh-FST189')).toBe(false);
    // Las de las demás placas siguen: se borró solo lo de esa.
    expect(quedan.length).toBe(2);

    const audit = await app.inject({
      method: 'GET',
      url: '/api/v1/audit?entidad=vehiculos',
      headers: conToken(token),
    });
    expect((audit.json() as { accion: string }[]).map((e) => e.accion)).toContain('gps.suprimir');
  });

  it('un coordinador no puede borrar el historial de una placa', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/vehiculos/veh-FST189/ubicaciones',
      headers: conToken(await login('ops@asotracmet.test')),
      payload: { motivo: 'no debería poder' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('el extracto del asociado dice cuántos puntos se guardan de sus placas y desde cuándo', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/extracto',
      headers: conToken(await login('member.fst189@asotracmet.test')),
    });
    expect(res.statusCode, res.body).toBe(200);
    const extracto = res.json() as {
      ubicaciones: { placa: string; puntos: number; desde: string | null }[];
      habeasData: { proposito: string };
    };
    const propia = extracto.ubicaciones.find((u) => u.placa === 'FST189');
    expect(propia?.puntos).toBe(1);
    expect(new Date(propia!.desde!).toISOString()).toBe(new Date(INICIO).toISOString());
    // Y el propósito nombra la ubicación: la autorización tiene que ser informada (Ley 1581).
    expect(extracto.habeasData.proposito).toContain('ubicación GPS del vehículo');
  });

  it('un coordinador no puede disparar la purga: es acción de superadmin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs/purgar-ubicaciones',
      headers: conToken(await login('ops@asotracmet.test')),
    });
    expect(res.statusCode).toBe(403);
  });
});
