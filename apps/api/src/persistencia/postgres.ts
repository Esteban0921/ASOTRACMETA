import type pg from 'pg';
import {
  ErrorDominio,
  type Asociado,
  type Cliente,
  type ColaPosicion,
  type Descarte,
  type Documento,
  type Habilitacion,
  type MotivoDeclinacion,
  type NuevaNotificacion,
  type NuevoEventoAuditoria,
  type Oferta,
  type Requerimiento,
  type Tr,
  type Transaccion,
  type UnidadDeTrabajo,
  type Vehiculo,
} from '@asotracmet/domain';
import {
  ESTADOS_TR_ACTIVOS,
  ESTADOS_TR_VIGENTES,
  ParametrosSchema,
  type ClaseCola,
  type Parametros,
} from '@asotracmet/shared';
import { contextoActual } from './contexto.js';

// Adaptador Postgres de los puertos del dominio (TASK-0019).
// Una transacción por acción de dominio: lock de clase, RLS por settings y audit en la misma tx.

/** `lock_not_available`: otra transacción tiene la cola. */
const PG_LOCK_NO_DISPONIBLE = '55P03';
const PG_UNICIDAD = '23505';

type Fila = Record<string, unknown>;

function texto(valor: unknown): string {
  return String(valor);
}

function textoONulo(valor: unknown): string | null {
  return valor === null || valor === undefined ? null : String(valor);
}

function instante(valor: unknown): string {
  if (valor instanceof Date) return valor.toISOString();
  return new Date(String(valor)).toISOString();
}

function instanteONulo(valor: unknown): string | null {
  return valor === null || valor === undefined ? null : instante(valor);
}

function entero(valor: unknown): number {
  return Number(valor);
}

function aVehiculo(f: Fila): Vehiculo {
  return {
    id: texto(f.id),
    placa: texto(f.placa),
    clase: texto(f.clase) as Vehiculo['clase'],
    claseCola: texto(f.clase_cola) as ClaseCola,
    asociadoId: texto(f.asociado_id),
    estado: texto(f.estado) as Vehiculo['estado'],
    noElegibleHasta: instanteONulo(f.no_elegible_hasta),
  };
}

function aAsociado(f: Fila): Asociado {
  return {
    id: texto(f.id),
    tipo: texto(f.tipo) as Asociado['tipo'],
    documento: texto(f.documento),
    nombres: textoONulo(f.nombres) ?? '',
    apellidos: textoONulo(f.apellidos),
    razonSocial: textoONulo(f.razon_social),
    celular: textoONulo(f.celular),
    correo: textoONulo(f.correo),
  };
}

function aPosicion(f: Fila): ColaPosicion {
  return {
    id: texto(f.id),
    claseCola: texto(f.clase_cola) as ClaseCola,
    vehiculoId: texto(f.vehiculo_id),
    posicion: entero(f.posicion),
    ciclo: entero(f.ciclo),
    turnosOfrecidos: entero(f.turnos_ofrecidos),
    turnosTomados: entero(f.turnos_tomados),
    saltosPendientes: entero(f.saltos_pendientes),
    version: entero(f.version),
  };
}

function aRequerimiento(f: Fila): Requerimiento {
  return {
    id: texto(f.id),
    clienteId: texto(f.cliente_id),
    destinoId: textoONulo(f.destino_id),
    claseCola: texto(f.clase_cola) as ClaseCola,
    fechaServicio: texto(f.fecha_servicio),
    cantidadCupos: entero(f.cantidad_cupos),
    observaciones: textoONulo(f.observaciones),
    estado: texto(f.estado) as Requerimiento['estado'],
    creadoPor: texto(f.creado_por),
    creadoEn: instante(f.created_at),
  };
}

function aOferta(f: Fila): Oferta {
  return {
    id: texto(f.id),
    requerimientoId: texto(f.requerimiento_id),
    vehiculoId: texto(f.vehiculo_id),
    asociadoId: texto(f.asociado_id),
    ofrecidaPor: texto(f.ofrecida_por),
    ofrecidaEn: instante(f.ofrecida_en),
    expiraEn: instante(f.expira_en),
    estado: texto(f.estado) as Oferta['estado'],
    motivoDeclinacionId: textoONulo(f.motivo_declinacion_id),
    nota: textoONulo(f.nota),
    respondidaEn: instanteONulo(f.respondida_en),
    respondidaPor: textoONulo(f.respondida_por),
  };
}

function aTr(f: Fila): Tr {
  return {
    id: texto(f.id),
    codigo: texto(f.codigo),
    ofertaId: textoONulo(f.oferta_id),
    requerimientoId: texto(f.requerimiento_id),
    vehiculoId: texto(f.vehiculo_id),
    claseCola: texto(f.clase_cola) as ClaseCola,
    clienteId: texto(f.cliente_id),
    destinoId: textoONulo(f.destino_id),
    fechaAsignacion: texto(f.fecha_asignacion),
    estado: texto(f.estado) as Tr['estado'],
    canceladoEn: instanteONulo(f.cancelado_en),
    canceladoPor: textoONulo(f.cancelado_por),
    motivoCancelacion: textoONulo(f.motivo_cancelacion),
    version: entero(f.version),
  };
}

/** Traduce errores de Postgres a códigos estables del dominio (spec §8.6). */
export function traducirErrorPg(error: unknown): unknown {
  const pgError = error as { code?: string; constraint?: string; message?: string };
  if (pgError?.code === PG_LOCK_NO_DISPONIBLE) {
    return new ErrorDominio('COLA_LOCKED', 'La cola está bloqueada por otra operación');
  }
  if (pgError?.code === PG_UNICIDAD && pgError.constraint?.includes('trs_codigo')) {
    return new ErrorDominio('TR_DUPLICADO', 'El código TR ya existe');
  }
  if (pgError?.code === PG_UNICIDAD && pgError.constraint === 'ofertas_una_abierta_por_vehiculo') {
    return new ErrorDominio('OFERTA_ABIERTA_PREVIA', 'La placa ya tiene una oferta abierta');
  }
  if (pgError?.code === PG_UNICIDAD) {
    const restriccion = pgError.constraint ?? '';
    if (restriccion.startsWith('vehiculos_placa')) {
      return new ErrorDominio('PLACA_EN_USO', 'Ya existe un vehículo con esa placa');
    }
    if (
      restriccion.startsWith('asociados_documento') ||
      restriccion.startsWith('conductores_documento')
    ) {
      return new ErrorDominio('DOCUMENTO_EN_USO', 'Ya existe un registro con ese documento');
    }
    if (restriccion.startsWith('tarifas_')) {
      return new ErrorDominio('TARIFA_DUPLICADA', 'Ya existe esa tarifa con la misma vigencia');
    }
    if (
      restriccion.startsWith('clientes_codigo') ||
      restriccion.startsWith('destinos_nombre') ||
      restriccion.startsWith('transportadoras_nombre')
    ) {
      return new ErrorDominio('CATALOGO_EN_USO', 'Ya existe un registro con ese código o nombre');
    }
  }
  return error;
}

/** Transacción de escritura con el rol real del actor (los maestros no pasan por el motor). */
export async function enEscrituraPg<T>(
  pool: pg.Pool,
  fn: (cliente: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const contexto = contextoActual();
  const cliente = await pool.connect();
  try {
    await cliente.query('begin');
    await cliente.query('set local role asotracmet_app');
    await cliente.query(
      `select set_config('app.rol', $1, true), set_config('app.vehiculo_ids', $2, true),
              set_config('app.usuario_id', $3, true)`,
      [contexto.rol, contexto.vehiculoIds.join(','), contexto.usuarioId ?? ''],
    );
    const resultado = await fn(cliente);
    await cliente.query('commit');
    return resultado;
  } catch (error) {
    await cliente.query('rollback').catch(() => undefined);
    throw traducirErrorPg(error);
  } finally {
    cliente.release();
  }
}

/**
 * Transacción de solo lectura con el rol real del actor. La usan tanto el puerto del dominio
 * como el puerto de consultas de la API, para que RLS se aplique igual en ambos caminos.
 */
export async function enLecturaPg<T>(
  pool: pg.Pool,
  fn: (cliente: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const contexto = contextoActual();
  const cliente = await pool.connect();
  try {
    await cliente.query('begin read only');
    await cliente.query('set local role asotracmet_app');
    await cliente.query(
      `select set_config('app.rol', $1, true), set_config('app.vehiculo_ids', $2, true),
              set_config('app.usuario_id', $3, true)`,
      [contexto.rol, contexto.vehiculoIds.join(','), contexto.usuarioId ?? ''],
    );
    const resultado = await fn(cliente);
    await cliente.query('commit');
    return resultado;
  } catch (error) {
    await cliente.query('rollback').catch(() => undefined);
    throw traducirErrorPg(error);
  } finally {
    cliente.release();
  }
}

export class AlmacenPostgres implements UnidadDeTrabajo {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Transacción de escritura. Toma el lock de la clase sin esperar (§7.7) y opera con el rol de
   * servicio `sistema`: rotar la cola actualiza filas de otras placas, que un `member` no puede
   * tocar (ADR-0005). El scope `own` lo garantiza el motor antes de escribir.
   */
  async ejecutar<T>(claseCola: ClaseCola | null, fn: (tx: Transaccion) => Promise<T>): Promise<T> {
    return this.enTransaccion('sistema', false, async (cliente) => {
      if (claseCola) {
        // Advisory lock: funciona incluso con la clase vacía, y se libera solo al terminar la tx.
        const { rows } = await cliente.query<{ tomado: boolean }>(
          'select pg_try_advisory_xact_lock(hashtext($1)) as tomado',
          [`cola:${claseCola}`],
        );
        if (rows[0]?.tomado !== true) {
          throw new ErrorDominio('COLA_LOCKED', `Cola ${claseCola} bloqueada por otra operación`, {
            claseCola,
          });
        }
        await cliente.query(
          'select 1 from cola_posiciones where clase_cola = $1 for update nowait',
          [claseCola],
        );
      }
      return fn(new TransaccionPostgres(cliente));
    });
  }

  /** Lectura con el rol real del actor: aquí RLS es la última defensa contra ver placas ajenas. */
  async leer<T>(fn: (tx: Transaccion) => Promise<T>): Promise<T> {
    return enLecturaPg(this.pool, async (cliente) => fn(new TransaccionPostgres(cliente)));
  }

  async cerrar(): Promise<void> {
    await this.pool.end();
  }

  private async enTransaccion<T>(
    rol: string,
    soloLectura: boolean,
    fn: (cliente: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query(soloLectura ? 'begin read only' : 'begin');
      // Sin SET ROLE el owner de las tablas se saltaría RLS (ADR-0004).
      await cliente.query('set local role asotracmet_app');
      await cliente.query(
        "select set_config('app.rol', $1, true), set_config('app.vehiculo_ids', $2, true)",
        [rol, contextoActual().vehiculoIds.join(',')],
      );
      const resultado = await fn(cliente);
      await cliente.query('commit');
      return resultado;
    } catch (error) {
      await cliente.query('rollback').catch(() => undefined);
      throw traducirErrorPg(error);
    } finally {
      cliente.release();
    }
  }
}

class TransaccionPostgres implements Transaccion {
  constructor(private readonly conexion: pg.PoolClient) {}

  private async uno(sql: string, valores: unknown[] = []): Promise<Fila | undefined> {
    const { rows } = await this.conexion.query<Fila>(sql, valores);
    return rows[0];
  }

  private async muchos(sql: string, valores: unknown[] = []): Promise<Fila[]> {
    const { rows } = await this.conexion.query<Fila>(sql, valores);
    return rows;
  }

  async parametros(): Promise<Parametros> {
    const filas = await this.muchos('select key, value from parametros');
    const crudo = Object.fromEntries(filas.map((f) => [texto(f.key), f.value]));
    return ParametrosSchema.parse(crudo);
  }

  async guardarParametros(parametros: Parametros): Promise<void> {
    for (const [key, value] of Object.entries(parametros)) {
      await this.conexion.query(
        `insert into parametros (key, value, updated_at) values ($1, $2::jsonb, now())
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [key, JSON.stringify(value)],
      );
    }
  }

  async cliente(id: string): Promise<Cliente | undefined> {
    const f = await this.uno('select * from clientes where id = $1', [id]);
    return f
      ? {
          id: texto(f.id),
          codigo: texto(f.codigo),
          nombre: texto(f.nombre),
          requiereHabilitacion: f.requiere_habilitacion === true,
        }
      : undefined;
  }

  async asociado(id: string): Promise<Asociado | undefined> {
    const f = await this.uno('select * from asociados where id = $1', [id]);
    return f ? aAsociado(f) : undefined;
  }

  async motivoDeclinacion(id: string): Promise<MotivoDeclinacion | undefined> {
    const f = await this.uno('select * from motivos_declinacion where id = $1', [id]);
    return f
      ? {
          id: texto(f.id),
          codigo: texto(f.codigo),
          nombre: texto(f.nombre),
          activo: f.activo === true,
        }
      : undefined;
  }

  async vehiculo(id: string): Promise<Vehiculo | undefined> {
    const f = await this.uno('select * from vehiculos where id = $1 and deleted_at is null', [id]);
    return f ? aVehiculo(f) : undefined;
  }

  async guardarVehiculo(vehiculo: Vehiculo): Promise<void> {
    await this.conexion.query(
      `update vehiculos set estado = $2, no_elegible_hasta = $3, updated_at = now() where id = $1`,
      [vehiculo.id, vehiculo.estado, vehiculo.noElegibleHasta],
    );
  }

  async vehiculosDeClase(claseCola: ClaseCola): Promise<Vehiculo[]> {
    const filas = await this.muchos(
      'select * from vehiculos where clase_cola = $1 and deleted_at is null order by placa',
      [claseCola],
    );
    return filas.map(aVehiculo);
  }

  async habilitacion(vehiculoId: string, clienteId: string): Promise<Habilitacion | undefined> {
    const f = await this.uno(
      'select * from habilitaciones where vehiculo_id = $1 and cliente_id = $2',
      [vehiculoId, clienteId],
    );
    return f
      ? {
          vehiculoId: texto(f.vehiculo_id),
          clienteId: texto(f.cliente_id),
          apto: f.apto === true,
          motivoBloqueo: textoONulo(f.motivo_bloqueo),
        }
      : undefined;
  }

  async documentosBloqueantesVencidos(vehiculoId: string, hoy: string): Promise<Documento[]> {
    const filas = await this.muchos(
      `select d.id, d.sujeto_tipo, d.sujeto_id, d.vence_en::text as vence_en, t.codigo, t.bloqueante
         from documentos d join tipos_documento t on t.id = d.tipo_id
        where d.sujeto_tipo = 'vehiculo' and d.sujeto_id = $1 and d.deleted_at is null
          and t.bloqueante and d.vence_en is not null and d.vence_en < $2::date`,
      [vehiculoId, hoy],
    );
    return filas.map((f) => ({
      id: texto(f.id),
      sujetoTipo: 'vehiculo',
      sujetoId: texto(f.sujeto_id),
      tipoCodigo: texto(f.codigo),
      venceEn: texto(f.vence_en),
      bloqueante: true,
    }));
  }

  async posiciones(claseCola: ClaseCola): Promise<ColaPosicion[]> {
    const filas = await this.muchos(
      'select * from cola_posiciones where clase_cola = $1 order by posicion asc',
      [claseCola],
    );
    return filas.map(aPosicion);
  }

  async guardarPosiciones(claseCola: ClaseCola, posiciones: ColaPosicion[]): Promise<void> {
    for (const p of posiciones) {
      await this.conexion.query(
        `insert into cola_posiciones
           (id, clase_cola, vehiculo_id, posicion, ciclo, turnos_ofrecidos, turnos_tomados, saltos_pendientes, version, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
         on conflict (id) do update set
           posicion = excluded.posicion,
           ciclo = excluded.ciclo,
           turnos_ofrecidos = excluded.turnos_ofrecidos,
           turnos_tomados = excluded.turnos_tomados,
           saltos_pendientes = excluded.saltos_pendientes,
           version = excluded.version,
           updated_at = now()`,
        [
          p.id,
          p.claseCola,
          p.vehiculoId,
          p.posicion,
          p.ciclo,
          p.turnosOfrecidos,
          p.turnosTomados,
          p.saltosPendientes,
          p.version,
        ],
      );
    }
    await this.conexion.query(
      'delete from cola_posiciones where clase_cola = $1 and not (id = any($2::uuid[]))',
      [claseCola, posiciones.map((p) => p.id)],
    );
  }

  async requerimiento(id: string): Promise<Requerimiento | undefined> {
    const f = await this.uno(
      'select *, fecha_servicio::text as fecha_servicio from requerimientos where id = $1',
      [id],
    );
    return f ? aRequerimiento(f) : undefined;
  }

  async guardarRequerimiento(requerimiento: Requerimiento): Promise<void> {
    await this.conexion.query(
      `insert into requerimientos
         (id, cliente_id, destino_id, clase_cola, fecha_servicio, cantidad_cupos, observaciones, estado, creado_por, created_at)
       values ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10)
       on conflict (id) do update set
         destino_id = excluded.destino_id,
         cantidad_cupos = excluded.cantidad_cupos,
         observaciones = excluded.observaciones,
         estado = excluded.estado,
         updated_at = now()`,
      [
        requerimiento.id,
        requerimiento.clienteId,
        requerimiento.destinoId,
        requerimiento.claseCola,
        requerimiento.fechaServicio,
        requerimiento.cantidadCupos,
        requerimiento.observaciones,
        requerimiento.estado,
        requerimiento.creadoPor,
        requerimiento.creadoEn,
      ],
    );
  }

  async oferta(id: string): Promise<Oferta | undefined> {
    const f = await this.uno('select * from ofertas where id = $1', [id]);
    return f ? aOferta(f) : undefined;
  }

  async guardarOferta(oferta: Oferta): Promise<void> {
    await this.conexion.query(
      `insert into ofertas
         (id, requerimiento_id, vehiculo_id, asociado_id, ofrecida_por, ofrecida_en, expira_en,
          estado, motivo_declinacion_id, nota, respondida_en, respondida_por)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       on conflict (id) do update set
         estado = excluded.estado,
         motivo_declinacion_id = excluded.motivo_declinacion_id,
         nota = excluded.nota,
         respondida_en = excluded.respondida_en,
         respondida_por = excluded.respondida_por,
         expira_en = excluded.expira_en`,
      [
        oferta.id,
        oferta.requerimientoId,
        oferta.vehiculoId,
        oferta.asociadoId,
        oferta.ofrecidaPor,
        oferta.ofrecidaEn,
        oferta.expiraEn,
        oferta.estado,
        oferta.motivoDeclinacionId,
        oferta.nota,
        oferta.respondidaEn,
        oferta.respondidaPor,
      ],
    );
  }

  async ofertasAbiertasDeVehiculo(vehiculoId: string): Promise<Oferta[]> {
    const filas = await this.muchos(
      "select * from ofertas where vehiculo_id = $1 and estado = 'abierta'",
      [vehiculoId],
    );
    return filas.map(aOferta);
  }

  async ofertasAbiertasDeRequerimiento(requerimientoId: string): Promise<Oferta[]> {
    const filas = await this.muchos(
      "select * from ofertas where requerimiento_id = $1 and estado = 'abierta'",
      [requerimientoId],
    );
    return filas.map(aOferta);
  }

  async ofertasAbiertasVencidas(ahora: string): Promise<Oferta[]> {
    const filas = await this.muchos(
      "select * from ofertas where estado = 'abierta' and expira_en <= $1::timestamptz",
      [ahora],
    );
    return filas.map(aOferta);
  }

  /**
   * Acta de turno (brief §5, spec §21): una fila por placa saltada, en la misma transacción que
   * la oferta. `on conflict do nothing` la hace idempotente por (oferta, placa); la tabla es
   * append-only por trigger, así que nunca se reescribe.
   */
  async guardarSaltos(ofertaId: string, descartes: readonly Descarte[]): Promise<void> {
    if (descartes.length === 0) return;
    await this.conexion.query(
      `insert into oferta_saltos (oferta_id, vehiculo_id, posicion, motivo, detalle)
       select $1::uuid, x.vehiculo_id, x.posicion, x.motivo, x.detalle
         from unnest($2::uuid[], $3::int[], $4::text[], $5::text[])
              as x (vehiculo_id, posicion, motivo, detalle)
       on conflict (oferta_id, vehiculo_id) do nothing`,
      [
        ofertaId,
        descartes.map((d) => d.vehiculoId),
        descartes.map((d) => d.posicion),
        descartes.map((d) => d.motivo),
        descartes.map((d) => d.detalle),
      ],
    );
  }

  async tr(id: string): Promise<Tr | undefined> {
    const f = await this.uno(
      'select *, fecha_asignacion::text as fecha_asignacion from trs where id = $1',
      [id],
    );
    return f ? aTr(f) : undefined;
  }

  async guardarTr(tr: Tr): Promise<void> {
    await this.conexion.query(
      `insert into trs
         (id, codigo, oferta_id, requerimiento_id, vehiculo_id, clase_cola, cliente_id, destino_id,
          fecha_asignacion, estado, cancelado_en, cancelado_por, motivo_cancelacion, version)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10, $11, $12, $13, $14)
       on conflict (id) do update set
         estado = excluded.estado,
         cancelado_en = excluded.cancelado_en,
         cancelado_por = excluded.cancelado_por,
         motivo_cancelacion = excluded.motivo_cancelacion,
         version = excluded.version,
         updated_at = now()`,
      [
        tr.id,
        tr.codigo,
        tr.ofertaId,
        tr.requerimientoId,
        tr.vehiculoId,
        tr.claseCola,
        tr.clienteId,
        tr.destinoId,
        tr.fechaAsignacion,
        tr.estado,
        tr.canceladoEn,
        tr.canceladoPor,
        tr.motivoCancelacion,
        tr.version,
      ],
    );
  }

  async trsActivosDeVehiculo(vehiculoId: string): Promise<Tr[]> {
    const filas = await this.muchos(
      `select *, fecha_asignacion::text as fecha_asignacion from trs
        where vehiculo_id = $1 and estado = any($2::text[])`,
      [vehiculoId, [...ESTADOS_TR_ACTIVOS]],
    );
    return filas.map(aTr);
  }

  async trsVigentesDeRequerimiento(requerimientoId: string): Promise<Tr[]> {
    const filas = await this.muchos(
      `select *, fecha_asignacion::text as fecha_asignacion from trs
        where requerimiento_id = $1 and estado = any($2::text[])`,
      [requerimientoId, [...ESTADOS_TR_VIGENTES]],
    );
    return filas.map(aTr);
  }

  async siguienteCodigoTr(): Promise<string> {
    const f = await this.uno(
      `update parametros
          set value = jsonb_set(value, '{next}', to_jsonb((value->>'next')::bigint + 1)),
              updated_at = now()
        where key = 'secuencia_tr'
       returning value->>'prefix' as prefix, ((value->>'next')::bigint - 1) as usado`,
    );
    if (!f) throw new ErrorDominio('INTERNAL', 'Falta el parámetro secuencia_tr');
    const codigo = `${texto(f.prefix)}${texto(f.usado)}`;
    const existente = await this.uno('select 1 from trs where codigo = $1', [codigo]);
    if (existente) {
      throw new ErrorDominio('TR_DUPLICADO', `Secuencia TR desfasada: ${codigo} ya existe`, {
        codigo,
      });
    }
    return codigo;
  }

  async auditar(evento: NuevoEventoAuditoria): Promise<void> {
    await this.conexion.query(
      `insert into audit_log (actor_id, actor_rol, accion, entidad, entidad_id, before, after)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
      [
        evento.actorId,
        evento.actorRol,
        evento.accion,
        evento.entidad,
        evento.entidadId,
        evento.before === undefined ? null : JSON.stringify(evento.before),
        evento.after === undefined ? null : JSON.stringify(evento.after),
      ],
    );
  }

  /** Outbox (spec §11, ADR-0006): misma transacción que la mutación; `clave` deduplica. */
  async notificar(aviso: NuevaNotificacion): Promise<void> {
    await this.conexion.query(
      `insert into notificaciones_outbox (evento, destinos, datos, clave)
       values ($1, $2::jsonb, $3::jsonb, $4)
       on conflict (clave) do nothing`,
      [
        aviso.evento,
        JSON.stringify(aviso.destinos),
        JSON.stringify(aviso.datos),
        aviso.clave ?? null,
      ],
    );
  }
}
