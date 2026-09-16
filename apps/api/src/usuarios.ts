import type pg from 'pg';
import type { Rol } from '@asotracmet/shared';

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  /** Null para `member` (entra con enlace mágico) y para el usuario de servicio. */
  passwordHash: string | null;
  /** Secreto TOTP cifrado (AES-GCM). Null hasta que el usuario configure su segundo factor. */
  totpSecretEnc: string | null;
  /** Último paso TOTP aceptado (login o re-auth): un código no vale dos veces (RFC 6238 §5.2). */
  totpUltimoPaso: number | null;
  activo: boolean;
  asociadoId: string | null;
  /** Scope `member` (tabla usuario_vehiculos). */
  vehiculoIds: string[];
}

export interface UsuarioPublico {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  asociadoId: string | null;
  vehiculoIds: string[];
  /** Si ya configuró el segundo factor. Nunca viaja el secreto. */
  totpConfigurado: boolean;
}

export function usuarioPublico(u: Usuario): UsuarioPublico {
  return {
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    rol: u.rol,
    activo: u.activo,
    asociadoId: u.asociadoId,
    vehiculoIds: [...u.vehiculoIds],
    totpConfigurado: u.totpSecretEnc !== null,
  };
}

/** Puerto de usuarios (autenticación e IAM). Asíncrono porque con Postgres es una consulta. */
export interface RepositorioUsuarios {
  porEmail(email: string): Promise<Usuario | undefined>;
  porId(id: string): Promise<Usuario | undefined>;
  listar(): Promise<Usuario[]>;
  crear(usuario: Usuario): Promise<void>;
  /** Reemplaza nombre, rol, activo, asociadoId, contraseña, secreto TOTP y placas. */
  actualizar(usuario: Usuario): Promise<void>;
  fijarTotpSecret(usuarioId: string, secretEnc: string | null): Promise<void>;
  /** Anti-replay (TASK-0040): registra el paso de 30 s del último código aceptado. */
  fijarTotpUltimoPaso(usuarioId: string, paso: number): Promise<void>;
}

function copia(u: Usuario): Usuario {
  return { ...u, vehiculoIds: [...u.vehiculoIds] };
}

/** Almacén de usuarios en memoria (fase puente). */
export class AlmacenUsuarios implements RepositorioUsuarios {
  private lista: Usuario[];

  constructor(usuarios: Usuario[]) {
    this.lista = usuarios.map(copia);
  }

  async porEmail(email: string): Promise<Usuario | undefined> {
    const normalizado = email.trim().toLowerCase();
    const u = this.lista.find((x) => x.email.toLowerCase() === normalizado);
    return u ? copia(u) : undefined;
  }

  async porId(id: string): Promise<Usuario | undefined> {
    const u = this.lista.find((x) => x.id === id);
    return u ? copia(u) : undefined;
  }

  async listar(): Promise<Usuario[]> {
    return [...this.lista].sort((a, b) => a.email.localeCompare(b.email)).map(copia);
  }

  async crear(usuario: Usuario): Promise<void> {
    this.lista.push(copia(usuario));
  }

  async actualizar(usuario: Usuario): Promise<void> {
    const indice = this.lista.findIndex((x) => x.id === usuario.id);
    if (indice >= 0) this.lista[indice] = copia(usuario);
  }

  async fijarTotpSecret(usuarioId: string, secretEnc: string | null): Promise<void> {
    const usuario = this.lista.find((u) => u.id === usuarioId);
    if (usuario) usuario.totpSecretEnc = secretEnc;
  }

  async fijarTotpUltimoPaso(usuarioId: string, paso: number): Promise<void> {
    const usuario = this.lista.find((u) => u.id === usuarioId);
    if (usuario) usuario.totpUltimoPaso = paso;
  }

  todos(): Usuario[] {
    return this.lista.map(copia);
  }

  reemplazar(usuarios: Usuario[]): void {
    this.lista = usuarios.map(copia);
  }
}

const SELECT_USUARIO = `
  select u.id, u.email, u.nombre, u.rol, u.password_hash, u.totp_secret_enc, u.totp_ultimo_paso,
         u.activo, u.asociado_id,
         coalesce(
           array_agg(uv.vehiculo_id) filter (where uv.vehiculo_id is not null),
           '{}'
         ) as vehiculo_ids
    from usuarios u
    left join usuario_vehiculos uv on uv.usuario_id = u.id`;

function aUsuario(f: Record<string, unknown>): Usuario {
  return {
    id: String(f.id),
    email: String(f.email),
    nombre: String(f.nombre),
    rol: String(f.rol) as Rol,
    passwordHash: f.password_hash === null ? null : String(f.password_hash),
    totpSecretEnc: f.totp_secret_enc === null ? null : String(f.totp_secret_enc),
    totpUltimoPaso:
      f.totp_ultimo_paso === null || f.totp_ultimo_paso === undefined
        ? null
        : Number(f.totp_ultimo_paso),
    activo: f.activo === true,
    asociadoId: f.asociado_id === null ? null : String(f.asociado_id),
    vehiculoIds: ((f.vehiculo_ids ?? []) as string[]).map(String),
  };
}

/**
 * Usuarios sobre Postgres. Se consulta con la conexión de la aplicación sin contexto RLS:
 * la autenticación ocurre antes de saber quién es el actor, y `usuarios` no lleva RLS.
 */
export class UsuariosPostgres implements RepositorioUsuarios {
  constructor(private readonly pool: pg.Pool) {}

  async porEmail(email: string): Promise<Usuario | undefined> {
    return this.uno(`${SELECT_USUARIO} where u.email = $1 group by u.id`, [email.trim()]);
  }

  async porId(id: string): Promise<Usuario | undefined> {
    return this.uno(`${SELECT_USUARIO} where u.id = $1 group by u.id`, [id]);
  }

  async listar(): Promise<Usuario[]> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `${SELECT_USUARIO} group by u.id order by u.email`,
    );
    return rows.map(aUsuario);
  }

  async crear(u: Usuario): Promise<void> {
    await this.enTransaccion(async (c) => {
      await c.query(
        `insert into usuarios (id, email, nombre, rol, password_hash, totp_secret_enc, activo, asociado_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [u.id, u.email, u.nombre, u.rol, u.passwordHash, u.totpSecretEnc, u.activo, u.asociadoId],
      );
      await this.reemplazarVehiculos(c, u);
    });
  }

  async actualizar(u: Usuario): Promise<void> {
    await this.enTransaccion(async (c) => {
      await c.query(
        `update usuarios
            set nombre = $2, rol = $3, password_hash = $4, totp_secret_enc = $5, activo = $6,
                asociado_id = $7, updated_at = now()
          where id = $1`,
        [u.id, u.nombre, u.rol, u.passwordHash, u.totpSecretEnc, u.activo, u.asociadoId],
      );
      await this.reemplazarVehiculos(c, u);
    });
  }

  async fijarTotpSecret(usuarioId: string, secretEnc: string | null): Promise<void> {
    await this.pool.query(
      'update usuarios set totp_secret_enc = $2, updated_at = now() where id = $1',
      [usuarioId, secretEnc],
    );
  }

  async fijarTotpUltimoPaso(usuarioId: string, paso: number): Promise<void> {
    await this.pool.query('update usuarios set totp_ultimo_paso = $2 where id = $1', [
      usuarioId,
      paso,
    ]);
  }

  private async reemplazarVehiculos(c: pg.PoolClient, u: Usuario): Promise<void> {
    await c.query('delete from usuario_vehiculos where usuario_id = $1', [u.id]);
    for (const vehiculoId of u.vehiculoIds) {
      await c.query('insert into usuario_vehiculos (usuario_id, vehiculo_id) values ($1, $2)', [
        u.id,
        vehiculoId,
      ]);
    }
  }

  private async enTransaccion(fn: (c: pg.PoolClient) => Promise<void>): Promise<void> {
    const c = await this.pool.connect();
    try {
      await c.query('begin');
      await fn(c);
      await c.query('commit');
    } catch (error) {
      await c.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      c.release();
    }
  }

  private async uno(sql: string, valores: unknown[]): Promise<Usuario | undefined> {
    const { rows } = await this.pool.query<Record<string, unknown>>(sql, valores);
    return rows[0] ? aUsuario(rows[0]) : undefined;
  }
}
