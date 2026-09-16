import { createHmac, timingSafeEqual } from 'node:crypto';
import { esRol, type Rol } from '@asotracmet/shared';

// Token de sesión firmado (HMAC-SHA256). Sin dependencias externas.
// Fase producto: OTP + 2FA + refresh tokens (TASK-0018).

export interface PayloadSesion {
  sub: string;
  rol: Rol;
  /** Epoch segundos. */
  exp: number;
}

function b64url(entrada: Buffer | string): string {
  return Buffer.from(entrada).toString('base64url');
}

function firma(cuerpo: string, secreto: string): string {
  return createHmac('sha256', secreto).update(cuerpo).digest('base64url');
}

export function firmarToken(payload: PayloadSesion, secreto: string): string {
  const cuerpo = b64url(JSON.stringify(payload));
  return `${cuerpo}.${firma(cuerpo, secreto)}`;
}

export function verificarToken(token: string, secreto: string, ahora: Date): PayloadSesion | null {
  const [cuerpo, firmaRecibida] = token.split('.');
  if (!cuerpo || !firmaRecibida) return null;
  const esperada = firma(cuerpo, secreto);
  const a = Buffer.from(firmaRecibida);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(cuerpo, 'base64url').toString('utf8'),
    ) as Partial<PayloadSesion>;
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.exp !== 'number' ||
      !payload.rol ||
      !esRol(payload.rol)
    ) {
      return null;
    }
    if (payload.exp * 1000 <= ahora.getTime()) return null;
    return { sub: payload.sub, rol: payload.rol, exp: payload.exp };
  } catch {
    return null;
  }
}
