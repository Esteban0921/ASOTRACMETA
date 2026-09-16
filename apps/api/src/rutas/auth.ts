import { isIP } from 'node:net';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  CanjearEnlaceSchema,
  LoginSchema,
  ReauthSchema,
  SolicitarAccesoSchema,
  VerificarOtpSchema,
  VerificarTotpSchema,
} from '@asotracmet/shared';
import { sesionDe } from '../auth/plugin.js';
import type { MetaPeticion, ServicioAuth } from '../auth/servicio.js';
import { usuarioPublico } from '../usuarios.js';

export interface DepsAuth {
  servicio: ServicioAuth;
  loginRateLimitMax: number;
}

function meta(req: FastifyRequest): MetaPeticion {
  const agente = req.headers['user-agent'];
  return {
    ip: req.ip && isIP(req.ip) ? req.ip : null,
    userAgent: typeof agente === 'string' ? agente.slice(0, 300) : null,
  };
}

/** Rutas de acceso (spec §8.1 y §3.3). Todas con rate limit por IP (spec §12). */
export function rutasAuth(app: FastifyInstance, deps: DepsAuth): void {
  const limitado = {
    config: { rateLimit: { max: deps.loginRateLimitMax, timeWindow: '1 minute' } },
  };

  // Con contraseña: primer factor de un rol interno → reto TOTP. Sin contraseña: código o enlace por correo.
  app.post('/api/v1/auth/login', limitado, async (req, reply) => {
    const { email, password } = LoginSchema.parse(req.body);
    return reply.send(await deps.servicio.login(email, password, meta(req)));
  });

  app.post('/api/v1/auth/2fa/verify', limitado, async (req, reply) => {
    const { challenge, codigo } = VerificarTotpSchema.parse(req.body);
    return reply.send(await deps.servicio.verificarTotp(challenge, codigo, meta(req)));
  });

  app.post('/api/v1/auth/otp/verify', limitado, async (req, reply) => {
    const { email, codigo } = VerificarOtpSchema.parse(req.body);
    return reply.send(await deps.servicio.verificarOtp(email, codigo, meta(req)));
  });

  app.post('/api/v1/auth/magic-link', limitado, async (req, reply) => {
    const { email } = SolicitarAccesoSchema.parse(req.body);
    await deps.servicio.solicitarCodigo(email);
    return reply.send({ paso: 'codigo_enviado' });
  });

  app.post('/api/v1/auth/magic-link/canjear', limitado, async (req, reply) => {
    const { token } = CanjearEnlaceSchema.parse(req.body);
    return reply.send(await deps.servicio.canjearMagicLink(token, meta(req)));
  });

  // Revoca la sesión de verdad: el mismo token deja de valer al instante.
  app.post('/api/v1/auth/logout', async (req, reply) => {
    await deps.servicio.cerrarSesion(sesionDe(req).sesion);
    return reply.status(204).send();
  });

  app.post('/api/v1/auth/reauth', limitado, async (req, reply) => {
    const credencial = ReauthSchema.parse(req.body);
    return reply.send(await deps.servicio.reauth(sesionDe(req), credencial));
  });

  app.get('/api/v1/me', async (req, reply) => {
    const { sesion, usuario } = sesionDe(req);
    return reply.send({
      ...usuarioPublico(usuario),
      sesion: { expiraEn: sesion.expiraEn, reauthHasta: sesion.reauthHasta },
    });
  });
}
