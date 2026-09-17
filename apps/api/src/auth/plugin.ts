import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { ErrorDominio, type Actor, type Reloj } from '@asotracmet/domain';
import { esSoloPropio, puede, type Permiso, type Recurso } from '@asotracmet/shared';
import { fijarContexto } from '../persistencia/contexto.js';
import type { Usuario } from '../usuarios.js';
import type { ServicioAuth, SesionActiva } from './servicio.js';
import type { SesionRegistro } from './sesiones.js';

declare module 'fastify' {
  interface FastifyRequest {
    usuario: Usuario | null;
    actor: Actor | null;
    sesion: SesionRegistro | null;
  }
}

const RUTAS_PUBLICAS = new Set([
  '/healthz',
  '/readyz',
  '/metrics',
  '/api/v1/auth/login',
  '/api/v1/auth/2fa/verify',
  '/api/v1/auth/otp/verify',
  '/api/v1/auth/magic-link',
  '/api/v1/auth/magic-link/canjear',
]);

export interface OpcionesAuth {
  servicio: ServicioAuth;
  /** Prefijos adicionales sin autenticación (solo e2e). */
  rutasPublicasExtra?: string[];
  /** Con la web servida por la API (WEB_DIR): todo lo que no sea `/api/` es público (estáticos y SPA). */
  webPublica?: boolean;
}

/**
 * Autenticación Bearer con sesiones opacas y revocables. Rellena `request.usuario`,
 * `request.actor`, `request.sesion` y el contexto de RLS del adaptador Postgres (ADR-0004).
 */
export function registrarAuth(app: FastifyInstance, opciones: OpcionesAuth): void {
  app.decorateRequest('usuario', null);
  app.decorateRequest('actor', null);
  app.decorateRequest('sesion', null);

  app.addHook('onRequest', async (req: FastifyRequest) => {
    fijarContexto({ rol: 'sistema', vehiculoIds: [] });
    const ruta = req.url.split('?')[0] ?? req.url;
    if (RUTAS_PUBLICAS.has(ruta)) return;
    if (opciones.rutasPublicasExtra?.some((p) => ruta.startsWith(p))) return;
    if (opciones.webPublica && !ruta.startsWith('/api/')) return;

    const cabecera = req.headers.authorization ?? '';
    const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;
    if (!token) throw new ErrorDominio('UNAUTHORIZED', 'Falta token');
    const activa = await opciones.servicio.resolverSesion(token);
    if (!activa) throw new ErrorDominio('UNAUTHORIZED', 'Sesión inválida, expirada o revocada');
    req.usuario = activa.usuario;
    req.sesion = activa.sesion;
    req.actor = {
      id: activa.usuario.id,
      rol: activa.usuario.rol,
      vehiculoIds: activa.usuario.vehiculoIds,
    };
    fijarContexto({
      rol: activa.usuario.rol,
      vehiculoIds: activa.usuario.vehiculoIds,
      usuarioId: activa.usuario.id,
    });
  });
}

export function actorDe(req: FastifyRequest): Actor {
  if (!req.actor) throw new ErrorDominio('UNAUTHORIZED');
  return req.actor;
}

export function sesionDe(req: FastifyRequest): SesionActiva {
  if (!req.sesion || !req.usuario) throw new ErrorDominio('UNAUTHORIZED');
  return { sesion: req.sesion, usuario: req.usuario };
}

/**
 * Guard RBAC (spec §3.2). `permitirOwn` deja pasar a roles con concesión `own`;
 * el handler debe filtrar por `actor.vehiculoIds`.
 */
export function exigir(
  recurso: Recurso,
  permiso: Permiso,
  opciones: { permitirOwn?: boolean } = {},
): preHandlerHookHandler {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const actor = actorDe(req);
    if (!puede(actor.rol, recurso, permiso)) {
      throw new ErrorDominio('FORBIDDEN', `Rol ${actor.rol} no puede ${permiso} sobre ${recurso}`);
    }
    if (esSoloPropio(actor.rol, recurso) && !opciones.permitirOwn) {
      throw new ErrorDominio('FORBIDDEN_OWN_SCOPE', `Rol ${actor.rol} solo accede a sus placas`);
    }
  };
}

/**
 * Acciones sensibles (borrar, resetear cola: spec §3.3) exigen re-autenticación reciente
 * (`POST /auth/reauth`), no solo una sesión viva.
 */
export function exigirReauth(reloj: Reloj): preHandlerHookHandler {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const { sesion } = sesionDe(req);
    if (!sesion.reauthHasta || sesion.reauthHasta <= reloj.ahora().toISOString()) {
      throw new ErrorDominio('REAUTH_REQUERIDA', 'Confirma tu identidad para esta acción');
    }
  };
}
