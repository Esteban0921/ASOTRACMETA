import type pg from 'pg';
import { cifrar } from '@asotracmet/api/cifrado';
import { crearSeed, ID_USUARIO_SISTEMA } from '@asotracmet/api/seed';
import { uuidSemilla } from '@asotracmet/api/seed-postgres';
import type { Plan } from './modelo.js';

// Carga del plan en Postgres (spec §13). Una sola transacción: o entra todo o no entra nada.
// Repetible: los ids son UUID v5 de la llave de negocio (`veh-FST189`, `leg-asociado-<documento>`),
// los mismos que usa `sembrarPostgres`, así que una placa de la semilla y la misma placa del Excel
// son la misma fila. `dryRun` ejecuta todo y hace rollback: sirve para validar contra el esquema real.

export interface OpcionesCarga {
  dryRun: boolean;
  /** Clave AES-256-GCM de la API: cifra cuentas bancarias y los secretos TOTP de los usuarios internos. */
  claveCifrado: Buffer;
  ahora: Date;
}

export interface ResumenCarga {
  commit: boolean;
  clientes: number;
  destinos: number;
  transportadoras: number;
  tarifas: number;
  asociados: number;
  vehiculos: number;
  conductores: number;
  documentos: number;
  habilitaciones: number;
  posiciones: number;
  usuarios: number;
  requerimientos: number;
  trs: number;
  viajes: number;
  recaudos: number;
}

const ID = {
  asociado: (documento: string) => uuidSemilla(`leg-asociado-${documento}`),
  vehiculo: (placa: string) => uuidSemilla(`veh-${placa}`),
  conductor: (documento: string) => uuidSemilla(`leg-conductor-${documento}`),
  documento: (placa: string, tipo: string) => uuidSemilla(`leg-doc-${placa}-${tipo}`),
  habilitacion: (placa: string, cliente: string) => uuidSemilla(`leg-hab-${placa}-${cliente}`),
  destino: (nombre: string) => uuidSemilla(`leg-destino-${nombre}`),
  transportadora: (nombre: string) => uuidSemilla(`leg-tra-${nombre}`),
  tarifa: (t: {
    cliente: string;
    destino: string;
    clase: string;
    modalidad: string;
    vigenciaDesde: string;
  }) =>
    uuidSemilla(
      `leg-tarifa-${t.cliente}-${t.destino}-${t.clase}-${t.modalidad}-${t.vigenciaDesde}`,
    ),
  posicion: (placa: string) => uuidSemilla(`pos-${placa}`),
  requerimiento: (codigo: string) => uuidSemilla(`leg-req-${codigo}`),
  tr: (codigo: string) => uuidSemilla(`leg-tr-${codigo}`),
  viaje: (codigo: string) => uuidSemilla(`leg-viaje-${codigo}`),
  recaudo: (codigo: string) => uuidSemilla(`leg-rec-${codigo}`),
  usuarioMember: (email: string) => uuidSemilla(`leg-usr-${email}`),
};

/** `parametros.recaudo_porcentaje` (RULE-012). Null si la tabla no existe todavía. */
export async function leerPorcentajeRecaudo(pool: pg.Pool): Promise<number | null> {
  try {
    const { rows } = await pool.query<{ value: unknown }>(
      "select value from parametros where key = 'recaudo_porcentaje'",
    );
    const valor = rows[0]?.value;
    return typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : null;
  } catch {
    return null;
  }
}

async function idPor(cliente: pg.PoolClient, sql: string, valores: unknown[]): Promise<string> {
  const { rows } = await cliente.query<{ id: string }>(sql, valores);
  const id = rows[0]?.id;
  if (!id) throw new Error(`La carga no obtuvo id para: ${sql.slice(0, 70)}`);
  return id;
}

export async function cargarPlan(
  pool: pg.Pool,
  plan: Plan,
  op: OpcionesCarga,
): Promise<ResumenCarga> {
  const cliente = await pool.connect();
  const resumen: ResumenCarga = {
    commit: false,
    clientes: 0,
    destinos: 0,
    transportadoras: 0,
    tarifas: 0,
    asociados: 0,
    vehiculos: 0,
    conductores: 0,
    documentos: 0,
    habilitaciones: 0,
    posiciones: 0,
    usuarios: 0,
    requerimientos: 0,
    trs: 0,
    viajes: 0,
    recaudos: 0,
  };
  try {
    await cliente.query('begin');

    // Catálogos: se resuelven por llave de negocio (pueden venir de 0010_datos_base o de la semilla).
    const idCliente = new Map<string, string>();
    for (const c of plan.clientes) {
      idCliente.set(
        c.codigo,
        await idPor(
          cliente,
          `insert into clientes (codigo, nombre, requiere_habilitacion) values ($1, $2, $3)
           on conflict (codigo) do update set nombre = excluded.nombre returning id`,
          [c.codigo, c.nombre, c.requiereHabilitacion],
        ),
      );
      resumen.clientes += 1;
    }
    const idTipoDocumento = new Map<string, string>();
    for (const t of plan.tiposDocumento) {
      idTipoDocumento.set(
        t.codigo,
        await idPor(
          cliente,
          `insert into tipos_documento (codigo, nombre, aplica_a, bloqueante, dias_alerta)
           values ($1, $2, 'vehiculo', $3, 30)
           on conflict (codigo) do update set nombre = excluded.nombre returning id`,
          [t.codigo, t.nombre, t.bloqueante],
        ),
      );
    }
    const idDestino = new Map<string, string>();
    for (const d of plan.destinos) {
      idDestino.set(
        d.nombre,
        await idPor(
          cliente,
          `insert into destinos (id, nombre, km, activo) values ($1, $2, $3, true)
           on conflict (nombre) do update set km = coalesce(excluded.km, destinos.km) returning id`,
          [ID.destino(d.nombre), d.nombre, d.km],
        ),
      );
      resumen.destinos += 1;
    }
    const idTransportadora = new Map<string, string>();
    for (const nombre of plan.transportadoras) {
      idTransportadora.set(
        nombre,
        await idPor(
          cliente,
          `insert into transportadoras (id, nombre, activo) values ($1, $2, true)
           on conflict (nombre) do update set activo = true returning id`,
          [ID.transportadora(nombre), nombre],
        ),
      );
      resumen.transportadoras += 1;
    }
    for (const t of plan.tarifas) {
      await cliente.query(
        `insert into tarifas (id, cliente_id, origen, destino_id, clase, modalidad, valor, vigencia_desde)
         values ($1, $2, 'VILLAVICENCIO', $3, $4, $5, $6, $7::date)
         on conflict (cliente_id, destino_id, clase, modalidad, vigencia_desde) do update set valor = excluded.valor`,
        [
          ID.tarifa(t),
          idCliente.get(t.cliente),
          idDestino.get(t.destino),
          t.clase,
          t.modalidad,
          t.valor,
          t.vigenciaDesde,
        ],
      );
      resumen.tarifas += 1;
    }

    // Maestros de gente y flota (spec §6.2).
    for (const a of plan.asociados) {
      await cliente.query(
        `insert into asociados
           (id, tipo, nombres, razon_social, documento, documento_tipo, celular, correo, direccion, cuenta_bancaria_enc, estado, fecha_afiliacion)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'activo', $11::date)
         on conflict (documento) do update set
           tipo = excluded.tipo, nombres = excluded.nombres, razon_social = excluded.razon_social,
           celular = coalesce(excluded.celular, asociados.celular),
           correo = coalesce(excluded.correo, asociados.correo),
           direccion = coalesce(excluded.direccion, asociados.direccion),
           cuenta_bancaria_enc = coalesce(excluded.cuenta_bancaria_enc, asociados.cuenta_bancaria_enc),
           fecha_afiliacion = coalesce(excluded.fecha_afiliacion, asociados.fecha_afiliacion),
           updated_at = now()`,
        [
          ID.asociado(a.documento),
          a.tipo,
          a.tipo === 'persona' ? a.nombres : null,
          a.tipo === 'empresa' ? a.nombres : null,
          a.documento,
          a.documentoTipo,
          a.celular,
          a.correo,
          a.direccion,
          a.cuentaBancaria ? cifrar(a.cuentaBancaria, op.claveCifrado) : null,
          a.fechaAfiliacion,
        ],
      );
      resumen.asociados += 1;
    }
    for (const v of plan.vehiculos) {
      await cliente.query(
        `insert into vehiculos
           (id, placa, clase, clase_cola, tipo_carroceria, modelo, repotenciacion, largo_mts, km_recorrido,
            asociado_id, propietario_nombre, propietario_documento, parentesco, trailer_placa, gps_proveedor,
            estado, no_elegible_hasta)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::timestamptz)
         on conflict (placa) do update set
           clase = excluded.clase, clase_cola = excluded.clase_cola,
           tipo_carroceria = coalesce(excluded.tipo_carroceria, vehiculos.tipo_carroceria),
           modelo = coalesce(excluded.modelo, vehiculos.modelo),
           repotenciacion = coalesce(excluded.repotenciacion, vehiculos.repotenciacion),
           largo_mts = coalesce(excluded.largo_mts, vehiculos.largo_mts),
           km_recorrido = coalesce(excluded.km_recorrido, vehiculos.km_recorrido),
           asociado_id = excluded.asociado_id,
           propietario_nombre = coalesce(excluded.propietario_nombre, vehiculos.propietario_nombre),
           propietario_documento = coalesce(excluded.propietario_documento, vehiculos.propietario_documento),
           parentesco = coalesce(excluded.parentesco, vehiculos.parentesco),
           trailer_placa = coalesce(excluded.trailer_placa, vehiculos.trailer_placa),
           gps_proveedor = coalesce(excluded.gps_proveedor, vehiculos.gps_proveedor),
           estado = excluded.estado, no_elegible_hasta = excluded.no_elegible_hasta, updated_at = now()`,
        [
          ID.vehiculo(v.placa),
          v.placa,
          v.clase,
          v.claseCola,
          v.tipoCarroceria,
          v.modelo,
          v.repotenciacion,
          v.largoMts,
          v.kmRecorrido,
          v.asociadoDocumento ? ID.asociado(v.asociadoDocumento) : null,
          v.propietarioNombre,
          v.propietarioDocumento,
          v.parentesco,
          v.trailerPlaca,
          v.gpsProveedor,
          v.estado,
          v.noElegibleHasta,
        ],
      );
      resumen.vehiculos += 1;
    }
    for (const c of plan.conductores) {
      await cliente.query(
        `insert into conductores (id, nombres, documento, celular, correo, asociado_id)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (documento) do update set
           nombres = excluded.nombres,
           celular = coalesce(excluded.celular, conductores.celular),
           correo = coalesce(excluded.correo, conductores.correo),
           asociado_id = coalesce(excluded.asociado_id, conductores.asociado_id), updated_at = now()`,
        [
          ID.conductor(c.documento),
          c.nombres,
          c.documento,
          c.celular,
          c.correo,
          c.asociadoDocumento ? ID.asociado(c.asociadoDocumento) : null,
        ],
      );
      resumen.conductores += 1;
    }
    for (const vc of plan.vehiculoConductores) {
      await cliente.query(
        `insert into vehiculo_conductores (vehiculo_id, conductor_id, es_principal) values ($1, $2, $3)
         on conflict do nothing`,
        [ID.vehiculo(vc.placa), ID.conductor(vc.conductorDocumento), vc.esPrincipal],
      );
    }

    // HSEQ (spec §6.3): documentos con vencimiento y habilitaciones con el snapshot del TURNERO.
    for (const d of plan.documentos) {
      await cliente.query(
        `insert into documentos (id, sujeto_tipo, sujeto_id, tipo_id, vence_en)
         values ($1, 'vehiculo', $2, $3, $4::date)
         on conflict (id) do update set vence_en = excluded.vence_en, deleted_at = null, updated_at = now()`,
        [
          ID.documento(d.placa, d.tipo),
          ID.vehiculo(d.placa),
          idTipoDocumento.get(d.tipo),
          d.venceEn,
        ],
      );
      resumen.documentos += 1;
    }
    await cliente.query('select documentos_recalcular_estado($1::date)', [
      op.ahora.toISOString().slice(0, 10),
    ]);
    for (const h of plan.habilitaciones) {
      await cliente.query(
        `insert into habilitaciones (id, vehiculo_id, cliente_id, apto, motivo_bloqueo, requisitos)
         values ($1, $2, $3, $4, $5, $6::jsonb)
         on conflict (vehiculo_id, cliente_id) do update set
           apto = excluded.apto, motivo_bloqueo = excluded.motivo_bloqueo,
           requisitos = excluded.requisitos, updated_at = now()`,
        [
          ID.habilitacion(h.placa, h.cliente),
          ID.vehiculo(h.placa),
          idCliente.get(h.cliente),
          h.apto,
          h.motivoBloqueo,
          JSON.stringify(h.requisitos),
        ],
      );
      resumen.habilitaciones += 1;
    }

    // Usuarios: internos de la semilla (misma contraseña de desarrollo) y un member por asociado con correo.
    const idSistema = uuidSemilla(ID_USUARIO_SISTEMA);
    const semilla = crearSeed(op.ahora, op.claveCifrado);
    for (const u of semilla.usuarios.filter((x) => x.rol !== 'member')) {
      await cliente.query(
        `insert into usuarios (id, email, nombre, rol, password_hash, totp_secret_enc, activo)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (email) do update set
           nombre = excluded.nombre, rol = excluded.rol, activo = excluded.activo, updated_at = now()`,
        [uuidSemilla(u.id), u.email, u.nombre, u.rol, u.passwordHash, u.totpSecretEnc, u.activo],
      );
      resumen.usuarios += 1;
    }
    for (const u of plan.usuariosMember) {
      const id = ID.usuarioMember(u.email);
      await cliente.query(
        `insert into usuarios (id, email, nombre, rol, password_hash, totp_secret_enc, activo, asociado_id)
         values ($1, $2, $3, 'member', null, null, true, $4)
         on conflict (email) do update set
           nombre = excluded.nombre, asociado_id = excluded.asociado_id, updated_at = now()`,
        [id, u.email, u.nombre, ID.asociado(u.asociadoDocumento)],
      );
      await cliente.query('delete from usuario_vehiculos where usuario_id = $1', [id]);
      for (const placa of u.placas) {
        await cliente.query(
          'insert into usuario_vehiculos (usuario_id, vehiculo_id) values ($1, $2) on conflict do nothing',
          [id, ID.vehiculo(placa)],
        );
      }
      resumen.usuarios += 1;
    }

    // Cola (spec §7.1): se reemplaza entera por clase para garantizar posiciones 1..N densas.
    const clases = [...new Set(plan.posiciones.map((p) => p.claseCola))];
    for (const claseCola of clases) {
      await cliente.query('delete from cola_posiciones where clase_cola = $1', [claseCola]);
    }
    for (const p of plan.posiciones) {
      await cliente.query(
        `insert into cola_posiciones
           (id, clase_cola, vehiculo_id, posicion, ciclo, turnos_ofrecidos, turnos_tomados, saltos_pendientes, version)
         values ($1, $2, $3, $4, 1, $5, $5, 0, 1)`,
        [ID.posicion(p.placa), p.claseCola, ID.vehiculo(p.placa), p.posicion, p.turnosTomados],
      );
      resumen.posiciones += 1;
    }

    // Historial de viajes (spec §13.1.6): requerimiento + TR sintético + viaje + recaudo.
    for (const v of plan.viajes) {
      const idReq = ID.requerimiento(v.codigoTr);
      const idTr = ID.tr(v.codigoTr);
      const idViaje = ID.viaje(v.codigoTr);
      const nota = `Legado ${v.hoja} fila ${v.fila}${v.modalidad ? ` · modalidad ${v.modalidad}` : ''}`;
      await cliente.query(
        `insert into requerimientos
           (id, cliente_id, destino_id, clase_cola, fecha_servicio, cantidad_cupos, observaciones, estado, creado_por)
         values ($1, $2, $3, $4, $5::date, 1, $6, 'cerrado', $7)
         on conflict (id) do update set
           cliente_id = excluded.cliente_id, destino_id = excluded.destino_id,
           fecha_servicio = excluded.fecha_servicio, observaciones = excluded.observaciones, updated_at = now()`,
        [
          idReq,
          idCliente.get(v.cliente),
          v.destino ? idDestino.get(v.destino) : null,
          v.claseCola,
          v.fechaServicio,
          nota,
          idSistema,
        ],
      );
      resumen.requerimientos += 1;
      await cliente.query(
        `insert into trs (id, codigo, requerimiento_id, vehiculo_id, clase_cola, cliente_id, destino_id, fecha_asignacion, estado)
         values ($1, $2, $3, $4, $5, $6, $7, $8::date, 'cumplido')
         on conflict (codigo) do update set
           vehiculo_id = excluded.vehiculo_id, cliente_id = excluded.cliente_id,
           destino_id = excluded.destino_id, fecha_asignacion = excluded.fecha_asignacion, updated_at = now()`,
        [
          idTr,
          v.codigoTr,
          idReq,
          ID.vehiculo(v.placa),
          v.claseCola,
          idCliente.get(v.cliente),
          v.destino ? idDestino.get(v.destino) : null,
          v.fechaServicio,
        ],
      );
      resumen.trs += 1;
      await cliente.query(
        `insert into viajes
           (id, tr_id, vehiculo_id, fecha_cargue, fecha_descargue, lugar_descargue, transportadora_id,
            flete, porcentaje_aplicado, valor_recaudo, valor_pagado, estado, notas)
         values ($1, $2, $3, $4::date, $5::date, $6, $7, $8, $9, $10, $11, $12, $13)
         on conflict (tr_id) do update set
           fecha_cargue = excluded.fecha_cargue, fecha_descargue = excluded.fecha_descargue,
           lugar_descargue = excluded.lugar_descargue, transportadora_id = excluded.transportadora_id,
           flete = excluded.flete, porcentaje_aplicado = excluded.porcentaje_aplicado,
           valor_recaudo = excluded.valor_recaudo, valor_pagado = excluded.valor_pagado,
           estado = excluded.estado, notas = excluded.notas, updated_at = now()`,
        [
          idViaje,
          idTr,
          ID.vehiculo(v.placa),
          v.fechaCargue,
          v.fechaDescargue,
          v.lugarDescargue,
          v.transportadora ? idTransportadora.get(v.transportadora) : null,
          v.flete,
          v.flete === null ? null : v.porcentajeAplicado,
          v.valorRecaudo,
          v.valorPagado,
          v.estadoViaje,
          nota,
        ],
      );
      resumen.viajes += 1;
      if (v.valorRecaudo !== null && v.asociadoDocumento && v.estadoRecaudo) {
        await cliente.query(
          `insert into recaudos (id, viaje_id, asociado_id, valor, estado, fecha_pago, referencia)
           values ($1, $2, $3, $4, $5, $6::date, $7)
           on conflict (id) do update set
             valor = excluded.valor, estado = excluded.estado,
             fecha_pago = excluded.fecha_pago, referencia = excluded.referencia`,
          [
            ID.recaudo(v.codigoTr),
            idViaje,
            ID.asociado(v.asociadoDocumento),
            v.valorRecaudo,
            v.estadoRecaudo,
            v.fechaPago,
            v.referenciaPago,
          ],
        );
        resumen.recaudos += 1;
      }
    }

    // Rastro (RULE-011): una entrada de auditoría por carga, con los conteos.
    await cliente.query(
      `insert into audit_log (actor_id, actor_rol, accion, entidad, entidad_id, after)
       values ($1, 'sistema', 'migracion.excel', 'legado', $2, $3::jsonb)`,
      [
        idSistema,
        plan.fechaFoto,
        JSON.stringify({ ...resumen, excepciones: plan.excepciones.length }),
      ],
    );

    if (op.dryRun) {
      await cliente.query('rollback');
    } else {
      await cliente.query('commit');
      resumen.commit = true;
    }
    return resumen;
  } catch (error) {
    await cliente.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    cliente.release();
  }
}
