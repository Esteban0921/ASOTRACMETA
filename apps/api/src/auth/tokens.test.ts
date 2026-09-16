import { describe, expect, it } from 'vitest';
import { hashPassword, verificarPassword } from './passwords.js';
import { firmarToken, verificarToken } from './tokens.js';

describe('tokens de sesión', () => {
  const secreto = 'secreto-test';
  const ahora = new Date('2026-09-16T13:00:00Z');

  it('firma y verifica un payload válido', () => {
    const token = firmarToken({ sub: 'u1', rol: 'admin_ops', exp: 1_800_000_000 }, secreto);
    expect(verificarToken(token, secreto, ahora)).toEqual({
      sub: 'u1',
      rol: 'admin_ops',
      exp: 1_800_000_000,
    });
  });

  it('rechaza firma alterada, secreto distinto y expiración', () => {
    const token = firmarToken({ sub: 'u1', rol: 'member', exp: 1_800_000_000 }, secreto);
    expect(verificarToken(`${token}x`, secreto, ahora)).toBeNull();
    expect(verificarToken(token, 'otro', ahora)).toBeNull();
    const vencido = firmarToken({ sub: 'u1', rol: 'member', exp: 1 }, secreto);
    expect(verificarToken(vencido, secreto, ahora)).toBeNull();
    expect(verificarToken('basura', secreto, ahora)).toBeNull();
  });

  it('rechaza roles que no existen aunque la firma sea válida', () => {
    const cuerpo = Buffer.from(
      JSON.stringify({ sub: 'u1', rol: 'dios', exp: 1_800_000_000 }),
    ).toString('base64url');
    const token = firmarToken({ sub: 'u1', rol: 'member', exp: 1_800_000_000 }, secreto);
    const firma = token.split('.')[1];
    expect(verificarToken(`${cuerpo}.${firma}`, secreto, ahora)).toBeNull();
  });
});

describe('passwords', () => {
  it('hash scrypt con salt y verificación en tiempo constante', () => {
    const hash = hashPassword('Asotracmet2026!');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(verificarPassword('Asotracmet2026!', hash)).toBe(true);
    expect(verificarPassword('otra', hash)).toBe(false);
    expect(verificarPassword('x', null)).toBe(false);
    expect(hashPassword('a')).not.toBe(hashPassword('a'));
  });
});
