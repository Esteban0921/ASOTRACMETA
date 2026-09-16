import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// TOTP (RFC 6238) sobre HOTP (RFC 4226): HMAC-SHA1, paso de 30 s, seis dígitos.
// Compatible con Google Authenticator, Authy, 1Password y similares.

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const PASO_SEGUNDOS = 30;
export const DIGITOS = 6;

export function base32Codificar(datos: Uint8Array): string {
  let bits = 0;
  let valor = 0;
  let salida = '';
  for (const byte of datos) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += ALFABETO_BASE32[(valor << (5 - bits)) & 31];
  return salida;
}

export function base32Decodificar(texto: string): Buffer {
  const limpio = texto.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const bytes: number[] = [];
  let bits = 0;
  let valor = 0;
  for (const caracter of limpio) {
    valor = (valor << 5) | ALFABETO_BASE32.indexOf(caracter);
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 160 bits aleatorios en base32 (32 caracteres), el tamaño recomendado por RFC 4226. */
export function generarSecretoTotp(): string {
  return base32Codificar(randomBytes(20));
}

function hotp(secreto: Buffer, contador: bigint): string {
  const mensaje = Buffer.alloc(8);
  mensaje.writeBigUInt64BE(contador);
  const hmac = createHmac('sha1', secreto).update(mensaje).digest();
  const desplazamiento = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binario =
    (((hmac[desplazamiento] ?? 0) & 0x7f) << 24) |
    (((hmac[desplazamiento + 1] ?? 0) & 0xff) << 16) |
    (((hmac[desplazamiento + 2] ?? 0) & 0xff) << 8) |
    ((hmac[desplazamiento + 3] ?? 0) & 0xff);
  return String(binario % 10 ** DIGITOS).padStart(DIGITOS, '0');
}

export function codigoTotp(secretoBase32: string, instante: Date, desfasePasos = 0): string {
  const contador = BigInt(Math.floor(instante.getTime() / 1000 / PASO_SEGUNDOS) + desfasePasos);
  return hotp(base32Decodificar(secretoBase32), contador);
}

/** Acepta el paso actual y `ventana` pasos a cada lado (reloj del teléfono ligeramente desfasado). */
export function verificarCodigoTotp(
  secretoBase32: string,
  codigo: string,
  instante: Date,
  ventana = 1,
): boolean {
  if (!/^\d{6}$/.test(codigo)) return false;
  const recibido = Buffer.from(codigo);
  for (let desfase = -ventana; desfase <= ventana; desfase += 1) {
    const esperado = Buffer.from(codigoTotp(secretoBase32, instante, desfase));
    if (esperado.length === recibido.length && timingSafeEqual(esperado, recibido)) return true;
  }
  return false;
}

/** URL `otpauth://` que las apps de autenticación leen desde un QR o a mano. */
export function otpauthUrl(secretoBase32: string, cuenta: string, emisor = 'ASOTRACMET'): string {
  const etiqueta = encodeURIComponent(`${emisor}:${cuenta}`);
  const parametros = new URLSearchParams({
    secret: secretoBase32,
    issuer: emisor,
    algorithm: 'SHA1',
    digits: String(DIGITOS),
    period: String(PASO_SEGUNDOS),
  });
  return `otpauth://totp/${etiqueta}?${parametros.toString()}`;
}
