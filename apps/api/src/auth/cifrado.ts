import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Cifrado simétrico en aplicación (spec §12): AES-256-GCM con clave del entorno.
// Se usa para secretos TOTP y, en TASK-0023, para cuentas bancarias. Nunca para contraseñas.

const ALGORITMO = 'aes-256-gcm';
const VERSION = 'v1';

export function cifrar(texto: string, clave: Buffer): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv(ALGORITMO, clave, iv);
  const cuerpo = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
  const etiqueta = cifrador.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    etiqueta.toString('base64url'),
    cuerpo.toString('base64url'),
  ].join('.');
}

export function descifrar(cifrado: string, clave: Buffer): string {
  const [version, iv, etiqueta, cuerpo] = cifrado.split('.');
  if (version !== VERSION || !iv || !etiqueta || !cuerpo) {
    throw new Error('Formato de dato cifrado no reconocido');
  }
  const descifrador = createDecipheriv(ALGORITMO, clave, Buffer.from(iv, 'base64url'));
  descifrador.setAuthTag(Buffer.from(etiqueta, 'base64url'));
  return Buffer.concat([
    descifrador.update(Buffer.from(cuerpo, 'base64url')),
    descifrador.final(),
  ]).toString('utf8');
}

/**
 * `CIFRADO_CLAVE` en base64 (32 bytes). Sin ella, en desarrollo se deriva de `AUTH_SECRET`
 * para que los seeds y la API compartan clave sin configurar nada. En producción es obligatoria.
 */
export function claveDesdeEntorno(env: NodeJS.ProcessEnv): Buffer {
  if (env.CIFRADO_CLAVE) {
    const clave = Buffer.from(env.CIFRADO_CLAVE, 'base64');
    if (clave.length !== 32) throw new Error('CIFRADO_CLAVE debe ser 32 bytes en base64');
    return clave;
  }
  const secreto = env.AUTH_SECRET ?? 'secreto-de-desarrollo-no-usar-en-produccion';
  return createHash('sha256').update(`${secreto}|cifrado`).digest();
}
