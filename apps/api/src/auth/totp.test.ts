import { describe, expect, it } from 'vitest';
import {
  base32Codificar,
  base32Decodificar,
  codigoTotp,
  generarSecretoTotp,
  otpauthUrl,
  verificarCodigoTotp,
} from './totp.js';

// Vectores de prueba del RFC 6238 (apéndice B) para HMAC-SHA1: el secreto es "12345678901234567890".
const SECRETO_RFC = base32Codificar(Buffer.from('12345678901234567890', 'ascii'));

describe('TOTP (RFC 6238)', () => {
  it('reproduce los vectores oficiales (últimos seis dígitos)', () => {
    expect(SECRETO_RFC).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(codigoTotp(SECRETO_RFC, new Date(59 * 1000))).toBe('287082');
    expect(codigoTotp(SECRETO_RFC, new Date(1111111109 * 1000))).toBe('081804');
    expect(codigoTotp(SECRETO_RFC, new Date(1234567890 * 1000))).toBe('005924');
    expect(codigoTotp(SECRETO_RFC, new Date(2000000000 * 1000))).toBe('279037');
  });

  it('acepta el paso anterior y el siguiente, rechaza más lejos y formatos raros', () => {
    const ahora = new Date('2026-09-16T13:00:00Z');
    expect(verificarCodigoTotp(SECRETO_RFC, codigoTotp(SECRETO_RFC, ahora), ahora)).toBe(true);
    expect(verificarCodigoTotp(SECRETO_RFC, codigoTotp(SECRETO_RFC, ahora, -1), ahora)).toBe(true);
    expect(verificarCodigoTotp(SECRETO_RFC, codigoTotp(SECRETO_RFC, ahora, 1), ahora)).toBe(true);
    expect(verificarCodigoTotp(SECRETO_RFC, codigoTotp(SECRETO_RFC, ahora, 2), ahora)).toBe(false);
    expect(verificarCodigoTotp(SECRETO_RFC, '12345', ahora)).toBe(false);
    expect(verificarCodigoTotp(SECRETO_RFC, 'abcdef', ahora)).toBe(false);
  });

  it('base32 ida y vuelta, tolerante a minúsculas y espacios', () => {
    const secreto = generarSecretoTotp();
    expect(secreto).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Codificar(base32Decodificar(secreto))).toBe(secreto);
    expect(base32Decodificar('gezd gnbv')).toEqual(base32Decodificar('GEZDGNBV'));
  });

  it('la URL otpauth lleva emisor, cuenta y parámetros estándar', () => {
    const url = otpauthUrl('GEZDGNBV', 'ops@asotracmet.test');
    expect(url.startsWith('otpauth://totp/ASOTRACMET%3Aops%40asotracmet.test?')).toBe(true);
    expect(url).toContain('secret=GEZDGNBV');
    expect(url).toContain('issuer=ASOTRACMET');
    expect(url).toContain('digits=6');
    expect(url).toContain('period=30');
  });
});
