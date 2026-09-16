import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { ErrorDominio, type Actor, type Reloj } from '@asotracmet/domain';
import { esSoloPropio, puede, type Permiso, type Recurso } from '@asotracmet/shared';
import { verificarToken } from './tokens.js';
import type { AlmacenUsuarios, Usuario } from '../usuarios.js';

declare module 'fastify' {
  interface FastifyRequest {
    usuario: Usuario | null;
    actor: Actor | null;
  }
}

const RUTAS_PUBLICAS = new Set(['/healthz', '/readyz', '/api/v1/auth/login']);

export interface OpcionesAuth {
  secreto: string;
  usuarios: AlmacenUsuarios;
  reloj: Reloj;
  /** Prefijos adicionales sin autenticación (solo e2e). */
  rutasPublicasExtra?: string[];
}

/** Autenticación Bearer. Rellena `request.usuario` y `request.actor`. */
export function registrarAuth(app: FastifyInstance, opciones: OpcionesAuth): void {
  app.decorateRequest('usuario', null);
  app.decorateRequest('actor', null);

  app.addHook('onRequest', async (req: FastifyRequest) => {
    const ruta = req.url.split('?')[0] ?? req.url;
    if (RUTAS_PUBLICAS.has(ruta)) return;
    if (opciones.rutasPublicasExtra?.some((p) => ruta.startsWith(p))) return;

    const cabecera = req.headers.authorization ?? '';
    const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;
    if (!token) throw new ErrorDominio('UNAUTHORIZED', 'Falta token');
    const payload = verificarToken(token, opciones.secreto, opciones.reloj.ahora());
    if (!payload) throw new ErrorDominio('UNAUTHORIZED', 'Token inválido o expirado');
    const usuario = opciones.usuarios.porId(payload.sub);
    if (!usuario || !usuario.activo) throw new ErrorDominio('UNAUTHORIZED', 'Usuario inactivo');
    req.usuario = usuario;
    req.actor = { id: usuario.id, rol: usuario.rol, vehiculoIds: usuario.vehiculoIds };
  });
}

export function actorDe(req: FastifyRequest): Actor {
  if (!req.actor) throw new ErrorDominio('UNAUTHORIZED');
  return req.actor;
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
