import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import type { Rol } from '@asotracmet/shared';

// Sesiones opacas y revocables + códigos de un solo uso (spec §3.3, §6.1).
// El token de sesión nunca se guarda: solo su hash. Un logout revoca de verdad.

export type PropositoOtp = 'login' | 'magic_link' | 'reauth';

export interface SesionRegistro {
  id: string;
  usuarioId: string;
  rol: Rol;
  tokenHash: string;
  creadaEn: string;
  expiraEn: string;
  revocadaEn: string | null;
  /** Ventana de re-autenticación para acciones sensibles (reset de cola, spec §3.3). */
  reauthHasta: string | null;
  /** Con qué se re-autenticó: el reset de cola exige el segundo factor si `reset_cola_requiere_2fa`. */
  reauthFactor: 'password' | 'totp' | null;
  userAgent: string | null;
  ip: string | null;
}

export interface CodigoOtp {
  id: string;
  usuarioId: string;
  codigoHash: string;
  proposito: PropositoOtp;
  expiraEn: string;
  usadoEn: string | null;
  intentos: number;
  creadoEn: string;
}

export interface RepositorioAuth {
  crearSesion(sesion: SesionRegistro): Promise<void>;
  sesionPorHash(tokenHash: string): Promise<SesionRegistro | undefined>;
  actualizarSesion(sesion: SesionRegistro): Promise<void>;
  /** Revoca todas las sesiones vivas de un usuario (cambio de rol, baja). Devuelve cuántas. */
  revocarSesionesDe(usuarioId: string): Promise<number>;

  guardarOtp(codigo: CodigoOtp): Promise<void>;
  /** El código más reciente, no usado y no vencido, de ese usuario y propósito. */
  otpVigente(
    usuarioId: string,
    proposito: PropositoOtp,
    ahora: string,
  ): Promise<CodigoOtp | undefined>;
  otpPorHash(codigoHash: string, proposito: PropositoOtp): Promise<CodigoOtp | undefined>;
  actualizarOtp(codigo: CodigoOtp): Promise<void>;
}

export function generarTokenOpaco(prefijo: string): string {
  return `${prefijo}_${randomBytes(32).toString('base64url')}`;
}

/** Hash del token de sesión (256 bits aleatorios: SHA-256 basta). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Hash con clave para códigos cortos: un volcado de `otp_codes` no permite adivinarlos. */
export function hashConSecreto(valor: string, secreto: string): string {
  return createHmac('sha256', secreto).update(valor).digest('hex');
}

export function generarCodigoNumerico(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Adaptador en memoria (dev, tests, e2e). */
export class AuthMemoria implements RepositorioAuth {
  private sesiones: SesionRegistro[] = [];
  private codigos: CodigoOtp[] = [];

  async crearSesion(sesion: SesionRegistro): Promise<void> {
    this.sesiones.push({ ...sesion });
  }

  async sesionPorHash(tokenHash: string): Promise<SesionRegistro | undefined> {
    const s = this.sesiones.find((x) => x.tokenHash === tokenHash);
    return s ? { ...s } : undefined;
  }

  async actualizarSesion(sesion: SesionRegistro): Promise<void> {
    const indice = this.sesiones.findIndex((x) => x.id === sesion.id);
    if (indice >= 0) this.sesiones[indice] = { ...sesion };
  }

  async revocarSesionesDe(usuarioId: string): Promise<number> {
    const ahora = new Date().toISOString();
    let n = 0;
    this.sesiones = this.sesiones.map((s) => {
      if (s.usuarioId !== usuarioId || s.revocadaEn) return s;
      n += 1;
      return { ...s, revocadaEn: ahora };
    });
    return n;
  }

  async guardarOtp(codigo: CodigoOtp): Promise<void> {
    this.codigos.push({ ...codigo });
  }

  async otpVigente(
    usuarioId: string,
    proposito: PropositoOtp,
    ahora: string,
  ): Promise<CodigoOtp | undefined> {
    const vigente = [...this.codigos]
      .reverse()
      .find(
        (c) =>
          c.usuarioId === usuarioId &&
          c.proposito === proposito &&
          !c.usadoEn &&
          c.expiraEn > ahora,
      );
    return vigente ? { ...vigente } : undefined;
  }

  async otpPorHash(codigoHash: string, proposito: PropositoOtp): Promise<CodigoOtp | undefined> {
    const c = this.codigos.find((x) => x.codigoHash === codigoHash && x.proposito === proposito);
    return c ? { ...c } : undefined;
  }

  async actualizarOtp(codigo: CodigoOtp): Promise<void> {
    const indice = this.codigos.findIndex((x) => x.id === codigo.id);
    if (indice >= 0) this.codigos[indice] = { ...codigo };
  }

  limpiar(): void {
    this.sesiones = [];
    this.codigos = [];
  }
}
