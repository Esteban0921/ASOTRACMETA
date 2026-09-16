import type pg from 'pg';
import type { Rol } from '@asotracmet/shared';
import type { CodigoOtp, PropositoOtp, RepositorioAuth, SesionRegistro } from '../auth/sesiones.js';

// Sesiones y códigos de un solo uso sobre Postgres (tablas `sesiones` y `otp_codes`).
// Se consulta con la conexión de la aplicación sin contexto RLS: ocurre antes de conocer al actor.

type Fila = Record<string, unknown>;

function instante(valor: unknown): string {
  return valor instanceof Date ? valor.toISOString() : new Date(String(valor)).toISOString();
}

function instanteONulo(valor: unknown): string | null {
  return valor === null || valor === undefined ? null : instante(valor);
}

function aSesion(f: Fila): SesionRegistro {
  return {
    id: String(f.id),
    usuarioId: String(f.usuario_id),
    rol: String(f.rol) as Rol,
    tokenHash: String(f.token_hash),
    creadaEn: instante(f.creada_en),
    expiraEn: instante(f.expira_en),
    revocadaEn: instanteONulo(f.revocada_en),
    reauthHasta: instanteONulo(f.reauth_hasta),
    reauthFactor:
      f.reauth_factor === null || f.reauth_factor === undefined
        ? null
        : (String(f.reauth_factor) as SesionRegistro['reauthFactor']),
    userAgent: f.user_agent === null ? null : String(f.user_agent),
    ip: f.ip === null ? null : String(f.ip),
  };
}

function aOtp(f: Fila): CodigoOtp {
  return {
    id: String(f.id),
    usuarioId: String(f.usuario_id),
    codigoHash: String(f.codigo_hash),
    proposito: String(f.proposito) as PropositoOtp,
    expiraEn: instante(f.expira_en),
    usadoEn: instanteONulo(f.usado_en),
    intentos: Number(f.intentos),
    creadoEn: instante(f.created_at),
  };
}

export class AuthPostgres implements RepositorioAuth {
  constructor(private readonly pool: pg.Pool) {}

  async crearSesion(s: SesionRegistro): Promise<void> {
    await this.pool.query(
      `insert into sesiones (id, usuario_id, rol, token_hash, creada_en, expira_en, revocada_en, reauth_hasta, reauth_factor, user_agent, ip)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        s.id,
        s.usuarioId,
        s.rol,
        s.tokenHash,
        s.creadaEn,
        s.expiraEn,
        s.revocadaEn,
        s.reauthHasta,
        s.reauthFactor,
        s.userAgent,
        s.ip,
      ],
    );
  }

  async sesionPorHash(tokenHash: string): Promise<SesionRegistro | undefined> {
    const { rows } = await this.pool.query<Fila>('select * from sesiones where token_hash = $1', [
      tokenHash,
    ]);
    return rows[0] ? aSesion(rows[0]) : undefined;
  }

  async actualizarSesion(s: SesionRegistro): Promise<void> {
    await this.pool.query(
      'update sesiones set revocada_en = $2, reauth_hasta = $3, expira_en = $4, reauth_factor = $5 where id = $1',
      [s.id, s.revocadaEn, s.reauthHasta, s.expiraEn, s.reauthFactor],
    );
  }

  async revocarSesionesDe(usuarioId: string): Promise<number> {
    const resultado = await this.pool.query(
      'update sesiones set revocada_en = now() where usuario_id = $1 and revocada_en is null',
      [usuarioId],
    );
    return resultado.rowCount ?? 0;
  }

  async guardarOtp(c: CodigoOtp): Promise<void> {
    await this.pool.query(
      `insert into otp_codes (id, usuario_id, codigo_hash, proposito, expira_en, usado_en, intentos, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [c.id, c.usuarioId, c.codigoHash, c.proposito, c.expiraEn, c.usadoEn, c.intentos, c.creadoEn],
    );
  }

  async otpVigente(
    usuarioId: string,
    proposito: PropositoOtp,
    ahora: string,
  ): Promise<CodigoOtp | undefined> {
    const { rows } = await this.pool.query<Fila>(
      `select * from otp_codes
        where usuario_id = $1 and proposito = $2 and usado_en is null and expira_en > $3::timestamptz
        order by created_at desc limit 1`,
      [usuarioId, proposito, ahora],
    );
    return rows[0] ? aOtp(rows[0]) : undefined;
  }

  async otpPorHash(codigoHash: string, proposito: PropositoOtp): Promise<CodigoOtp | undefined> {
    const { rows } = await this.pool.query<Fila>(
      'select * from otp_codes where codigo_hash = $1 and proposito = $2',
      [codigoHash, proposito],
    );
    return rows[0] ? aOtp(rows[0]) : undefined;
  }

  async actualizarOtp(c: CodigoOtp): Promise<void> {
    await this.pool.query('update otp_codes set usado_en = $2, intentos = $3 where id = $1', [
      c.id,
      c.usadoEn,
      c.intentos,
    ]);
  }
}
