import { describe, expect, it } from 'vitest';
import { hashPassword, verificarPassword } from './passwords.js';
import { firmarToken, verificarToken, type PayloadFirmado } from './tokens.js';

interface Reto extends PayloadFirmado {
  proposito: 'totp';
  sub: string;
  enrolando: boolean;
}

describe('tokens firmados de reto', () => {
  const secreto = 'secreto-test';
  const ahora = new Date('2026-09-16T13:00:00Z');
  const reto: Reto = { proposito: 'totp', sub: 'u1', enrolando: false, exp: 1_800_000_000 };

  it('firma y verifica un payload válido', () => {
    const token = firmarToken(reto, secreto);
    expect(verificarToken<Reto>(token, secreto, ahora, 'totp')).toEqual(reto);
  });

  it('rechaza firma alterada, secreto distinto, expiración y propósito distinto', () => {
    const token = firmarToken(reto, secreto);
    expect(verificarToken<Reto>(`${token}x`, secreto, ahora, 'totp')).toBeNull();
    expect(verificarToken<Reto>(token, 'otro', ahora, 'totp')).toBeNull();
    expect(
      verificarToken<Reto>(firmarToken({ ...reto, exp: 1 }, secreto), secreto, ahora, 'totp'),
    ).toBeNull();
    expect(verificarToken<PayloadFirmado>(token, secreto, ahora, 'otro')).toBeNull();
    expect(verificarToken<Reto>('basura', secreto, ahora, 'totp')).toBeNull();
  });

  it('un payload sin exp o sin propósito no vale aunque la firma sea correcta', () => {
    const cuerpo = Buffer.from(JSON.stringify({ sub: 'u1' })).toString('base64url');
    const firmaValida = firmarToken({ proposito: 'x', exp: 1_800_000_000 }, secreto).split('.')[1];
    expect(verificarToken<Reto>(`${cuerpo}.${firmaValida}`, secreto, ahora, 'totp')).toBeNull();
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
