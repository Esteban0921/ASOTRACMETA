import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// scrypt (node:crypto). Formato: scrypt$<salt hex>$<hash hex>

const LONGITUD = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, LONGITUD).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verificarPassword(password: string, almacenado: string | null): boolean {
  if (!almacenado) return false;
  const [algoritmo, salt, hash] = almacenado.split('$');
  if (algoritmo !== 'scrypt' || !salt || !hash) return false;
  const candidato = scryptSync(password, salt, LONGITUD);
  const esperado = Buffer.from(hash, 'hex');
  return candidato.length === esperado.length && timingSafeEqual(candidato, esperado);
}
