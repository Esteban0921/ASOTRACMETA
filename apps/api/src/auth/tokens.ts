import { createHmac, timingSafeEqual } from 'node:crypto';

// Tokens firmados (HMAC-SHA256) de corta vida y sin estado: el reto de segundo factor entre
// la contraseña y el código TOTP. Las sesiones NO viajan aquí: son opacas y revocables (sesiones.ts).

export interface PayloadFirmado {
  proposito: string;
  /** Epoch en segundos. */
  exp: number;
}

function b64url(entrada: Buffer | string): string {
  return Buffer.from(entrada).toString('base64url');
}

function firma(cuerpo: string, secreto: string): string {
  return createHmac('sha256', secreto).update(cuerpo).digest('base64url');
}

export function firmarToken<T extends PayloadFirmado>(payload: T, secreto: string): string {
  const cuerpo = b64url(JSON.stringify(payload));
  return `${cuerpo}.${firma(cuerpo, secreto)}`;
}

/** Devuelve el payload solo si la firma es válida, no ha expirado y el propósito coincide. */
export function verificarToken<T extends PayloadFirmado>(
  token: string,
  secreto: string,
  ahora: Date,
  proposito: T['proposito'],
): T | null {
  const [cuerpo, firmaRecibida] = token.split('.');
  if (!cuerpo || !firmaRecibida) return null;
  const esperada = firma(cuerpo, secreto);
  const a = Buffer.from(firmaRecibida);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as Partial<T>;
    if (typeof payload.exp !== 'number' || payload.proposito !== proposito) return null;
    if (payload.exp * 1000 <= ahora.getTime()) return null;
    return payload as T;
  } catch {
    return null;
  }
}
