import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { IdsSecuenciales, RelojFijo, type AlmacenMemoria } from '@asotracmet/domain';
import type { Parametros } from '@asotracmet/shared';
import { construirApp, type AppConstruida } from './app.js';
import { MensajeriaMemoria, type Mensajeria } from './auth/mensajeria.js';
import { codigoTotp } from './auth/totp.js';
import type { ResumenAvisos } from './notificaciones/avisos.js';
import { redactar } from './notificaciones/plantillas.js';
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

/** La outbox en memoria vive en el estado del dominio: aquí se leen claves y datos sin consumirla. */
const outbox = () => (construida.almacenamiento.uow as AlmacenMemoria).estado.outbox;
const claves = (evento: string) =>
  outbox()
    .filter((a) => a.evento === evento)
    .map((a) => a.clave)
    .sort();

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
    const resumen = primera.json() as ResumenAvisos;
    expect(resumen.porExpirar).toBe(1);
    expect(resumen.documentos).toBeGreaterThanOrEqual(1);
    const segunda = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/jobs/avisos',
        headers: conToken(superadmin),
      })
    ).json() as ResumenAvisos;
    expect(segunda).toEqual({
      porExpirar: 0,
      documentos: 0,
      recaudos: false,
      proximos: 0,
      bloqueanTurno: 0,
      sinElegibles: 0,
    });

    const entrega = await construida.worker.procesar();
    expect(entrega.avisos).toBe(
      resumen.porExpirar +
        resumen.documentos +
        (resumen.recaudos ? 1 : 0) +
        resumen.proximos +
        resumen.bloqueanTurno +
        resumen.sinElegibles,
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

// Avisos proactivos (brief §5, spec §14; TASK-0057): salen del job del minuto con clave
// idempotente y avisan antes de que la placa pierda el turno o el requerimiento se quede sin nadie.
describe('avisos proactivos (TASK-0057)', () => {
  it('cola.proximo: las dos primeras placas elegibles de cada clase, una vez por vuelta', async () => {
    const primera = await construida.correrAvisos();
    // Sin cliente la habilitación no cuenta: en TM-CBZ SPS413 y FST189 son las dos primeras
    // elegibles; en C100 GXT301 y LMR742; en C350 NBV523 y RTY871; C600 y MM tienen una placa.
    expect(primera.proximos).toBe(8);
    expect(claves('cola.proximo')).toEqual([
      'cola.proximo:veh-FST189:1',
      'cola.proximo:veh-GXT301:1',
      'cola.proximo:veh-HJK640:1',
      'cola.proximo:veh-LMR742:1',
      'cola.proximo:veh-MMX210:1',
      'cola.proximo:veh-NBV523:1',
      'cola.proximo:veh-RTY871:1',
      'cola.proximo:veh-SPS413:1',
    ]);
    const deFst189 = outbox().find((a) => a.clave === 'cola.proximo:veh-FST189:1');
    expect(deFst189).toMatchObject({
      destinos: [{ asociadoId: 'a-02', vehiculoId: 'veh-FST189' }],
      datos: { placa: 'FST189', claseCola: 'TM-CBZ', posicion: 2, posicionElegible: 2, ciclo: 1 },
    });
    // El job corre cada minuto: la segunda pasada no repite nada.
    expect((await construida.correrAvisos()).proximos).toBe(0);

    await construida.worker.procesar();
    const member = await login(MEMBER);
    const aviso = (await bandeja(member)).find((n) => n.evento === 'cola.proximo');
    expect(aviso?.asunto).toBe('Estás de 2.º en TM-CBZ: alista FST189');
    expect(aviso?.texto).toContain('Estás de 2.º: alista el vehículo');
    expect(aviso?.texto).toContain('/me');

    // FST189 toma un turno de HLB y rota al final (ciclo 2): la siguiente elegible es TKM221.
    const ops = await login(OPS);
    const oferta = await ofrecer(ops);
    expect(oferta.vehiculoId).toBe('veh-FST189');
    const aceptada = await app.inject({
      method: 'POST',
      url: `/api/v1/ofertas/${oferta.id}/aceptar`,
      headers: conToken(member),
    });
    expect(aceptada.statusCode, aceptada.body).toBe(200);
    expect((await construida.correrAvisos()).proximos).toBe(1);
    expect(claves('cola.proximo')).toContain('cola.proximo:veh-TKM221:1');

    // Cancelar el TR reoferta HLB a TKM221 (con oferta abierta deja de ser elegible), así que
    // SWI750 entra al top-2 y recibe el suyo. FST189 sigue de última, ya en ciclo 2.
    const trId = (aceptada.json() as { tr: { id: string } }).tr.id;
    await construida.motor.cancelarTr({ trId, motivo: 'prueba', actor: construida.actorSistema });
    expect((await construida.correrAvisos()).proximos).toBe(1);
    expect(claves('cola.proximo')).toContain('cola.proximo:veh-SWI750:1');
    // Un override devuelve a FST189 a la cabeza: es otra vuelta, vuelve a avisar y solo a ella.
    await construida.motor.override({
      claseCola: 'TM-CBZ',
      vehiculoId: 'veh-FST189',
      posicion: 1,
      motivo: 'prueba',
      actor: construida.actorSistema,
    });
    expect((await construida.correrAvisos()).proximos).toBe(1);
    expect(claves('cola.proximo')).toContain('cola.proximo:veh-FST189:2');
  });

  it('documento.bloquea_turno: SOAT vencido avisa solo cuando la placa llega a las 3 primeras, una vez', async () => {
    // UFR114 tiene el SOAT vencido desde el 2026-09-01 pero está de 10.ª: todavía no.
    expect((await construida.correrAvisos()).bloqueanTurno).toBe(0);
    await construida.motor.override({
      claseCola: 'TM-CBZ',
      vehiculoId: 'veh-UFR114',
      posicion: 3,
      motivo: 'prueba',
      actor: construida.actorSistema,
    });
    expect((await construida.correrAvisos()).bloqueanTurno).toBe(1);
    expect((await construida.correrAvisos()).bloqueanTurno).toBe(0);
    expect(outbox().find((a) => a.evento === 'documento.bloquea_turno')).toMatchObject({
      clave: 'documento.bloquea_turno:veh-UFR114:doc-ufr114-soat:1',
      destinos: [{ asociadoId: 'a-09', vehiculoId: 'veh-UFR114' }, { rol: 'admin_hseq' }],
      datos: { placa: 'UFR114', tipo: 'SOAT', venceEn: '2026-09-01', posicion: 3 },
    });

    await construida.worker.procesar();
    const hseq = await login('hseq@asotracmet.test');
    const aviso = (await bandeja(hseq)).find((n) => n.evento === 'documento.bloquea_turno');
    expect(aviso?.asunto).toBe('SOAT vencido: UFR114 va a perder el turno');
    expect(aviso?.texto).toContain('desde el 2026-09-01');
    expect(aviso?.texto).toContain('/hseq');
    expect(aviso?.texto).toContain('/me');
    // Sin PII: ni nombre ni cédula del asociado, solo la placa.
    expect(aviso?.texto).not.toMatch(/ASOCIADO|100900/);
  });

  it('cola.sin_elegibles: requerimiento con cupo y nadie elegible avisa a ops y HSEQ una vez por día', async () => {
    // Con la semilla todo requerimiento abierto tiene candidata.
    expect((await construida.correrAvisos()).sinElegibles).toBe(0);
    const superadmin = await login('superadmin@asotracmet.test');
    const cliente = await app.inject({
      method: 'POST',
      url: '/api/v1/clientes',
      headers: conToken(superadmin),
      payload: { codigo: 'NABORS', nombre: 'Nabors', requiereHabilitacion: true },
    });
    expect(cliente.statusCode, cliente.body).toBe(201);
    const clienteId = (cliente.json() as { id: string }).id;
    const requerimiento = await app.inject({
      method: 'POST',
      url: '/api/v1/requerimientos',
      headers: conToken(superadmin),
      payload: {
        clienteId,
        destinoId: 'des-acacias',
        claseCola: 'C350',
        fechaServicio: '2026-09-17',
        cantidadCupos: 1,
      },
    });
    expect(requerimiento.statusCode, requerimiento.body).toBe(201);
    const requerimientoId = (requerimiento.json() as { id: string }).id;

    expect((await construida.correrAvisos()).sinElegibles).toBe(1);
    expect((await construida.correrAvisos()).sinElegibles).toBe(0);
    expect(outbox().find((a) => a.evento === 'cola.sin_elegibles')).toMatchObject({
      clave: `cola.sin_elegibles:${requerimientoId}:2026-09-16`,
      destinos: [{ rol: 'admin_ops' }, { rol: 'admin_hseq' }],
      datos: {
        clienteCodigo: 'NABORS',
        claseCola: 'C350',
        enCola: 2,
        motivos: { VEHICULO_NO_HABILITADO: 2 },
      },
    });

    await construida.worker.procesar();
    const ops = await login(OPS);
    const aviso = (await bandeja(ops)).find((n) => n.evento === 'cola.sin_elegibles');
    expect(aviso?.asunto).toBe('Sin placas elegibles en C350 para NABORS');
    expect(aviso?.texto).toContain(
      'NABORS · ACACIAS: ningún vehículo elegible en C350 (2 no habilitados)',
    );
    expect(aviso?.texto).toContain('/ops');
    const hseq = await login('hseq@asotracmet.test');
    expect((await bandeja(hseq)).some((n) => n.evento === 'cola.sin_elegibles')).toBe(true);

    // Al día siguiente el requerimiento sigue sin candidata: vuelve a avisar (clave por fecha).
    reloj.fijar('2026-09-17T13:00:00Z');
    expect((await construida.correrAvisos()).sinElegibles).toBe(1);
    expect(claves('cola.sin_elegibles')).toEqual([
      `cola.sin_elegibles:${requerimientoId}:2026-09-16`,
      `cola.sin_elegibles:${requerimientoId}:2026-09-17`,
    ]);
  });

  it('aviso_proximo_turno_posiciones es un parámetro (RULE-012): cambia auditado y 0 no vale', async () => {
    const superadmin = await login('superadmin@asotracmet.test');
    const cambio = await app.inject({
      method: 'PATCH',
      url: '/api/v1/parametros',
      headers: conToken(superadmin),
      payload: { aviso_proximo_turno_posiciones: 3 },
    });
    expect(cambio.statusCode, cambio.body).toBe(200);
    expect((cambio.json() as Parametros).aviso_proximo_turno_posiciones).toBe(3);
    const audit = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/audit?entidad=parametros',
        headers: conToken(superadmin),
      })
    ).json() as Array<{ accion: string; before: unknown; after: unknown }>;
    expect(audit[0]).toMatchObject({
      accion: 'parametros.cambiar',
      before: { aviso_proximo_turno_posiciones: 2 },
      after: { aviso_proximo_turno_posiciones: 3 },
    });
    const invalido = await app.inject({
      method: 'PATCH',
      url: '/api/v1/parametros',
      headers: conToken(superadmin),
      payload: { aviso_proximo_turno_posiciones: 0 },
    });
    expect(invalido.statusCode).toBe(400);
    expect((invalido.json() as { code: string }).code).toBe('VALIDATION_ERROR');

    // Con 3 posiciones, TM-CBZ avisa también a la tercera elegible (TKM221).
    await construida.correrAvisos();
    expect(
      outbox()
        .filter((a) => a.evento === 'cola.proximo' && a.datos.claseCola === 'TM-CBZ')
        .map((a) => a.datos.placa),
    ).toEqual(['SPS413', 'FST189', 'TKM221']);
  });

  it('la plantilla de oferta.abierta explica "te tocó porque" solo si el motor manda el acta', () => {
    const ctx = { urlWeb: 'http://web.test', timezone: 'America/Bogota' };
    const base = { placa: 'FST189', cliente: 'Halliburton', claseCola: 'TM-CBZ' };
    expect(redactar('oferta.abierta', base, ctx).texto).not.toContain('Te tocó porque');
    const conActa = redactar(
      'oferta.abierta',
      { ...base, clienteCodigo: 'HLB', posicionElegida: 3, saltadas: 2 },
      ctx,
    ).texto;
    expect(conActa).toContain(
      'Te tocó porque: eras la primera placa elegible para HLB (posición 3, se saltaron 2 por delante).',
    );
    expect(
      redactar('oferta.abierta', { ...base, posicionElegida: 1, saltadas: 0 }, ctx).texto,
    ).toContain('para Halliburton (posición 1, nadie por delante)');
    // Sin cliente de ningún tipo la frase sigue teniendo sentido.
    expect(
      redactar('oferta.abierta', { placa: 'FST189', posicionElegida: 2, saltadas: 1 }, ctx).texto,
    ).toContain('eras la primera placa elegible (posición 2, se saltó 1 por delante)');
    // Una cola vacía o sin motivos se resume sin inventar.
    expect(
      redactar('cola.sin_elegibles', { clienteCodigo: 'HLB', claseCola: 'MM', motivos: {} }, ctx)
        .texto,
    ).toContain('ningún vehículo elegible en MM (cola vacía)');
  });
});
