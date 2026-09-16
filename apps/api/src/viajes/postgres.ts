import type pg from 'pg';
import type {
  ClaseCola,
  ClaseVehiculo,
  EstadoRecaudo,
  EstadoTr,
  EstadoViaje,
} from '@asotracmet/shared';
import { enEscrituraPg, enLecturaPg } from '../persistencia/postgres.js';
import type {
  FiltroRecaudos,
  FiltroViajes,
  RecaudoRegistro,
  RecaudoVista,
  RepositorioViajes,
  ViajeRegistro,
  ViajeVista,
} from './tipos.js';

// Adaptador Postgres de viajes y recaudos. Lecturas y escrituras con el rol real del actor: RLS
// deja al member solo sus placas (viajes por vehiculo_id, recaudos vía viaje) y a finance escribir.

type Fila = Record<string, unknown>;

const txt = (v: unknown): string => String(v);
const txtN = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const numN = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const num = (v: unknown): number => Number(v ?? 0);
const fecha = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

const NOMBRE_ASOCIADO = `coalesce(a.razon_social, nullif(trim(coalesce(a.nombres, '') || ' ' || coalesce(a.apellidos, '')), ''))`;

const SELECT_VIAJE = `
  select v.id, v.tr_id, v.vehiculo_id, v.conductor_id,
         v.fecha_cargue::text as fecha_cargue, v.fecha_descargue::text as fecha_descargue,
         v.lugar_descargue, v.transportadora_id, v.tarifa_id, v.flete, v.porcentaje_aplicado,
         v.valor_recaudo, v.valor_pagado, v.estado, v.notas, v.version, v.created_at, v.updated_at,
         t.codigo as tr_codigo, t.estado as tr_estado, t.fecha_asignacion::text as fecha_asignacion,
         t.cliente_id, t.destino_id,
         ve.placa, ve.clase, ve.clase_cola,
         c.codigo as cliente, d.nombre as destino, tp.nombre as transportadora, co.nombres as conductor,
         a.id as asociado_id, ${NOMBRE_ASOCIADO} as asociado_nombre, a.documento as asociado_documento,
         to_char(coalesce(v.fecha_cargue, t.fecha_asignacion), 'YYYY-MM') as mes
    from viajes v
    join trs t on t.id = v.tr_id
    join vehiculos ve on ve.id = v.vehiculo_id
    left join asociados a on a.id = ve.asociado_id
    left join clientes c on c.id = t.cliente_id
    left join destinos d on d.id = t.destino_id
    left join transportadoras tp on tp.id = v.transportadora_id
    left join conductores co on co.id = v.conductor_id`;

const SELECT_RECAUDO = `
  select r.id, r.viaje_id, r.asociado_id, r.valor, r.estado,
         r.fecha_pago::text as fecha_pago, r.referencia, r.created_at,
         t.codigo as tr_codigo, ve.placa, v.vehiculo_id, v.flete, v.valor_pagado,
         ${NOMBRE_ASOCIADO} as asociado_nombre, a.documento as asociado_documento,
         to_char(coalesce(v.fecha_cargue, t.fecha_asignacion), 'YYYY-MM') as mes
    from recaudos r
    join viajes v on v.id = r.viaje_id
    join trs t on t.id = v.tr_id
    join vehiculos ve on ve.id = v.vehiculo_id
    left join asociados a on a.id = r.asociado_id`;

function aViaje(f: Fila): ViajeVista {
  return {
    id: txt(f.id),
    trId: txt(f.tr_id),
    vehiculoId: txt(f.vehiculo_id),
    conductorId: txtN(f.conductor_id),
    fechaCargue: txtN(f.fecha_cargue),
    fechaDescargue: txtN(f.fecha_descargue),
    lugarDescargue: txtN(f.lugar_descargue),
    transportadoraId: txtN(f.transportadora_id),
    tarifaId: txtN(f.tarifa_id),
    flete: numN(f.flete),
    porcentajeAplicado: numN(f.porcentaje_aplicado),
    valorRecaudo: numN(f.valor_recaudo),
    valorPagado: num(f.valor_pagado),
    estado: txt(f.estado) as EstadoViaje,
    notas: txtN(f.notas),
    version: Number(f.version),
    creadoEn: fecha(f.created_at),
    actualizadoEn: fecha(f.updated_at),
    trCodigo: txt(f.tr_codigo),
    trEstado: txt(f.tr_estado) as EstadoTr,
    fechaAsignacion: txt(f.fecha_asignacion),
    placa: txt(f.placa),
    clase: txt(f.clase) as ClaseVehiculo,
    claseCola: txt(f.clase_cola) as ClaseCola,
    clienteId: txtN(f.cliente_id),
    cliente: txtN(f.cliente),
    destinoId: txtN(f.destino_id),
    destino: txtN(f.destino),
    transportadora: txtN(f.transportadora),
    conductor: txtN(f.conductor),
    asociadoId: txtN(f.asociado_id),
    asociadoNombre: txtN(f.asociado_nombre),
    asociadoDocumento: txtN(f.asociado_documento),
    mes: txt(f.mes),
  };
}

function aRecaudo(f: Fila): RecaudoVista {
  return {
    id: txt(f.id),
    viajeId: txt(f.viaje_id),
    asociadoId: txt(f.asociado_id),
    valor: num(f.valor),
    estado: txt(f.estado) as EstadoRecaudo,
    fechaPago: txtN(f.fecha_pago),
    referencia: txtN(f.referencia),
    creadoEn: fecha(f.created_at),
    trCodigo: txt(f.tr_codigo),
    placa: txt(f.placa),
    vehiculoId: txt(f.vehiculo_id),
    asociadoNombre: txtN(f.asociado_nombre),
    asociadoDocumento: txtN(f.asociado_documento),
    flete: numN(f.flete),
    valorPagado: num(f.valor_pagado),
    mes: txt(f.mes),
  };
}

export class ViajesPostgres implements RepositorioViajes {
  constructor(private readonly pool: pg.Pool) {}

  private leer(sql: string, valores: unknown[] = []): Promise<Fila[]> {
    return enLecturaPg(this.pool, async (c) => (await c.query<Fila>(sql, valores)).rows);
  }

  private escribir(sql: string, valores: unknown[]): Promise<void> {
    return enEscrituraPg(this.pool, async (c) => {
      await c.query(sql, valores);
    });
  }

  async viajes(filtro: FiltroViajes): Promise<ViajeVista[]> {
    const filas = await this.leer(
      `${SELECT_VIAJE}
        where ($1::text is null or to_char(coalesce(v.fecha_cargue, t.fecha_asignacion), 'YYYY-MM') = $1)
          and ($2::text is null or v.estado = $2)
          and ($3::text is null or ve.placa = $3)
          and ($4::uuid is null or v.tr_id = $4)
          and ($5::uuid[] is null or v.vehiculo_id = any($5::uuid[]))
        order by coalesce(v.fecha_cargue, t.fecha_asignacion) desc, v.created_at desc`,
      [
        filtro.mes ?? null,
        filtro.estado ?? null,
        filtro.placa ?? null,
        filtro.trId ?? null,
        filtro.vehiculoIds ? [...filtro.vehiculoIds] : null,
      ],
    );
    return filas.map(aViaje);
  }

  async viaje(id: string): Promise<ViajeVista | undefined> {
    const [f] = await this.leer(`${SELECT_VIAJE} where v.id = $1`, [id]);
    return f ? aViaje(f) : undefined;
  }

  async viajePorTr(trId: string): Promise<ViajeVista | undefined> {
    const [f] = await this.leer(`${SELECT_VIAJE} where v.tr_id = $1`, [trId]);
    return f ? aViaje(f) : undefined;
  }

  async guardarViaje(v: ViajeRegistro): Promise<void> {
    await this.escribir(
      `insert into viajes
         (id, tr_id, vehiculo_id, conductor_id, fecha_cargue, fecha_descargue, lugar_descargue,
          transportadora_id, tarifa_id, flete, porcentaje_aplicado, valor_recaudo, valor_pagado,
          estado, notas, version)
       values ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       on conflict (id) do update set
         conductor_id = excluded.conductor_id, fecha_cargue = excluded.fecha_cargue,
         fecha_descargue = excluded.fecha_descargue, lugar_descargue = excluded.lugar_descargue,
         transportadora_id = excluded.transportadora_id, tarifa_id = excluded.tarifa_id,
         flete = excluded.flete, porcentaje_aplicado = excluded.porcentaje_aplicado,
         valor_recaudo = excluded.valor_recaudo, valor_pagado = excluded.valor_pagado,
         estado = excluded.estado, notas = excluded.notas, version = excluded.version,
         updated_at = now()`,
      [
        v.id,
        v.trId,
        v.vehiculoId,
        v.conductorId,
        v.fechaCargue,
        v.fechaDescargue,
        v.lugarDescargue,
        v.transportadoraId,
        v.tarifaId,
        v.flete,
        v.porcentajeAplicado,
        v.valorRecaudo,
        v.valorPagado,
        v.estado,
        v.notas,
        v.version,
      ],
    );
  }

  async recaudos(filtro: FiltroRecaudos): Promise<RecaudoVista[]> {
    const filas = await this.leer(
      `${SELECT_RECAUDO}
        where ($1::text is null or to_char(coalesce(v.fecha_cargue, t.fecha_asignacion), 'YYYY-MM') = $1)
          and ($2::text is null or r.estado = $2)
          and ($3::text is null or ve.placa = $3)
          and ($4::uuid[] is null or v.vehiculo_id = any($4::uuid[]))
        order by r.created_at desc`,
      [
        filtro.mes ?? null,
        filtro.estado ?? null,
        filtro.placa ?? null,
        filtro.vehiculoIds ? [...filtro.vehiculoIds] : null,
      ],
    );
    return filas.map(aRecaudo);
  }

  async recaudo(id: string): Promise<RecaudoVista | undefined> {
    const [f] = await this.leer(`${SELECT_RECAUDO} where r.id = $1`, [id]);
    return f ? aRecaudo(f) : undefined;
  }

  async recaudoDeViaje(viajeId: string): Promise<RecaudoVista | undefined> {
    const [f] = await this.leer(
      `${SELECT_RECAUDO} where r.viaje_id = $1 order by r.created_at desc limit 1`,
      [viajeId],
    );
    return f ? aRecaudo(f) : undefined;
  }

  async guardarRecaudo(r: RecaudoRegistro): Promise<void> {
    await this.escribir(
      `insert into recaudos (id, viaje_id, asociado_id, valor, estado, fecha_pago, referencia)
       values ($1, $2, $3, $4, $5, $6::date, $7)
       on conflict (id) do update set
         valor = excluded.valor, estado = excluded.estado,
         fecha_pago = excluded.fecha_pago, referencia = excluded.referencia`,
      [r.id, r.viajeId, r.asociadoId, r.valor, r.estado, r.fechaPago, r.referencia],
    );
  }
}
