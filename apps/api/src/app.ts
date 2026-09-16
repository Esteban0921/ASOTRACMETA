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
import { MensajeriaConsola, MensajeriaMemoria, type Mensajeria } from './auth/mensajeria.js';
import { registrarAuth } from './auth/plugin.js';
import { ServicioAuth } from './auth/servicio.js';
import { cargarConfig, type Config } from './config.js';
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
}

const IDS_UUID_V7: GeneradorIds = { nuevo: () => uuidv7() };

export async function construirApp(opciones: OpcionesApp = {}): Promise<AppConstruida> {
  const config: Config = { ...cargarConfig(), ...opciones.config };
  const reloj = opciones.reloj ?? new RelojSistema();
  const ids = opciones.ids ?? IDS_UUID_V7;

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

  const motor = new MotorCola({ uow: almacenamiento.uow, reloj, ids });
  const actorSistema: Actor = {
    id: almacenamiento.idSemilla(ID_USUARIO_SISTEMA),
    rol: 'superadmin',
  };

  const app = Fastify({
    logger: config.logger ? { level: process.env.LOG_LEVEL ?? 'info' } : false,
  });

  const mensajeria =
    opciones.mensajeria ??
    (config.mensajeria === 'memoria'
      ? new MensajeriaMemoria(reloj)
      : new MensajeriaConsola((linea) => app.log.info(linea)));

  const servicioAuth = new ServicioAuth({
    usuarios: almacenamiento.usuarios,
    auth: almacenamiento.auth,
    mensajeria,
    reloj,
    ids,
    config,
  });

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

  registrarManejoErrores(app, { spaIndex: config.webDir !== null });
  registrarAuth(app, {
    servicio: servicioAuth,
    rutasPublicasExtra: config.modoE2e ? ['/api/v1/__e2e/'] : [],
    webPublica: config.webDir !== null,
  });

  app.get('/healthz', async () => ({
    ok: true,
    modo: config.modoE2e ? 'e2e' : almacenamiento.clase,
  }));
  app.get('/readyz', async () => {
    if (almacenamiento.clase === 'memoria') {
      return { ok: true, almacen: 'memoria', db: 'n/a' };
    }
    await almacenamiento.consultas.clientes();
    return { ok: true, almacen: 'postgres', db: 'ok' };
  });

  rutasAuth(app, { servicio: servicioAuth, loginRateLimitMax: config.loginRateLimitMax });
  rutasCatalogos(app, { uow: almacenamiento.uow, consultas: almacenamiento.consultas });
  rutasUsuarios(app, {
    usuarios: almacenamiento.usuarios,
    auth: almacenamiento.auth,
    uow: almacenamiento.uow,
    consultas: almacenamiento.consultas,
    ids,
  });
  rutasMaestros(app, {
    maestros: almacenamiento.maestros,
    motor,
    uow: almacenamiento.uow,
    consultas: almacenamiento.consultas,
    reloj,
    ids,
    claveCifrado: config.claveCifrado,
  });
  rutasOperacion(app, {
    uow: almacenamiento.uow,
    consultas: almacenamiento.consultas,
    motor,
    reloj,
    ids,
  });
  rutasViajes(app, {
    viajes: almacenamiento.viajes,
    maestros: almacenamiento.maestros,
    consultas: almacenamiento.consultas,
    uow: almacenamiento.uow,
    reloj,
    ids,
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
      const { para } = z.object({ para: z.email() }).parse(req.query);
      const mensaje =
        mensajeria instanceof MensajeriaMemoria ? mensajeria.ultimoPara(para) : undefined;
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
    await almacenamiento.cerrar();
  });

  return { app, almacenamiento, motor, reloj, config, actorSistema, mensajeria, servicioAuth };
}

function exigirDatabaseUrl(config: Config): string {
  if (!config.databaseUrl) {
    throw new Error('PERSISTENCIA=postgres requiere DATABASE_URL (ver .env.example).');
  }
  return config.databaseUrl;
}
