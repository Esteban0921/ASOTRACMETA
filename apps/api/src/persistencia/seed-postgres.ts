import type pg from 'pg';
import { v5 as uuidv5 } from 'uuid';
import { crearSeed } from '../seed.js';

// Volcado del mismo conjunto anonimizado del almacén en memoria a Postgres (TASK-0039).
// Los identificadores legibles (`veh-FST189`) se convierten en UUID deterministas, así que
// sembrar dos veces no duplica nada y los tests pueden resolver ids por llave de negocio.

/** Namespace fijo del proyecto. No es un secreto: solo hace deterministas los UUID. */
const NAMESPACE = 'b3f1c0de-0000-5000-8000-a50713ac1e70';

export function uuidSemilla(nombre: string): string {
  return uuidv5(nombre, NAMESPACE);
}

async function idUnico(cliente: pg.PoolClient, sql: string, valores: unknown[]): Promise<string> {
  const { rows } = await cliente.query<{ id: string }>(sql, valores);
  const id = rows[0]?.id;
  if (!id) throw new Error(`La semilla no obtuvo id para: ${sql.slice(0, 60)}`);
  return id;
}

export interface ResultadoSemilla {
  asociados: number;
  vehiculos: number;
  usuarios: number;
  requerimientos: number;
}

export async function sembrarPostgres(
  pool: pg.Pool,
  ahora: Date,
  claveCifrado: Buffer,
): Promise<ResultadoSemilla> {
  const { estado, usuarios, maestros } = crearSeed(ahora, claveCifrado);
  const cliente = await pool.connect();
  try {
    await cliente.query('begin');

    // Clientes, destinos y motivos ya vienen de 0010_datos_base: se resuelven por su llave
    // de negocio en vez de imponer los ids de la semilla.
    const idCliente = new Map<string, string>();
    for (const c of estado.clientes) {
      idCliente.set(
        c.id,
        await idUnico(
          cliente,
          `insert into clientes (codigo, nombre, requiere_habilitacion) values ($1, $2, $3)
           on conflict (codigo) do update set nombre = excluded.nombre returning id`,
          [c.codigo, c.nombre, c.requiereHabilitacion],
        ),
      );
    }

    const idDestino = new Map<string, string>();
    for (const d of estado.destinos) {
      idDestino.set(
        d.id,
        await idUnico(
          cliente,
          `insert into destinos (id, nombre, km, activo) values ($1, $2, $3, $4)
           on conflict (nombre) do update set km = excluded.km returning id`,
          [uuidSemilla(d.id), d.nombre, d.km, d.activo],
        ),
      );
    }

    const idMotivo = new Map<string, string>();
    for (const m of estado.motivosDeclinacion) {
      idMotivo.set(
        m.id,
        await idUnico(
          cliente,
          `insert into motivos_declinacion (id, codigo, nombre, activo) values ($1, $2, $3, $4)
           on conflict (codigo) do update set nombre = excluded.nombre returning id`,
          [uuidSemilla(m.id), m.codigo, m.nombre, m.activo],
        ),
      );
    }

    for (const a of estado.asociados) {
      await cliente.query(
        `insert into asociados (id, tipo, nombres, apellidos, razon_social, documento, documento_tipo, celular, correo, estado)
         values ($1, $2, $3, $4, $5, $6, 'CC', $7, $8, 'activo')
         on conflict (documento) do update set nombres = excluded.nombres, celular = excluded.celular`,
        [
          uuidSemilla(a.id),
          a.tipo,
          a.nombres,
          a.apellidos,
          a.razonSocial,
          a.documento,
          a.celular,
          a.correo,
        ],
      );
    }

    for (const v of estado.vehiculos) {
      await cliente.query(
        `insert into vehiculos (id, placa, clase, clase_cola, asociado_id, estado, no_elegible_hasta)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (placa) do update set
           clase = excluded.clase, clase_cola = excluded.clase_cola,
           asociado_id = excluded.asociado_id, estado = excluded.estado`,
        [
          uuidSemilla(v.id),
          v.placa,
          v.clase,
          v.claseCola,
          uuidSemilla(v.asociadoId),
          v.estado,
          v.noElegibleHasta,
        ],
      );
    }

    for (const h of estado.habilitaciones) {
      await cliente.query(
        `insert into habilitaciones (id, vehiculo_id, cliente_id, apto, motivo_bloqueo)
         values ($1, $2, $3, $4, $5)
         on conflict (vehiculo_id, cliente_id) do update set
           apto = excluded.apto, motivo_bloqueo = excluded.motivo_bloqueo, updated_at = now()`,
        [
          uuidSemilla(`hab-${h.vehiculoId}-${h.clienteId}`),
          uuidSemilla(h.vehiculoId),
          idCliente.get(h.clienteId),
          h.apto,
          h.motivoBloqueo,
        ],
      );
    }

    for (const d of estado.documentos) {
      const tipo = await cliente.query<{ id: string }>(
        'select id from tipos_documento where codigo = $1',
        [d.tipoCodigo],
      );
      if (!tipo.rows[0]) continue;
      await cliente.query(
        `insert into documentos (id, sujeto_tipo, sujeto_id, tipo_id, vence_en, estado)
         values ($1, $2, $3, $4, $5::date, 'vencido')
         on conflict (id) do update set vence_en = excluded.vence_en`,
        [uuidSemilla(d.id), d.sujetoTipo, uuidSemilla(d.sujetoId), tipo.rows[0].id, d.venceEn],
      );
    }

    for (const p of estado.posiciones) {
      await cliente.query(
        `insert into cola_posiciones
           (id, clase_cola, vehiculo_id, posicion, ciclo, turnos_ofrecidos, turnos_tomados, saltos_pendientes, version)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (clase_cola, vehiculo_id) do update set
           posicion = excluded.posicion, ciclo = excluded.ciclo,
           turnos_ofrecidos = excluded.turnos_ofrecidos, turnos_tomados = excluded.turnos_tomados,
           saltos_pendientes = excluded.saltos_pendientes, updated_at = now()`,
        [
          uuidSemilla(p.id),
          p.claseCola,
          uuidSemilla(p.vehiculoId),
          p.posicion,
          p.ciclo,
          p.turnosOfrecidos,
          p.turnosTomados,
          p.saltosPendientes,
          p.version,
        ],
      );
    }

    for (const u of usuarios) {
      await cliente.query(
        `insert into usuarios (id, email, nombre, rol, password_hash, totp_secret_enc, activo, asociado_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (email) do update set
           nombre = excluded.nombre, rol = excluded.rol,
           password_hash = excluded.password_hash, totp_secret_enc = excluded.totp_secret_enc,
           activo = excluded.activo, asociado_id = excluded.asociado_id, updated_at = now()`,
        [
          uuidSemilla(u.id),
          u.email,
          u.nombre,
          u.rol,
          u.passwordHash,
          u.totpSecretEnc,
          u.activo,
          u.asociadoId ? uuidSemilla(u.asociadoId) : null,
        ],
      );
      for (const vehiculoId of u.vehiculoIds) {
        await cliente.query(
          `insert into usuario_vehiculos (usuario_id, vehiculo_id) values ($1, $2)
           on conflict do nothing`,
          [uuidSemilla(u.id), uuidSemilla(vehiculoId)],
        );
      }
    }

    // Maestros extra (spec §6.3-6.4): transportadoras, conductores, tarifas y ficha de documentos.
    for (const t of maestros.transportadoras) {
      await cliente.query(
        `insert into transportadoras (id, nombre, activo) values ($1, $2, $3)
         on conflict (nombre) do update set activo = excluded.activo`,
        [uuidSemilla(t.id), t.nombre, t.activo],
      );
    }
    for (const c of maestros.conductores) {
      await cliente.query(
        `insert into conductores (id, nombres, documento, celular, correo, asociado_id, licencia_categoria, licencia_vence)
         values ($1, $2, $3, $4, $5, $6, $7, $8::date)
         on conflict (documento) do update set nombres = excluded.nombres, licencia_vence = excluded.licencia_vence`,
        [
          uuidSemilla(c.id),
          c.nombres,
          c.documento,
          c.celular,
          c.correo,
          c.asociadoId ? uuidSemilla(c.asociadoId) : null,
          c.licenciaCategoria,
          c.licenciaVence,
        ],
      );
    }
    for (const vc of maestros.vehiculoConductores) {
      await cliente.query(
        `insert into vehiculo_conductores (vehiculo_id, conductor_id, es_principal) values ($1, $2, $3)
         on conflict do nothing`,
        [uuidSemilla(vc.vehiculoId), uuidSemilla(vc.conductorId), vc.esPrincipal],
      );
    }
    for (const t of maestros.tarifas) {
      await cliente.query(
        `insert into tarifas (id, cliente_id, origen, destino_id, clase, modalidad, valor, vigencia_desde, vigencia_hasta)
         values ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::date)
         on conflict (cliente_id, destino_id, clase, modalidad, vigencia_desde) do update set valor = excluded.valor`,
        [
          uuidSemilla(t.id),
          idCliente.get(t.clienteId),
          t.origen,
          idDestino.get(t.destinoId),
          t.clase,
          t.modalidad,
          t.valor,
          t.vigenciaDesde,
          t.vigenciaHasta,
        ],
      );
    }
    for (const d of maestros.documentos) {
      await cliente.query(
        'update documentos set numero = $2, emitido_en = $3::date where id = $1',
        [uuidSemilla(d.id), d.numero, d.emitidoEn],
      );
    }

    for (const r of estado.requerimientos) {
      await cliente.query(
        `insert into requerimientos
           (id, cliente_id, destino_id, clase_cola, fecha_servicio, cantidad_cupos, observaciones, estado, creado_por)
         values ($1, $2, $3, $4, $5::date, $6, $7, $8, $9)
         on conflict (id) do nothing`,
        [
          uuidSemilla(r.id),
          idCliente.get(r.clienteId),
          r.destinoId ? idDestino.get(r.destinoId) : null,
          r.claseCola,
          r.fechaServicio,
          r.cantidadCupos,
          r.observaciones,
          r.estado,
          uuidSemilla(r.creadoPor),
        ],
      );
    }

    await cliente.query('commit');
    return {
      asociados: estado.asociados.length,
      vehiculos: estado.vehiculos.length,
      usuarios: usuarios.length,
      requerimientos: estado.requerimientos.length,
    };
  } catch (error) {
    await cliente.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    cliente.release();
  }
}
