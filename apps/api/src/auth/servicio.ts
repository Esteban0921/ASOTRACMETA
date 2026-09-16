import { timingSafeEqual } from 'node:crypto';
import { ErrorDominio, type GeneradorIds, type Reloj } from '@asotracmet/domain';
import { DURACION_SESION_HORAS, requiere2fa, sumarHoras, sumarMinutos } from '@asotracmet/shared';
import {
  usuarioPublico,
  type RepositorioUsuarios,
  type Usuario,
  type UsuarioPublico,
} from '../usuarios.js';
import { cifrar, descifrar } from './cifrado.js';
import type { Mensajeria } from './mensajeria.js';
import { verificarPassword } from './passwords.js';
import {
  generarCodigoNumerico,
  generarTokenOpaco,
  hashConSecreto,
  hashToken,
  type CodigoOtp,
  type RepositorioAuth,
  type SesionRegistro,
} from './sesiones.js';
import { firmarToken, verificarToken, type PayloadFirmado } from './tokens.js';
import { codigoTotp, generarSecretoTotp, otpauthUrl, verificarCodigoTotp } from './totp.js';

// Flujos de acceso (spec §3.3):
//   roles internos → contraseña + TOTP, o código de un solo uso por correo
//   member         → enlace mágico de un solo uso
// Sesiones opacas con expiración por rol y revocación real; re-autenticación para acciones sensibles.

export interface ConfigAuth {
  authSecret: string;
  claveCifrado: Buffer;
  /** Base de los enlaces de acceso (`/entrar?token=`). */
  urlWeb: string;
  otpTtlMinutos: number;
  magicLinkTtlMinutos: number;
  challengeTtlMinutos: number;
  reauthMinutos: number;
  maxIntentosOtp: number;
}

export interface DepsServicioAuth {
  usuarios: RepositorioUsuarios;
  auth: RepositorioAuth;
  mensajeria: Mensajeria;
  reloj: Reloj;
  ids: GeneradorIds;
  config: ConfigAuth;
}

export interface MetaPeticion {
  ip: string | null;
  userAgent: string | null;
}

export interface SesionEmitida {
  token: string;
  expiraEn: string;
  usuario: UsuarioPublico;
}

export type RespuestaLogin =
  | { paso: 'codigo_enviado' }
  | { paso: 'totp'; challenge: string }
  | { paso: 'totp_enrolar'; challenge: string; secret: string; otpauthUrl: string }
  | ({ paso: 'sesion' } & SesionEmitida);

export interface SesionActiva {
  sesion: SesionRegistro;
  usuario: Usuario;
}

interface RetoTotp extends PayloadFirmado {
  proposito: 'totp';
  sub: string;
  enrolando: boolean;
  /** Solo al enrolar: el secreto propuesto, cifrado, hasta que el usuario demuestre tenerlo. */
  secretEnc?: string;
}

const PREFIJO_SESION = 'sess';

export class ServicioAuth {
  constructor(private readonly deps: DepsServicioAuth) {}

  /**
   * Con contraseña: primer factor de un rol interno, responde con el reto TOTP.
   * Sin contraseña: envía código (roles internos) o enlace (`member`). La respuesta es la misma
   * exista o no el correo, para no revelar qué cuentas hay.
   */
  async login(
    email: string,
    password: string | undefined,
    meta: MetaPeticion,
  ): Promise<RespuestaLogin> {
    if (!password) {
      await this.solicitarCodigo(email);
      return { paso: 'codigo_enviado' };
    }
    const usuario = await this.deps.usuarios.porEmail(email);
    if (!usuario || !usuario.activo || !verificarPassword(password, usuario.passwordHash)) {
      throw new ErrorDominio('UNAUTHORIZED', 'Credenciales inválidas');
    }
    if (!requiere2fa(usuario.rol)) {
      return { paso: 'sesion', ...(await this.crearSesion(usuario, meta)) };
    }
    const ahora = this.deps.reloj.ahora();
    const exp = Math.floor(
      sumarMinutos(ahora, this.deps.config.challengeTtlMinutos).getTime() / 1000,
    );
    if (usuario.totpSecretEnc) {
      const challenge = firmarToken<RetoTotp>(
        { proposito: 'totp', sub: usuario.id, enrolando: false, exp },
        this.deps.config.authSecret,
      );
      return { paso: 'totp', challenge };
    }
    // Primer acceso con contraseña: el segundo factor es obligatorio, así que se configura aquí.
    const secret = generarSecretoTotp();
    const challenge = firmarToken<RetoTotp>(
      {
        proposito: 'totp',
        sub: usuario.id,
        enrolando: true,
        secretEnc: cifrar(secret, this.deps.config.claveCifrado),
        exp,
      },
      this.deps.config.authSecret,
    );
    return {
      paso: 'totp_enrolar',
      challenge,
      secret,
      otpauthUrl: otpauthUrl(secret, usuario.email),
    };
  }

  /** Segundo factor. Si el reto era de enrolamiento, un código válido activa el secreto. */
  async verificarTotp(
    challenge: string,
    codigo: string,
    meta: MetaPeticion,
  ): Promise<SesionEmitida> {
    const ahora = this.deps.reloj.ahora();
    const reto = verificarToken<RetoTotp>(challenge, this.deps.config.authSecret, ahora, 'totp');
    if (!reto) throw new ErrorDominio('CHALLENGE_INVALIDO', 'El reto expiró o no es válido');
    const usuario = await this.deps.usuarios.porId(reto.sub);
    if (!usuario || !usuario.activo)
      throw new ErrorDominio('CHALLENGE_INVALIDO', 'Usuario inactivo');

    let secretEnc: string;
    if (reto.enrolando) {
      if (!reto.secretEnc)
        throw new ErrorDominio('CHALLENGE_INVALIDO', 'Reto de enrolamiento incompleto');
      secretEnc = reto.secretEnc;
    } else {
      if (!usuario.totpSecretEnc) {
        throw new ErrorDominio(
          'TOTP_NO_ENROLADO',
          'El usuario no tiene segundo factor configurado',
        );
      }
      secretEnc = usuario.totpSecretEnc;
    }
    if (!verificarCodigoTotp(this.descifrarSecreto(secretEnc), codigo, ahora)) {
      throw new ErrorDominio('CODIGO_INVALIDO', 'Código incorrecto');
    }
    if (reto.enrolando) await this.deps.usuarios.fijarTotpSecret(usuario.id, secretEnc);
    // El repositorio devuelve copias: la sesión se emite con el secreto ya activado.
    return this.crearSesion({ ...usuario, totpSecretEnc: secretEnc }, meta);
  }

  /** Código por correo (roles internos) o enlace mágico (`member`). Silencioso si el correo no existe. */
  async solicitarCodigo(email: string): Promise<void> {
    const usuario = await this.deps.usuarios.porEmail(email);
    if (!usuario || !usuario.activo) return;
    const ahora = this.deps.reloj.ahora();
    if (usuario.rol === 'member') {
      const token = generarTokenOpaco('ml');
      await this.deps.auth.guardarOtp(
        this.nuevoOtp(
          usuario.id,
          hashConSecreto(token, this.deps.config.authSecret),
          'magic_link',
          ahora,
          this.deps.config.magicLinkTtlMinutos,
        ),
      );
      const enlace = `${this.deps.config.urlWeb.replace(/\/$/, '')}/entrar?token=${token}`;
      await this.deps.mensajeria.enviar({
        canal: 'correo',
        para: usuario.email,
        asunto: 'Tu enlace de acceso a ASOTRACMET',
        texto: `Abre este enlace para entrar a "Mi turno" (vale ${this.deps.config.magicLinkTtlMinutos} minutos y una sola vez): ${enlace}`,
        enlace,
      });
      return;
    }
    const codigo = generarCodigoNumerico();
    await this.deps.auth.guardarOtp(
      this.nuevoOtp(
        usuario.id,
        hashConSecreto(codigo, this.deps.config.authSecret),
        'login',
        ahora,
        this.deps.config.otpTtlMinutos,
      ),
    );
    await this.deps.mensajeria.enviar({
      canal: 'correo',
      para: usuario.email,
      asunto: 'Tu código de acceso a ASOTRACMET',
      texto: `Tu código es ${codigo}. Vale ${this.deps.config.otpTtlMinutos} minutos.`,
      codigo,
    });
  }

  /** Código por correo: método completo para roles internos (spec §3.3 "correo + OTP"). */
  async verificarOtp(email: string, codigo: string, meta: MetaPeticion): Promise<SesionEmitida> {
    const usuario = await this.deps.usuarios.porEmail(email);
    if (!usuario || !usuario.activo) throw new ErrorDominio('CODIGO_INVALIDO', 'Código incorrecto');
    const ahora = this.deps.reloj.ahora();
    const otp = await this.deps.auth.otpVigente(usuario.id, 'login', ahora.toISOString());
    if (!otp) throw new ErrorDominio('CODIGO_INVALIDO', 'Código incorrecto o vencido');
    if (otp.intentos >= this.deps.config.maxIntentosOtp) {
      throw new ErrorDominio('DEMASIADOS_INTENTOS', 'Demasiados intentos: pide un código nuevo');
    }
    if (!hashesIguales(hashConSecreto(codigo, this.deps.config.authSecret), otp.codigoHash)) {
      await this.deps.auth.actualizarOtp({ ...otp, intentos: otp.intentos + 1 });
      throw new ErrorDominio('CODIGO_INVALIDO', 'Código incorrecto');
    }
    await this.deps.auth.actualizarOtp({ ...otp, usadoEn: ahora.toISOString() });
    return this.crearSesion(usuario, meta);
  }

  /** Enlace mágico de un solo uso (`member`). */
  async canjearMagicLink(token: string, meta: MetaPeticion): Promise<SesionEmitida> {
    const ahora = this.deps.reloj.ahora();
    const otp = await this.deps.auth.otpPorHash(
      hashConSecreto(token, this.deps.config.authSecret),
      'magic_link',
    );
    if (!otp || otp.usadoEn || otp.expiraEn <= ahora.toISOString()) {
      throw new ErrorDominio('CODIGO_INVALIDO', 'El enlace no es válido, ya se usó o venció');
    }
    const usuario = await this.deps.usuarios.porId(otp.usuarioId);
    if (!usuario || !usuario.activo) throw new ErrorDominio('CODIGO_INVALIDO', 'Usuario inactivo');
    await this.deps.auth.actualizarOtp({ ...otp, usadoEn: ahora.toISOString() });
    return this.crearSesion(usuario, meta);
  }

  /** Resuelve el Bearer a sesión + usuario, o null si no vale (expirada, revocada, usuario inactivo). */
  async resolverSesion(token: string): Promise<SesionActiva | null> {
    if (!token.startsWith(`${PREFIJO_SESION}_`)) return null;
    const sesion = await this.deps.auth.sesionPorHash(hashToken(token));
    if (!sesion || sesion.revocadaEn) return null;
    if (sesion.expiraEn <= this.deps.reloj.ahora().toISOString()) return null;
    const usuario = await this.deps.usuarios.porId(sesion.usuarioId);
    if (!usuario || !usuario.activo) return null;
    return { sesion, usuario };
  }

  async cerrarSesion(sesion: SesionRegistro): Promise<void> {
    await this.deps.auth.actualizarSesion({
      ...sesion,
      revocadaEn: this.deps.reloj.ahora().toISOString(),
    });
  }

  /** Re-autenticación con contraseña o código TOTP: abre una ventana corta para acciones sensibles. */
  async reauth(
    activa: SesionActiva,
    credencial: { password?: string; codigo?: string },
  ): Promise<{ reauthHasta: string }> {
    const ahora = this.deps.reloj.ahora();
    let factor: SesionRegistro['reauthFactor'] = null;
    if (credencial.codigo && activa.usuario.totpSecretEnc) {
      if (
        verificarCodigoTotp(
          this.descifrarSecreto(activa.usuario.totpSecretEnc),
          credencial.codigo,
          ahora,
        )
      ) {
        factor = 'totp';
      }
    } else if (credencial.password && activa.usuario.passwordHash) {
      if (verificarPassword(credencial.password, activa.usuario.passwordHash)) factor = 'password';
    }
    if (!factor) {
      throw new ErrorDominio('CODIGO_INVALIDO', 'La contraseña o el código no coinciden');
    }
    const reauthHasta = sumarMinutos(ahora, this.deps.config.reauthMinutos).toISOString();
    await this.deps.auth.actualizarSesion({ ...activa.sesion, reauthHasta, reauthFactor: factor });
    return { reauthHasta };
  }

  /** Solo para el modo e2e: el código TOTP vigente de un usuario enrolado (o de un secreto dado). */
  async codigoTotpActual(opciones: { email?: string; secret?: string }): Promise<string | null> {
    let secreto = opciones.secret ?? null;
    if (!secreto && opciones.email) {
      const usuario = await this.deps.usuarios.porEmail(opciones.email);
      if (usuario?.totpSecretEnc) secreto = this.descifrarSecreto(usuario.totpSecretEnc);
    }
    return secreto ? codigoTotp(secreto, this.deps.reloj.ahora()) : null;
  }

  private async crearSesion(usuario: Usuario, meta: MetaPeticion): Promise<SesionEmitida> {
    const ahora = this.deps.reloj.ahora();
    const token = generarTokenOpaco(PREFIJO_SESION);
    const expiraEn = sumarHoras(ahora, DURACION_SESION_HORAS[usuario.rol]).toISOString();
    await this.deps.auth.crearSesion({
      id: this.deps.ids.nuevo(),
      usuarioId: usuario.id,
      rol: usuario.rol,
      tokenHash: hashToken(token),
      creadaEn: ahora.toISOString(),
      expiraEn,
      revocadaEn: null,
      reauthHasta: null,
      reauthFactor: null,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });
    return { token, expiraEn, usuario: usuarioPublico(usuario) };
  }

  private nuevoOtp(
    usuarioId: string,
    codigoHash: string,
    proposito: CodigoOtp['proposito'],
    ahora: Date,
    ttlMinutos: number,
  ): CodigoOtp {
    return {
      id: this.deps.ids.nuevo(),
      usuarioId,
      codigoHash,
      proposito,
      expiraEn: sumarMinutos(ahora, ttlMinutos).toISOString(),
      usadoEn: null,
      intentos: 0,
      creadoEn: ahora.toISOString(),
    };
  }

  private descifrarSecreto(secretEnc: string): string {
    try {
      return descifrar(secretEnc, this.deps.config.claveCifrado);
    } catch (error) {
      throw new ErrorDominio('INTERNAL', 'No se pudo leer el secreto TOTP: revisa CIFRADO_CLAVE', {
        causa: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function hashesIguales(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
