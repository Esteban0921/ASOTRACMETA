import { describe, expect, it } from 'vitest';
import { cifrar, claveDesdeEntorno, descifrar } from './cifrado.js';

describe('cifrado AES-256-GCM', () => {
  const clave = claveDesdeEntorno({});

  it('cifra y descifra; cada cifrado es distinto por el IV aleatorio', () => {
    const a = cifrar('GEZDGNBVGY3TQOJQ', clave);
    const b = cifrar('GEZDGNBVGY3TQOJQ', clave);
    expect(a).not.toBe(b);
    expect(descifrar(a, clave)).toBe('GEZDGNBVGY3TQOJQ');
    expect(descifrar(b, clave)).toBe('GEZDGNBVGY3TQOJQ');
  });

  it('detecta manipulación y clave incorrecta', () => {
    const cifrado = cifrar('secreto', clave);
    const partes = cifrado.split('.');
    const alterado = `${partes[0]}.${partes[1]}.${partes[2]}.${partes[3]?.slice(0, -2)}AA`;
    expect(() => descifrar(alterado, clave)).toThrow();
    expect(() => descifrar(cifrado, claveDesdeEntorno({ AUTH_SECRET: 'otro' }))).toThrow();
    expect(() => descifrar('basura', clave)).toThrow(/no reconocido/);
  });

  it('la clave del entorno debe ser de 32 bytes', () => {
    expect(
      claveDesdeEntorno({ CIFRADO_CLAVE: Buffer.alloc(32, 1).toString('base64') }),
    ).toHaveLength(32);
    expect(() => claveDesdeEntorno({ CIFRADO_CLAVE: 'corta' })).toThrow(/32 bytes/);
  });
});
