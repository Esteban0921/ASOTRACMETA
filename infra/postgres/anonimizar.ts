import type pg from 'pg';

// Copia anonimizada para staging (spec §15, §20.8; TASK-0035). Se ejecuta SOBRE una base que ya es
// una copia (restore de un backup): reemplaza toda la PII por valores deterministas, borra secretos y
// sesiones y deja los datos operativos (colas, TR, viajes, recaudos) intactos para poder probar.
// Nunca corre sobre la base de producción: exige que el nombre de la base coincida con `confirmar`
// y rechaza `asotracmet`.

export interface ResumenAnonimizacion {
  base: string;
  asociados: number;
  conductores: number;
  vehiculos: number;
  usuarios: number;
  documentos: number;
  auditoria: number;
  sesionesBorradas: number;
}

export interface OpcionesAnonimizacion {
  /** Nombre exacto de la base destino: protección contra correr en el sitio equivocado. */
  confirmar: string;
  /** Hash de la contraseña de desarrollo para los roles internos (podrán entrar y re-enrolar TOTP). */
  passwordHashInterno: string;
}

const BASES_PROHIBIDAS = new Set(['asotracmet', 'postgres', 'template0', 'template1']);

export async function anonimizar(
  pool: pg.Pool,
  opciones: OpcionesAnonimizacion,
): Promise<ResumenAnonimizacion> {
  const cliente = await pool.connect();
  try {
    const { rows } = await cliente.query<{ base: string }>('select current_database() as base');
    const base = rows[0]?.base ?? '';
    if (BASES_PROHIBIDAS.has(base)) {
      throw new Error(`No se anonimiza la base "${base}": solo copias para staging`);
    }
    if (base !== opciones.confirmar) {
      throw new Error(`La base conectada es "${base}", no "${opciones.confirmar}"`);
    }
    await cliente.query('begin');

    const asociados = await cliente.query(
      `with numerados as (
         select id, tipo, row_number() over (order by created_at, id) as n from asociados
       )
       update asociados a set
         nombres = case when x.tipo = 'persona' then 'ASOCIADO ' || lpad(x.n::text, 3, '0') else null end,
         apellidos = case when x.tipo = 'persona' then 'ANONIMIZADO' else null end,
         razon_social = case when x.tipo = 'empresa' then 'EMPRESA ' || lpad(x.n::text, 3, '0') || ' ANONIMIZADA' else null end,
         documento = '9' || lpad(x.n::text, 9, '0'),
         documento_tipo = case when x.tipo = 'empresa' then 'NIT' else 'CC' end,
         celular = '300000' || lpad(x.n::text, 4, '0'),
         correo = 'asociado' || lpad(x.n::text, 3, '0') || '@ejemplo.test',
         direccion = null,
         cuenta_bancaria_enc = null,
         updated_at = now()
       from numerados x where x.id = a.id`,
    );

    const conductores = await cliente.query(
      `with numerados as (
         select id, row_number() over (order by created_at, id) as n from conductores
       )
       update conductores c set
         nombres = 'CONDUCTOR ' || lpad(x.n::text, 3, '0') || ' ANONIMIZADO',
         documento = '8' || lpad(x.n::text, 9, '0'),
         celular = '310000' || lpad(x.n::text, 4, '0'),
         correo = null,
         updated_at = now()
       from numerados x where x.id = c.id`,
    );

    const vehiculos = await cliente.query(
      `update vehiculos set
         propietario_nombre = case when propietario_nombre is null then null else 'PROPIETARIO ANONIMIZADO' end,
         propietario_documento = null,
         updated_at = now()`,
    );

    // Roles internos: entran con la contraseña de desarrollo y re-enrolan el segundo factor.
    // Asociados: correo determinista; entran con enlace mágico como siempre.
    const usuarios = await cliente.query(
      `with numerados as (
         select id, rol, row_number() over (order by created_at, id) as n from usuarios
       )
       update usuarios u set
         email = case when x.rol = 'member' then 'member' || lpad(x.n::text, 3, '0') || '@asotracmet.test' else u.email end,
         nombre = case when x.rol = 'member' then 'Asociado ' || lpad(x.n::text, 3, '0') else u.nombre end,
         telefono = null,
         password_hash = case when x.rol = 'member' or u.password_hash is null then null else $1 end,
         totp_secret_enc = null,
         last_login_at = null,
         updated_at = now()
       from numerados x where x.id = u.id`,
      [opciones.passwordHashInterno],
    );

    const documentos = await cliente.query(
      `update documentos set numero = null, archivo_url = null, updated_at = now()
        where numero is not null or archivo_url is not null`,
    );

    // La auditoría es append-only por trigger; en la copia de staging se relaja solo para vaciar la
    // PII de los eventos de maestros e IAM (el resto de eventos no la contiene).
    await cliente.query('alter table audit_log disable trigger audit_log_sin_update_ni_delete');
    const auditoria = await cliente.query(
      `update audit_log set
         before = case when before is null then null else jsonb_build_object('anonimizado', true) end,
         after = case when after is null then null else jsonb_build_object('anonimizado', true) end,
         ip = null, user_agent = null
       where entidad in ('asociados', 'conductores', 'usuarios', 'vehiculos', 'export')`,
    );
    await cliente.query('alter table audit_log enable trigger audit_log_sin_update_ni_delete');

    const sesiones = await cliente.query('select count(*)::int as n from sesiones');
    await cliente.query('truncate sesiones, otp_codes');

    await cliente.query('commit');
    return {
      base,
      asociados: asociados.rowCount ?? 0,
      conductores: conductores.rowCount ?? 0,
      vehiculos: vehiculos.rowCount ?? 0,
      usuarios: usuarios.rowCount ?? 0,
      documentos: documentos.rowCount ?? 0,
      auditoria: auditoria.rowCount ?? 0,
      sesionesBorradas: Number(sesiones.rows[0]?.n ?? 0),
    };
  } catch (error) {
    await cliente.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    cliente.release();
  }
}
