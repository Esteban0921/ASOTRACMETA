import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import {
  ErrorDominio,
  MotorCola,
  RelojSistema,
  type AlmacenMemoria,
  type Actor,
  type GeneradorIds,
  type Reloj,
} from '@asotracmet/domain';
import { MensajeriaMemoria, type Mensajeria } from './auth/mensajeria.js';
import { registrarAuth } from './auth/plugin.js';
import { tokenServicioValido } from './auth/token-servicio.js';
import { ServicioAuth } from './auth/servicio.js';
import { fechaLocal, frescuraDe, type Parametros } from '@asotracmet/shared';
import { cargarConfig, type Config } from './config.js';
import { LockRedis, conLockDistribuido, type AlmacenLock } from './lock-cola.js';
import { mensajeriaDeConfig } from './mensajeria/proveedores.js';
import { correrAvisos, type ResumenAvisos } from './notificaciones/avisos.js';
import { WorkerNotificaciones } from './notificaciones/worker.js';
import { rutasNotificaciones } from './rutas/notificaciones.js';
import { rutasSoportes } from './rutas/soportes.js';
import { SoportesLocales } from './soportes/local.js';
import { SoportesS3 } from './soportes/s3.js';
import type { AlmacenSoportes } from './soportes/tipos.js';
import { RegistroMetricas, pingRedis } from './observabilidad.js';
import { CONTRATO } from './openapi/contrato.js';
import { construirOpenApi } from './openapi/documento.js';
import { VERSION_CONTRATO } from './openapi/version.js';
import { iniciarTelemetria, trazarUnidadDeTrabajo, type Telemetria } from './telemetria.js';
import { registrarManejoErrores } from './errores.js';
import {
  almacenamientoMemoria,
  almacenamientoPostgres,
  crearPool,
  type Almacenamiento,
} from './persistencia/almacenamiento.js';
import { rutasAuth } from './rutas/auth.js';
import { rutasCatalogos } from './rutas/catalogos.js';
import { rutasOperacion } from './rutas/operacion.js';
import { rutasMaestros } from './rutas/maestros.js';
import { rutasExport } from './rutas/export.js';
import { rutasGps } from './rutas/gps.js';
import { rutasTablero } from './rutas/tablero.js';
import { rutasUsuarios } from './rutas/usuarios.js';
import { rutasViajes } from './rutas/viajes.js';
import { ID_USUARIO_SISTEMA } from './seed.js';
import type { AlmacenUsuarios } from './usuarios.js';

export interface OpcionesApp {
  config?: Partial<Config>;
  reloj?: Reloj;
  ids?: GeneradorIds;
  /** Almacenamiento ya construido (tests de Postgres). */
  almacenamiento?: Almacenamiento;
  /** Atajos para inyectar un almacén en memoria ya poblado. */
  almacen?: AlmacenMemoria;
  usuarios?: AlmacenUsuarios;
  /** Canal de códigos y enlaces; los tests inyectan `MensajeriaMemoria` para leerlos. */
  mensajeria?: Mensajeria;
  /** Lock distribuido por clase de cola; por defecto Redis si hay `REDIS_URL`, si no ninguno. */
  lock?: AlmacenLock;
  /** Almacén de soportes HSEQ; por defecto S3 si hay `S3_BUCKET`, si no disco local. */
  soportes?: AlmacenSoportes;
}

export interface RutaRegistrada {
  metodo: string;
  ruta: string;
}

export interface AppConstruida {
  app: FastifyInstance;
  almacenamiento: Almacenamiento;
  motor: MotorCola;
  reloj: Reloj;
  config: Config;
  /** Actor de los jobs, con el identificador que use este almacén. */
  actorSistema: Actor;
  mensajeria: Mensajeria;
  servicioAuth: ServicioAuth;
  metricas: RegistroMetricas;
  telemetria: Telemetria;
  /** Worker de avisos: `index.ts` lo arranca; los tests lo disparan con `procesar()`. */
  worker: WorkerNotificaciones;
  correrAvisos: () => Promise<ResumenAvisos>;
  rutasRegistradas: readonly RutaRegistrada[];
}

const IDS_UUID_V7: GeneradorIds = { nuevo: () => uuidv7() };

/** Placas activas cuya última lectura ya no es fresca, contando las que nunca reportaron. */
function placasSinSenal(
  vehiculos: readonly { id: string; estado: string }[],
  ultimas: readonly { vehiculoId: string; capturadaEn: string }[],
  ahora: Date,
  parametros: Parametros,
): number {
  const porVehiculo = new Map(ultimas.map((u) => [u.vehiculoId, u.capturadaEn]));
  return vehiculos.filter((v) => {
    if (v.estado !== 'activo') return false;
    const capturada = porVehiculo.get(v.id);
    const minutos =
      capturada === undefined
        ? null
        : Math.floor((ahora.getTime() - new Date(capturada).getTime()) / 60_000);
    return frescuraDe(minutos, parametros) === 'sin_senal';
  }).length;
}

export async function construirApp(opciones: OpcionesApp = {}): Promise<AppConstruida> {
  const config: Config = { ...cargarConfig(), ...opciones.config };
  const reloj = opciones.reloj ?? new RelojSistema();
  const ids = opciones.ids ?? IDS_UUID_V7;
  // Observabilidad (spec §15): OTel solo con OTEL_EXPORTER_OTLP_ENDPOINT; métricas siempre en /metrics.
  const telemetria = iniciarTelemetria({
    endpoint: config.otelEndpoint,
    servicio: config.otelServicio,
  });
  const metricas = new RegistroMetricas();

  const almacenamiento =
    opciones.almacenamiento ??
    (config.persistencia === 'postgres'
      ? almacenamientoPostgres({ pool: crearPool(exigirDatabaseUrl(config)) })
      : almacenamientoMemoria({
          reloj,
          ids,
          claveCifrado: config.claveCifrado,
          almacen: opciones.almacen,
          usuarios: opciones.usuarios,
        }));

  const app = Fastify({
    logger: config.logger ? { level: process.env.LOG_LEVEL ?? 'info' } : false,
  });
  // Rutas que Fastify registra de verdad: `openapi.test.ts` las cruza con el contrato (TASK-0033).
  const rutasRegistradas: RutaRegistrada[] = [];
  app.addHook('onRoute', (ruta) => {
    for (const metodo of Array.isArray(ruta.method) ? ruta.method : [ruta.method]) {
      rutasRegistradas.push({ metodo, ruta: ruta.url });
    }
  });

  // Lock distribuido `cola:{clase}` (§7.7, TASK-0020): con REDIS_URL cada transacción de cola toma
  // la clave en Redis antes del lock de Postgres; si Redis falla se degrada a Postgres y se cuenta.
  const lock =
    opciones.lock ??
    (config.redisUrl
      ? new LockRedis(config.redisUrl, {
          alError: (error) => app.log.debug({ err: error }, 'redis lock'),
        })
      : null);
  const conLock = lock
    ? conLockDistribuido(almacenamiento.uow, lock, {
        ttlMs: config.lockTtlMs,
        prefijo: config.lockPrefijo,
        alFallar: (error, fase) => {
          metricas.lockRedisError();
          app.log.warn({ err: error, fase }, 'redis lock: se sigue con el lock de Postgres');
        },
      })
    : almacenamiento.uow;
  // Cada transacción de cola es un span `cola.transaccion` (trazas en la transacción, §15).
  const uow = trazarUnidadDeTrabajo(conLock);
  const motor = new MotorCola({ uow, reloj, ids });
  const actorSistema: Actor = {
    id: almacenamiento.idSemilla(ID_USUARIO_SISTEMA),
    rol: 'superadmin',
  };

  const mensajeria =
    opciones.mensajeria ??
    (config.mensajeria === 'memoria'
      ? new MensajeriaMemoria(reloj)
      : mensajeriaDeConfig(config, (linea) => app.log.info(linea)));

  const servicioAuth = new ServicioAuth({
    usuarios: almacenamiento.usuarios,
    auth: almacenamiento.auth,
    mensajeria,
    reloj,
    ids,
    config,
  });

  // Notificaciones (§11, ADR-0006): el motor deja el aviso en la outbox; este worker lo entrega.
  const worker = new WorkerNotificaciones({
    notificaciones: almacenamiento.notificaciones,
    usuarios: almacenamiento.usuarios,
    consultas: almacenamiento.consultas,
    maestros: almacenamiento.maestros,
    mensajeria,
    reloj,
    ids,
    urlWeb: config.urlWeb,
    log: (nivel, datos, mensaje) => app.log[nivel](datos, mensaje),
  });
  const correrAvisosHoy = async (): Promise<ResumenAvisos> => {
    const { timezone } = await almacenamiento.consultas.parametros();
    return correrAvisos(
      {
        notificaciones: almacenamiento.notificaciones,
        consultas: almacenamiento.consultas,
        maestros: almacenamiento.maestros,
        viajes: almacenamiento.viajes,
        reloj,
        // Avisos proactivos (TASK-0057): leen la foto de la cola, nunca la mutan.
        motor,
      },
      fechaLocal(reloj.ahora(), timezone),
    );
  };

  await app.register(cors, { origin: config.corsOrigins, credentials: true });
  await app.register(rateLimit, { global: false });
  if (config.webDir) {
    // Producción (TASK-0032): un solo proceso sirve la API y el build de la web. Las rutas `/api/*`
    // se registran explícitamente y ganan al comodín de estáticos; lo demás cae al SPA.
    await app.register(fastifyStatic, {
      root: path.resolve(config.webDir),
      prefix: '/',
      index: ['index.html'],
    });
  }

  // Soportes HSEQ (TASK-0043): el almacén local recibe PDF o imagen como Buffer con su límite.
  app.addContentTypeParser(
    ['application/pdf', 'image/jpeg', 'image/png'],
    { parseAs: 'buffer', bodyLimit: config.soporteMaxBytes },
    (_req, cuerpo, done) => done(null, cuerpo),
  );

  // Un POST de acción (`/ofertas/:id/aceptar`) llega sin cuerpo pero con content-type JSON:
  // se interpreta como `{}` y Zod valida después. JSON malformado sigue siendo 400.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, cuerpo, done) => {
    const texto = typeof cuerpo === 'string' ? cuerpo : cuerpo.toString('utf8');
    if (texto.trim() === '') {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(texto));
    } catch (error) {
      const invalido = new Error('JSON inválido', { cause: error }) as Error & {
        statusCode: number;
      };
      invalido.statusCode = 400;
      done(invalido, undefined);
    }
  });

  registrarManejoErrores(app, {
    spaIndex: config.webDir !== null,
    alErrorDominio: (codigo) => metricas.errorDominio(codigo),
  });
  app.addHook('onResponse', (_req, reply, done) => {
    metricas.httpRespuesta(reply.statusCode);
    done();
  });
  registrarAuth(app, {
    servicio: servicioAuth,
    rutasPublicasExtra: config.modoE2e ? ['/api/v1/__e2e/'] : [],
    webPublica: config.webDir !== null,
  });

  app.get('/healthz', async () => ({
    ok: true,
    modo: config.modoE2e ? 'e2e' : almacenamiento.clase,
  }));
  // Readiness (§15): base de datos y, si está configurado, Redis. 503 cuando algo no responde.
  app.get('/readyz', async (_req, reply) => {
    const inicio = Date.now();
    let db: { ok: boolean; ms: number; error?: string } = { ok: true, ms: 0 };
    if (almacenamiento.clase === 'postgres') {
      try {
        await almacenamiento.consultas.clientes();
        db = { ok: true, ms: Date.now() - inicio };
      } catch (error) {
        db = {
          ok: false,
          ms: Date.now() - inicio,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    const redis = config.redisUrl ? await pingRedis(config.redisUrl) : ('n/a' as const);
    const ok = db.ok && (redis === 'n/a' || redis.ok);
    return reply.status(ok ? 200 : 503).send({ ok, almacen: almacenamiento.clase, db, redis });
  });

  // Contrato OpenAPI 3.1 (TASK-0033): el mismo documento que `pnpm build:contrato` deja en docs/.
  const openapi = construirOpenApi(CONTRATO, { version: VERSION_CONTRATO });
  app.get('/api/v1/openapi.json', async (_req, reply) => reply.send(openapi));

  // Métricas Prometheus (§15), sin PII. Con METRICS_TOKEN exige el bearer.
  app.get('/metrics', async (req, reply) => {
    // Sigue siendo pública sin `METRICS_TOKEN`; con él, comparación en tiempo constante.
    if (
      config.metricsToken &&
      !tokenServicioValido(req.headers.authorization, [config.metricsToken])
    ) {
      throw new ErrorDominio('UNAUTHORIZED', 'Token de métricas inválido');
    }
    const parametrosMetricas = await almacenamiento.consultas.parametros();
    const hoy = fechaLocal(reloj.ahora(), parametrosMetricas.timezone);
    const [abiertas, declinadas, ultimaRecepcion, ultimasUbicaciones, vehiculosActivos] =
      await Promise.all([
        almacenamiento.consultas.ofertas({ estado: 'abierta' }),
        almacenamiento.consultas.ofertas({ estado: 'declinada' }),
        almacenamiento.ubicaciones.ultimaRecepcion(),
        almacenamiento.ubicaciones.ultimas(),
        almacenamiento.maestros.vehiculos(),
      ]);
    const declinacionesHoy = declinadas.filter(
      (o) =>
        o.respondidaEn && fechaLocal(new Date(o.respondidaEn), parametrosMetricas.timezone) === hoy,
    ).length;
    return reply.type('text/plain; version=0.0.4; charset=utf-8').send(
      metricas.exponer({
        ofertasAbiertas: abiertas.length,
        declinacionesHoy,
        // "¿Llega algo del agente GPS?" y "¿cuántas placas no reportan?" (ADR-0007).
        gpsUltimoLoteSegundos:
          ultimaRecepcion === null
            ? null
            : Math.max(
                0,
                Math.round((reloj.ahora().getTime() - new Date(ultimaRecepcion).getTime()) / 1000),
              ),
        gpsPlacasSinSenal: placasSinSenal(
          vehiculosActivos,
          ultimasUbicaciones,
          reloj.ahora(),
          parametrosMetricas,
        ),
      }),
    );
  });

  rutasAuth(app, { servicio: servicioAuth, loginRateLimitMax: config.loginRateLimitMax });
  rutasCatalogos(app, { uow, consultas: almacenamiento.consultas });
  rutasUsuarios(app, {
    usuarios: almacenamiento.usuarios,
    auth: almacenamiento.auth,
    uow,
    consultas: almacenamiento.consultas,
    ids,
  });
  rutasMaestros(app, {
    maestros: almacenamiento.maestros,
    ubicaciones: almacenamiento.ubicaciones,
    motor,
    uow,
    consultas: almacenamiento.consultas,
    reloj,
    ids,
    claveCifrado: config.claveCifrado,
  });
  rutasOperacion(app, {
    uow,
    consultas: almacenamiento.consultas,
    motor,
    reloj,
    ids,
    metricas,
  });
  rutasViajes(app, {
    viajes: almacenamiento.viajes,
    maestros: almacenamiento.maestros,
    consultas: almacenamiento.consultas,
    uow,
    reloj,
    ids,
  });
  rutasTablero(app, {
    consultas: almacenamiento.consultas,
    viajes: almacenamiento.viajes,
    metricas: almacenamiento.metricas,
    uow,
    reloj,
  });
  rutasExport(app, {
    ubicaciones: almacenamiento.ubicaciones,
    consultas: almacenamiento.consultas,
    viajes: almacenamiento.viajes,
    maestros: almacenamiento.maestros,
    uow,
    reloj,
  });
  rutasNotificaciones(app, {
    notificaciones: almacenamiento.notificaciones,
    usuarios: almacenamiento.usuarios,
    worker,
    correrAvisos: correrAvisosHoy,
    uow,
    reloj,
  });
  // Soportes HSEQ (TASK-0043): S3 compatible con URLs prefirmadas o disco local (dev, e2e, VPS chico).
  const soportes =
    opciones.soportes ??
    (config.s3 ? new SoportesS3(config.s3) : new SoportesLocales(config.soportesDir));
  rutasSoportes(app, {
    soportes,
    maestros: almacenamiento.maestros,
    consultas: almacenamiento.consultas,
    uow,
    reloj,
    ids,
    maxBytes: config.soporteMaxBytes,
    urlSegundos: config.soporteUrlSegundos,
  });

  // Ubicación GPS (ADR-0007, TASK-0062): el agente satélite entrega lotes con token de servicio.
  // Sin tokens configurados la ruta existe pero responde 401: un satélite no tumba la API.
  if (config.gpsIngestaTokens.some((t) => t.length < 32)) {
    app.log.warn('GPS_INGESTA_TOKEN corto: usa al menos 32 caracteres (openssl rand -base64 32)');
  }
  rutasGps(app, {
    ubicaciones: almacenamiento.ubicaciones,
    maestros: almacenamiento.maestros,
    consultas: almacenamiento.consultas,
    uow,
    reloj,
    ids,
    tokens: config.gpsIngestaTokens,
    rateLimitMax: config.gpsIngestaRateLimitMax,
    metricas,
    log: (datos, mensaje) => app.log.info(datos, mensaje),
  });

  if (config.modoE2e) {
    // Solo e2e (RULE-023): reset al seed y lectura de códigos/enlaces que en producción viajan
    // por correo. Jamás se registran fuera de este modo.
    const reiniciar = almacenamiento.reiniciar?.bind(almacenamiento);
    app.post('/api/v1/__e2e/reset', async () => {
      await reiniciar?.();
      if (mensajeria instanceof MensajeriaMemoria) mensajeria.limpiar();
      return { ok: true };
    });
    app.get('/api/v1/__e2e/mensajes', async (req, reply) => {
      const { para, con } = z
        .object({ para: z.email(), con: z.enum(['enlace', 'codigo']).optional() })
        .parse(req.query);
      const mensaje =
        mensajeria instanceof MensajeriaMemoria ? mensajeria.ultimoPara(para, con) : undefined;
      if (!mensaje) throw new ErrorDominio('NOT_FOUND', 'Sin mensajes para ese correo');
      return reply.send(mensaje);
    });
    app.get('/api/v1/__e2e/totp', async (req, reply) => {
      const consulta = z
        .object({ email: z.email().optional(), secret: z.string().min(16).optional() })
        .parse(req.query);
      const codigo = await servicioAuth.codigoTotpActual(consulta);
      if (!codigo) throw new ErrorDominio('NOT_FOUND', 'Sin secreto TOTP');
      return reply.send({ codigo });
    });
  }

  app.addHook('onClose', async () => {
    worker.detener();
    await lock?.cerrar();
    await almacenamiento.cerrar();
    await telemetria.apagar();
  });

  return {
    app,
    almacenamiento,
    motor,
    reloj,
    config,
    actorSistema,
    mensajeria,
    servicioAuth,
    metricas,
    telemetria,
    worker,
    correrAvisos: correrAvisosHoy,
    rutasRegistradas,
  };
}

function exigirDatabaseUrl(config: Config): string {
  if (!config.databaseUrl) {
    throw new Error('PERSISTENCIA=postgres requiere DATABASE_URL (ver .env.example).');
  }
  return config.databaseUrl;
}
