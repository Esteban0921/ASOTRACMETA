import type pg from 'pg';
import type { EventoAuditoria, MotivoNoElegible } from '@asotracmet/domain';
import {
  ESTADOS_TR_VIGENTES,
  ParametrosSchema,
  enmascararDocumento,
  etiquetaAsociadoPlaca,
  type ClaseCola,
  type Parametros,
} from '@asotracmet/shared';
import { enLecturaPg } from '../persistencia/postgres.js';
import type {
  Consultas,
  FiltroAudit,
  FiltroOfertas,
  FiltroRequerimientos,
  FiltroTrs,
  MiPosicion,
  RangoFechas,
  VistaCliente,
  VistaDestino,
  VistaMotivo,
  VistaOferta,
  VistaRequerimiento,
  VistaSalto,
  VistaSaltoAgregado,
  VistaSaltoPropio,
  VistaTr,
  VistaVehiculo,
} from './tipos.js';

// Adaptador de lectura sobre Postgres (TASK-0038). Mismas vistas que el de memoria.
// Cada consulta corre en una transacción de solo lectura con el rol del actor, así que RLS aplica.

type Fila = Record<string, unknown>;

const NOMBRE_ASOCIADO = `coalesce(a.razon_social, nullif(trim(coalesce(a.nombres, '') || ' ' || coalesce(a.apellidos, '')), ''))`;

const SELECT_REQUERIMIENTO = `
  select r.id, r.cliente_id, r.destino_id, r.clase_cola,
         r.fecha_servicio::text as fecha_servicio, r.cantidad_cupos, r.observaciones,
         r.estado, r.creado_por, r.created_at,
         c.codigo as cliente, c.nombre as cliente_nombre, d.nombre as destino,
         (select count(*) from trs t
           where t.requerimiento_id = r.id and t.estado = any($vigentes::text[])) as cupos_asignados,
         (select count(*) from ofertas o
           where o.requerimiento_id = r.id and o.estado = 'abierta') as ofertas_abiertas
    from requerimientos r
    join clientes c on c.id = r.cliente_id
    left join destinos d on d.id = r.destino_id`;

function texto(valor: unknown): string {
  return String(valor);
}

function textoONulo(valor: unknown): string | null {
  return valor === null || valor === undefined ? null : String(valor);
}

function instante(valor: unknown): string {
  return valor instanceof Date ? valor.toISOString() : new Date(String(valor)).toISOString();
}

function instanteONulo(valor: unknown): string | null {
  return valor === null || valor === undefined ? null : instante(valor);
}

function aRequerimiento(f: Fila): VistaRequerimiento {
  const cupos = Number(f.cantidad_cupos);
  const asignados = Number(f.cupos_asignados);
  const abiertas = Number(f.ofertas_abiertas);
  return {
    id: texto(f.id),
    clienteId: texto(f.cliente_id),
    destinoId: textoONulo(f.destino_id),
    claseCola: texto(f.clase_cola) as ClaseCola,
    fechaServicio: texto(f.fecha_servicio),
    cantidadCupos: cupos,
    observaciones: textoONulo(f.observaciones),
    estado: texto(f.estado) as VistaRequerimiento['estado'],
    creadoPor: texto(f.creado_por),
    creadoEn: instante(f.created_at),
    cliente: textoONulo(f.cliente),
    clienteNombre: textoONulo(f.cliente_nombre),
    destino: textoONulo(f.destino),
    cuposAsignados: asignados,
    ofertasAbiertas: abiertas,
    cuposDisponibles: Math.max(cupos - asignados - abiertas, 0),
  };
}

function aOferta(f: Fila, requerimiento: VistaRequerimiento | null): VistaOferta {
  const placa = textoONulo(f.placa);
  const nombre = textoONulo(f.asociado_nombre);
  return {
    id: texto(f.id),
    requerimientoId: texto(f.requerimiento_id),
    vehiculoId: texto(f.vehiculo_id),
    asociadoId: texto(f.asociado_id),
    ofrecidaPor: texto(f.ofrecida_por),
    ofrecidaEn: instante(f.ofrecida_en),
    expiraEn: instante(f.expira_en),
    estado: texto(f.estado) as VistaOferta['estado'],
    motivoDeclinacionId: textoONulo(f.motivo_declinacion_id),
    nota: textoONulo(f.nota),
    respondidaEn: instanteONulo(f.respondida_en),
    respondidaPor: textoONulo(f.respondida_por),
    placa,
    claseCola: textoONulo(f.clase_cola) as ClaseCola | null,
    etiqueta: placa ? etiquetaAsociadoPlaca(nombre ?? 'ASOCIADO DESCONOCIDO', placa) : null,
    motivoDeclinacion: textoONulo(f.motivo_nombre),
    requerimiento,
  };
}

function aTr(f: Fila): VistaTr {
  const placa = textoONulo(f.placa);
  const nombre = textoONulo(f.asociado_nombre);
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
    estado: texto(f.estado) as VistaTr['estado'],
    canceladoEn: instanteONulo(f.cancelado_en),
    canceladoPor: textoONulo(f.cancelado_por),
    motivoCancelacion: textoONulo(f.motivo_cancelacion),
    placa,
    cliente: textoONulo(f.cliente),
    destino: textoONulo(f.destino),
    etiqueta: placa ? etiquetaAsociadoPlaca(nombre ?? 'ASOCIADO DESCONOCIDO', placa) : null,
  };
}

// Acta de turno (brief §5): un salto con la placa y la etiqueta del asociado de esa placa.
const SELECT_SALTO = `
  select s.id, s.oferta_id, s.vehiculo_id, s.posicion, s.motivo, s.detalle, s.created_at,
         v.placa, ${NOMBRE_ASOCIADO} as asociado_nombre
    from oferta_saltos s
    join vehiculos v on v.id = s.vehiculo_id
    left join asociados a on a.id = v.asociado_id`;

function aSalto(f: Fila): VistaSalto {
  const placa = texto(f.placa);
  return {
    id: texto(f.id),
    ofertaId: texto(f.oferta_id),
    vehiculoId: texto(f.vehiculo_id),
    placa,
    etiqueta: etiquetaAsociadoPlaca(textoONulo(f.asociado_nombre) ?? 'ASOCIADO DESCONOCIDO', placa),
    posicion: Number(f.posicion),
    motivo: texto(f.motivo) as MotivoNoElegible,
    detalle: textoONulo(f.detalle),
    creadoEn: instante(f.created_at),
  };
}

export class ConsultasPostgres implements Consultas {
  constructor(private readonly pool: pg.Pool) {}

  private consultar(sql: string, valores: unknown[] = []): Promise<Fila[]> {
    return enLecturaPg(this.pool, async (cliente) => {
      const { rows } = await cliente.query<Fila>(sql, valores);
      return rows;
    });
  }

  async clientes(): Promise<VistaCliente[]> {
    const filas = await this.consultar(
      'select id, codigo, nombre, requiere_habilitacion from clientes where activo order by codigo',
    );
    return filas.map((f) => ({
      id: texto(f.id),
      codigo: texto(f.codigo),
      nombre: texto(f.nombre),
      requiereHabilitacion: f.requiere_habilitacion === true,
    }));
  }

  async destinos(): Promise<VistaDestino[]> {
    const filas = await this.consultar(
      'select id, nombre, km from destinos where activo order by nombre',
    );
    return filas.map((f) => ({
      id: texto(f.id),
      nombre: texto(f.nombre),
      km: f.km === null ? null : Number(f.km),
    }));
  }

  async motivosDeclinacion(): Promise<VistaMotivo[]> {
    const filas = await this.consultar(
      'select id, codigo, nombre from motivos_declinacion where activo order by nombre',
    );
    return filas.map((f) => ({
      id: texto(f.id),
      codigo: texto(f.codigo),
      nombre: texto(f.nombre),
    }));
  }

  async vehiculos(opciones: {
    vehiculoIds?: readonly string[];
    enmascarar: boolean;
  }): Promise<VistaVehiculo[]> {
    const filas = await this.consultar(
      `select v.id, v.placa, v.clase, v.clase_cola, v.estado, v.no_elegible_hasta, v.asociado_id,
              a.id as asociado_pk, ${NOMBRE_ASOCIADO} as asociado_nombre, a.documento as asociado_documento,
              coalesce(
                json_agg(
                  json_build_object('clienteId', h.cliente_id, 'cliente', c.codigo,
                                    'apto', h.apto, 'motivoBloqueo', h.motivo_bloqueo)
                  order by c.codigo
                ) filter (where h.vehiculo_id is not null),
                '[]'::json
              ) as habilitaciones
         from vehiculos v
         left join asociados a on a.id = v.asociado_id
         left join habilitaciones h on h.vehiculo_id = v.id
         left join clientes c on c.id = h.cliente_id
        where v.deleted_at is null
          and ($1::uuid[] is null or v.id = any($1::uuid[]))
        group by v.id, a.id
        order by v.placa`,
      [opciones.vehiculoIds ? [...opciones.vehiculoIds] : null],
    );
    return filas.map((f) => ({
      id: texto(f.id),
      placa: texto(f.placa),
      clase: texto(f.clase) as VistaVehiculo['clase'],
      claseCola: texto(f.clase_cola) as ClaseCola,
      estado: texto(f.estado) as VistaVehiculo['estado'],
      noElegibleHasta: instanteONulo(f.no_elegible_hasta),
      asociadoId: texto(f.asociado_id),
      asociado: f.asociado_pk
        ? {
            id: texto(f.asociado_pk),
            nombre: textoONulo(f.asociado_nombre) ?? '',
            documento: opciones.enmascarar
              ? enmascararDocumento(textoONulo(f.asociado_documento))
              : textoONulo(f.asociado_documento),
          }
        : null,
      habilitaciones: (f.habilitaciones ?? []) as VistaVehiculo['habilitaciones'],
    }));
  }

  async requerimientos(filtro: FiltroRequerimientos): Promise<VistaRequerimiento[]> {
    const filas = await this.consultar(
      `${SELECT_REQUERIMIENTO.replace('$vigentes', '$1')}
        where ($2::text is null or r.estado = $2)
          and ($3::date is null or r.fecha_servicio = $3::date)
        order by r.fecha_servicio asc, r.created_at asc`,
      [[...ESTADOS_TR_VIGENTES], filtro.estado ?? null, filtro.fecha ?? null],
    );
    return filas.map(aRequerimiento);
  }

  async requerimientoPorId(id: string): Promise<VistaRequerimiento | undefined> {
    const filas = await this.consultar(
      `${SELECT_REQUERIMIENTO.replace('$vigentes', '$1')} where r.id = $2`,
      [[...ESTADOS_TR_VIGENTES], id],
    );
    return filas[0] ? aRequerimiento(filas[0]) : undefined;
  }

  private async requerimientosPorIds(ids: string[]): Promise<Map<string, VistaRequerimiento>> {
    if (ids.length === 0) return new Map();
    const filas = await this.consultar(
      `${SELECT_REQUERIMIENTO.replace('$vigentes', '$1')} where r.id = any($2::uuid[])`,
      [[...ESTADOS_TR_VIGENTES], ids],
    );
    return new Map(filas.map((f) => [texto(f.id), aRequerimiento(f)]));
  }

  async ofertas(filtro: FiltroOfertas): Promise<VistaOferta[]> {
    const filas = await this.consultar(
      `select o.*, v.placa, v.clase_cola, m.nombre as motivo_nombre,
              ${NOMBRE_ASOCIADO} as asociado_nombre
         from ofertas o
         left join vehiculos v on v.id = o.vehiculo_id
         left join asociados a on a.id = o.asociado_id
         left join motivos_declinacion m on m.id = o.motivo_declinacion_id
        where ($1::text is null or o.estado = $1)
          and ($2::uuid is null or o.requerimiento_id = $2)
          and ($3::uuid[] is null or o.vehiculo_id = any($3::uuid[]))
        order by o.ofrecida_en desc`,
      [
        filtro.estado ?? null,
        filtro.requerimientoId ?? null,
        filtro.vehiculoIds ? [...filtro.vehiculoIds] : null,
      ],
    );
    const requerimientos = await this.requerimientosPorIds([
      ...new Set(filas.map((f) => texto(f.requerimiento_id))),
    ]);
    return filas.map((f) => aOferta(f, requerimientos.get(texto(f.requerimiento_id)) ?? null));
  }

  async ofertaPorId(id: string): Promise<VistaOferta | undefined> {
    const [oferta] = await this.ofertasPorIds([id]);
    return oferta;
  }

  private async ofertasPorIds(ids: string[]): Promise<VistaOferta[]> {
    const filas = await this.consultar(
      `select o.*, v.placa, v.clase_cola, m.nombre as motivo_nombre,
              ${NOMBRE_ASOCIADO} as asociado_nombre
         from ofertas o
         left join vehiculos v on v.id = o.vehiculo_id
         left join asociados a on a.id = o.asociado_id
         left join motivos_declinacion m on m.id = o.motivo_declinacion_id
        where o.id = any($1::uuid[])`,
      [ids],
    );
    const requerimientos = await this.requerimientosPorIds([
      ...new Set(filas.map((f) => texto(f.requerimiento_id))),
    ]);
    return filas.map((f) => aOferta(f, requerimientos.get(texto(f.requerimiento_id)) ?? null));
  }

  async trs(filtro: FiltroTrs): Promise<VistaTr[]> {
    const filas = await this.consultar(
      `select t.*, t.fecha_asignacion::text as fecha_asignacion, v.placa,
              c.codigo as cliente, d.nombre as destino, ${NOMBRE_ASOCIADO} as asociado_nombre
         from trs t
         left join vehiculos v on v.id = t.vehiculo_id
         left join asociados a on a.id = v.asociado_id
         left join clientes c on c.id = t.cliente_id
         left join destinos d on d.id = t.destino_id
        where ($1::text is null or t.estado = $1)
          and ($2::date is null or t.fecha_asignacion >= $2::date)
          and ($3::date is null or t.fecha_asignacion <= $3::date)
          and ($4::text is null or v.placa = $4)
          and ($5::uuid[] is null or t.vehiculo_id = any($5::uuid[]))
        order by t.codigo desc`,
      [
        filtro.estado ?? null,
        filtro.desde ?? null,
        filtro.hasta ?? null,
        filtro.placa ?? null,
        filtro.vehiculoIds ? [...filtro.vehiculoIds] : null,
      ],
    );
    return filas.map(aTr);
  }

  async trPorId(id: string): Promise<VistaTr | undefined> {
    const filas = await this.consultar(
      `select t.*, t.fecha_asignacion::text as fecha_asignacion, v.placa,
              c.codigo as cliente, d.nombre as destino, ${NOMBRE_ASOCIADO} as asociado_nombre
         from trs t
         left join vehiculos v on v.id = t.vehiculo_id
         left join asociados a on a.id = v.asociado_id
         left join clientes c on c.id = t.cliente_id
         left join destinos d on d.id = t.destino_id
        where t.id = $1`,
      [id],
    );
    return filas[0] ? aTr(filas[0]) : undefined;
  }

  async posicionesDeVehiculos(vehiculoIds: readonly string[]): Promise<MiPosicion[]> {
    if (vehiculoIds.length === 0) return [];
    const filas = await this.consultar(
      `select v.placa, p.clase_cola, p.posicion, cola_total(p.clase_cola) as total
         from cola_posiciones p
         join vehiculos v on v.id = p.vehiculo_id
        where p.vehiculo_id = any($1::uuid[])
        order by v.placa`,
      [[...vehiculoIds]],
    );
    return filas.map((f) => ({
      placa: texto(f.placa),
      claseCola: texto(f.clase_cola) as ClaseCola,
      posicion: Number(f.posicion),
      total: Number(f.total),
    }));
  }

  async saltosDeOferta(ofertaId: string): Promise<VistaSalto[]> {
    const filas = await this.consultar(
      `${SELECT_SALTO} where s.oferta_id = $1 order by s.posicion asc`,
      [ofertaId],
    );
    return filas.map(aSalto);
  }

  /**
   * "Mis turnos que pasaron". Un member llega a la oferta que le pasó por delante gracias a la
   * política `ofertas_lectura_saltada` (0017); el requerimiento, el cliente y el destino no tienen RLS.
   * Las fechas del rango son de negocio: se comparan en la zona de `parametros.timezone`.
   */
  async saltosDeVehiculos(
    vehiculoIds: readonly string[],
    rango: RangoFechas = {},
  ): Promise<VistaSaltoPropio[]> {
    if (vehiculoIds.length === 0) return [];
    const { timezone } = await this.parametros();
    const filas = await this.consultar(
      `select s.id, s.oferta_id, s.vehiculo_id, s.posicion, s.motivo, s.detalle, s.created_at,
              v.placa, ${NOMBRE_ASOCIADO} as asociado_nombre,
              o.estado as oferta_estado, r.id as requerimiento_id, r.clase_cola,
              r.fecha_servicio::text as fecha_servicio, c.codigo as cliente, d.nombre as destino
         from oferta_saltos s
         join vehiculos v on v.id = s.vehiculo_id
         left join asociados a on a.id = v.asociado_id
         join ofertas o on o.id = s.oferta_id
         join requerimientos r on r.id = o.requerimiento_id
         left join clientes c on c.id = r.cliente_id
         left join destinos d on d.id = r.destino_id
        where s.vehiculo_id = any($1::uuid[])
          and ($2::date is null or (s.created_at at time zone $4::text)::date >= $2::date)
          and ($3::date is null or (s.created_at at time zone $4::text)::date <= $3::date)
        order by s.created_at desc, s.posicion asc`,
      [[...vehiculoIds], rango.desde ?? null, rango.hasta ?? null, timezone],
    );
    return filas.map((f) => ({
      ...aSalto(f),
      claseCola: texto(f.clase_cola) as ClaseCola,
      requerimientoId: texto(f.requerimiento_id),
      cliente: textoONulo(f.cliente),
      destino: textoONulo(f.destino),
      fechaServicio: textoONulo(f.fecha_servicio),
      ofertaEstado: texto(f.oferta_estado) as VistaSaltoPropio['ofertaEstado'],
    }));
  }

  /** Saltadas por placa y motivo en la clase del requerimiento (la cola donde ocurrió el salto). */
  async saltosPorClase(claseCola: ClaseCola, mes: string): Promise<VistaSaltoAgregado[]> {
    const { timezone } = await this.parametros();
    const filas = await this.consultar(
      `select s.vehiculo_id, v.placa, ${NOMBRE_ASOCIADO} as asociado_nombre, s.motivo,
              count(*)::int as total
         from oferta_saltos s
         join ofertas o on o.id = s.oferta_id
         join requerimientos r on r.id = o.requerimiento_id
         join vehiculos v on v.id = s.vehiculo_id
         left join asociados a on a.id = v.asociado_id
        where r.clase_cola = $1
          and to_char(s.created_at at time zone $3::text, 'YYYY-MM') = $2
        group by s.vehiculo_id, v.placa, asociado_nombre, s.motivo
        order by v.placa, s.motivo`,
      [claseCola, mes, timezone],
    );
    return filas.map((f) => {
      const placa = texto(f.placa);
      return {
        vehiculoId: texto(f.vehiculo_id),
        placa,
        etiqueta: etiquetaAsociadoPlaca(
          textoONulo(f.asociado_nombre) ?? 'ASOCIADO DESCONOCIDO',
          placa,
        ),
        motivo: texto(f.motivo) as MotivoNoElegible,
        total: Number(f.total),
      };
    });
  }

  async parametros(): Promise<Parametros> {
    const filas = await this.consultar('select key, value from parametros');
    return ParametrosSchema.parse(Object.fromEntries(filas.map((f) => [texto(f.key), f.value])));
  }

  async audit(filtro: FiltroAudit): Promise<EventoAuditoria[]> {
    const filas = await this.consultar(
      `select * from audit_log
        where ($1::text[] is null or entidad = any($1::text[]))
          and ($2::text is null or entidad = $2)
          and ($3::text is null or entidad_id = $3)
          and ($5::text[] is null or accion = any($5::text[]))
        order by at desc
        limit $4`,
      [
        filtro.entidadesPermitidas ? [...filtro.entidadesPermitidas] : null,
        filtro.entidad ?? null,
        filtro.entidadId ?? null,
        filtro.limite,
        filtro.acciones ? [...filtro.acciones] : null,
      ],
    );
    return filas.map((f) => ({
      id: texto(f.id),
      at: instante(f.at),
      actorId: textoONulo(f.actor_id) ?? 'sistema',
      actorRol: texto(f.actor_rol) as EventoAuditoria['actorRol'],
      accion: texto(f.accion),
      entidad: texto(f.entidad),
      entidadId: texto(f.entidad_id),
      before: f.before ?? null,
      after: f.after ?? null,
    }));
  }
}
