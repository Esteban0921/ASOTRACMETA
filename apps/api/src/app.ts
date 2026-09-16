import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { v7 as uuidv7 } from 'uuid';
import {
  AlmacenMemoria,
  MotorCola,
  RelojSistema,
  type GeneradorIds,
  type Reloj,
} from '@asotracmet/domain';
import { registrarAuth } from './auth/plugin.js';
import { cargarConfig, type Config } from './config.js';
import { registrarManejoErrores } from './errores.js';
import { rutasAuth } from './rutas/auth.js';
import { rutasCatalogos } from './rutas/catalogos.js';
import { rutasOperacion } from './rutas/operacion.js';
import { crearSeed } from './seed.js';
import { AlmacenUsuarios } from './usuarios.js';

export interface OpcionesApp {
  config?: Partial<Config>;
  reloj?: Reloj;
  ids?: GeneradorIds;
  /** Permite inyectar un almacén ya poblado (tests). Si falta, se usa el seed. */
  almacen?: AlmacenMemoria;
  usuarios?: AlmacenUsuarios;
}

export interface AppConstruida {
  app: FastifyInstance;
  almacen: AlmacenMemoria;
  usuarios: AlmacenUsuarios;
  motor: MotorCola;
  reloj: Reloj;
  config: Config;
}

const IDS_UUID_V7: GeneradorIds = { nuevo: () => uuidv7() };

export async function construirApp(opciones: OpcionesApp = {}): Promise<AppConstruida> {
  const config: Config = { ...cargarConfig(), ...opciones.config };
  const reloj = opciones.reloj ?? new RelojSistema();
  const ids = opciones.ids ?? IDS_UUID_V7;

  const seed = crearSeed(reloj.ahora());
  const almacen = opciones.almacen ?? new AlmacenMemoria(seed.estado, { reloj, ids });
  const usuarios = opciones.usuarios ?? new AlmacenUsuarios(seed.usuarios);
  const motor = new MotorCola({ uow: almacen, reloj, ids });

  const app = Fastify({
    logger: config.logger ? { level: process.env.LOG_LEVEL ?? 'info' } : false,
  });

  await app.register(cors, { origin: config.corsOrigins, credentials: true });
  await app.register(rateLimit, { global: false });

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

  registrarManejoErrores(app);
  registrarAuth(app, {
    secreto: config.authSecret,
    usuarios,
    reloj,
    rutasPublicasExtra: config.modoE2e ? ['/api/v1/__e2e/'] : [],
  });

  app.get('/healthz', async () => ({ ok: true, modo: config.modoE2e ? 'e2e' : 'memoria' }));
  app.get('/readyz', async () => ({ ok: true, almacen: 'memoria', db: 'n/a' }));

  rutasAuth(app, {
    usuarios,
    secreto: config.authSecret,
    reloj,
    loginRateLimitMax: config.loginRateLimitMax,
  });
  rutasCatalogos(app, { almacen });
  rutasOperacion(app, { almacen, motor, reloj, ids });

  if (config.modoE2e) {
    // Solo e2e: vuelve al seed determinista. Jamás se registra fuera de este modo.
    app.post('/api/v1/__e2e/reset', async () => {
      const nuevo = crearSeed(reloj.ahora());
      almacen.reemplazar(nuevo.estado);
      usuarios.reemplazar(nuevo.usuarios);
      return { ok: true };
    });
  }

  return { app, almacen, usuarios, motor, reloj, config };
}
