import type { FastifyInstance } from 'fastify';
import { ErrorDominio, type Reloj } from '@asotracmet/domain';
import { DURACION_SESION_HORAS, LoginSchema } from '@asotracmet/shared';
import { verificarPassword } from '../auth/passwords.js';
import { firmarToken } from '../auth/tokens.js';
import { usuarioPublico, type AlmacenUsuarios } from '../usuarios.js';

export interface DepsAuth {
  usuarios: AlmacenUsuarios;
  secreto: string;
  reloj: Reloj;
  loginRateLimitMax: number;
}

export function rutasAuth(app: FastifyInstance, deps: DepsAuth): void {
  app.post(
    '/api/v1/auth/login',
    { config: { rateLimit: { max: deps.loginRateLimitMax, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { email, password } = LoginSchema.parse(req.body);
      const usuario = deps.usuarios.porEmail(email);
      if (!usuario || !usuario.activo || !verificarPassword(password, usuario.passwordHash)) {
        throw new ErrorDominio('UNAUTHORIZED', 'Credenciales inválidas');
      }
      const ahora = deps.reloj.ahora();
      const exp = Math.floor(ahora.getTime() / 1000) + DURACION_SESION_HORAS[usuario.rol] * 3600;
      const token = firmarToken({ sub: usuario.id, rol: usuario.rol, exp }, deps.secreto);
      return reply.send({
        token,
        expiraEn: new Date(exp * 1000).toISOString(),
        usuario: usuarioPublico(usuario),
      });
    },
  );

  // Sesión stateless en fase puente: el cliente descarta el token. Revocación real en TASK-0018.
  app.post('/api/v1/auth/logout', async (_req, reply) => reply.status(204).send());

  app.get('/api/v1/me', async (req, reply) => {
    if (!req.usuario) throw new ErrorDominio('UNAUTHORIZED');
    return reply.send(usuarioPublico(req.usuario));
  });
}
