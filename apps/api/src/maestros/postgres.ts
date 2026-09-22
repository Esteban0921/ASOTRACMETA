import type pg from 'pg';
import {
  esCodigoMotivoBloqueo,
  type ClaseCola,
  type ClaseVehiculo,
  type EstadoVehiculo,
} from '@asotracmet/shared';
import { enEscrituraPg, enLecturaPg } from '../persistencia/postgres.js';
import type {
  AsociadoRegistro,
  ClienteRegistro,
  ConductorRegistro,
  DestinoRegistro,
  DocumentoRegistro,
  FiltroDocumentos,
  FiltroTarifas,
  HabilitacionRegistro,
  OpcionesListado,
  RepositorioMaestros,
  TarifaRegistro,
  TipoDocumentoRegistro,
  TransportadoraRegistro,
  VehiculoConductor,
  VehiculoRegistro,
} from './tipos.js';

// Adaptador Postgres de los maestros. Lecturas y escrituras con el rol real del actor (RLS aplica
// en `documentos`); los errores de unicidad los traduce `traducirErrorPg` a códigos estables.

type Fila = Record<string, unknown>;

const txt = (v: unknown): string => String(v);
const txtN = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const numN = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const fecha = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const fechaN = (v: unknown): string | null => (v === null || v === undefined ? null : fecha(v));

function aAsociado(f: Fila): AsociadoRegistro {
  return {
    id: txt(f.id),
    tipo: txt(f.tipo) as AsociadoRegistro['tipo'],
    nombres: txtN(f.nombres),
    apellidos: txtN(f.apellidos),
    razonSocial: txtN(f.razon_social),
    documento: txt(f.documento),
    documentoTipo: txtN(f.documento_tipo),
    celular: txtN(f.celular),
    correo: txtN(f.correo),
    direccion: txtN(f.direccion),
    cuentaBancariaEnc: txtN(f.cuenta_bancaria_enc),
    estado: txt(f.estado) as AsociadoRegistro['estado'],
    fechaAfiliacion: txtN(f.fecha_afiliacion),
    creadoEn: fecha(f.created_at),
    actualizadoEn: fecha(f.updated_at),
    eliminadoEn: fechaN(f.deleted_at),
  };
}

function aVehiculo(f: Fila): VehiculoRegistro {
  return {
    id: txt(f.id),
    placa: txt(f.placa),
    clase: txt(f.clase) as ClaseVehiculo,
    claseCola: txt(f.clase_cola) as ClaseCola,
    tipoCarroceria: txtN(f.tipo_carroceria),
    modelo: numN(f.modelo),
    repotenciacion: numN(f.repotenciacion),
    largoMts: numN(f.largo_mts),
    kmRecorrido: numN(f.km_recorrido),
    asociadoId: txt(f.asociado_id),
    propietarioNombre: txtN(f.propietario_nombre),
    propietarioDocumento: txtN(f.propietario_documento),
    parentesco: txtN(f.parentesco),
    trailerPlaca: txtN(f.trailer_placa),
    gpsProveedor: txtN(f.gps_proveedor),
    estado: txt(f.estado) as EstadoVehiculo,
    noElegibleHasta: fechaN(f.no_elegible_hasta),
    creadoEn: fecha(f.created_at),
    actualizadoEn: fecha(f.updated_at),
    eliminadoEn: fechaN(f.deleted_at),
  };
}

function aConductor(f: Fila): ConductorRegistro {
  return {
    id: txt(f.id),
    nombres: txt(f.nombres),
    documento: txt(f.documento),
    celular: txtN(f.celular),
    correo: txtN(f.correo),
    asociadoId: txtN(f.asociado_id),
    licenciaCategoria: txtN(f.licencia_categoria),
    licenciaVence: txtN(f.licencia_vence),
    creadoEn: fecha(f.created_at),
    actualizadoEn: fecha(f.updated_at),
    eliminadoEn: fechaN(f.deleted_at),
  };
}

function aDocumento(f: Fila): DocumentoRegistro {
  return {
    id: txt(f.id),
    sujetoTipo: txt(f.sujeto_tipo) as DocumentoRegistro['sujetoTipo'],
    sujetoId: txt(f.sujeto_id),
    tipoId: txt(f.tipo_id),
    numero: txtN(f.numero),
    emitidoEn: txtN(f.emitido_en),
    venceEn: txtN(f.vence_en),
    archivoUrl: txtN(f.archivo_url),
    creadoEn: fecha(f.created_at),
    actualizadoEn: fecha(f.updated_at),
    eliminadoEn: fechaN(f.deleted_at),
  };
}

function aTarifa(f: Fila): TarifaRegistro {
  return {
    id: txt(f.id),
    clienteId: txt(f.cliente_id),
    origen: txt(f.origen),
    destinoId: txt(f.destino_id),
    clase: txt(f.clase) as ClaseVehiculo,
    modalidad: txt(f.modalidad),
    valor: Number(f.valor),
    vigenciaDesde: txt(f.vigencia_desde),
    vigenciaHasta: txtN(f.vigencia_hasta),
  };
}

const SELECT_ASOCIADO = `select a.*, a.fecha_afiliacion::text as fecha_afiliacion from asociados a`;
const SELECT_CONDUCTOR = `select c.*, c.licencia_vence::text as licencia_vence from conductores c`;
const SELECT_DOCUMENTO = `select d.*, d.emitido_en::text as emitido_en, d.vence_en::text as vence_en from documentos d`;
const SELECT_TARIFA = `select t.*, t.vigencia_desde::text as vigencia_desde, t.vigencia_hasta::text as vigencia_hasta from tarifas t`;

export class MaestrosPostgres implements RepositorioMaestros {
  constructor(private readonly pool: pg.Pool) {}

  private leer(sql: string, valores: unknown[] = []): Promise<Fila[]> {
    return enLecturaPg(this.pool, async (c) => (await c.query<Fila>(sql, valores)).rows);
  }

  private escribir(sql: string, valores: unknown[] = []): Promise<void> {
    return enEscrituraPg(this.pool, async (c) => {
      await c.query(sql, valores);
    });
  }

  // --- Asociados ---------------------------------------------------------------------------------
  async asociados(opciones: OpcionesListado = {}): Promise<AsociadoRegistro[]> {
    const filas = await this.leer(
      `${SELECT_ASOCIADO} where ($1::boolean or a.deleted_at is null) order by a.documento`,
      [Boolean(opciones.incluirEliminados)],
    );
    return filas.map(aAsociado);
  }

  async asociado(id: string): Promise<AsociadoRegistro | undefined> {
    const [f] = await this.leer(`${SELECT_ASOCIADO} where a.id = $1`, [id]);
    return f ? aAsociado(f) : undefined;
  }

  async asociadoPorDocumento(documento: string): Promise<AsociadoRegistro | undefined> {
    const [f] = await this.leer(`${SELECT_ASOCIADO} where a.documento = $1`, [documento]);
    return f ? aAsociado(f) : undefined;
  }

  async guardarAsociado(a: AsociadoRegistro): Promise<void> {
    await this.escribir(
      `insert into asociados (id, tipo, nombres, apellidos, razon_social, documento, documento_tipo, celular,
                              correo, direccion, cuenta_bancaria_enc, estado, fecha_afiliacion, deleted_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::date, $14)
       on conflict (id) do update set
         tipo = excluded.tipo, nombres = excluded.nombres, apellidos = excluded.apellidos,
         razon_social = excluded.razon_social, documento = excluded.documento,
         documento_tipo = excluded.documento_tipo, celular = excluded.celular, correo = excluded.correo,
         direccion = excluded.direccion, cuenta_bancaria_enc = excluded.cuenta_bancaria_enc,
         estado = excluded.estado, fecha_afiliacion = excluded.fecha_afiliacion,
         deleted_at = excluded.deleted_at, updated_at = now()`,
      [
        a.id,
        a.tipo,
        a.nombres,
        a.apellidos,
        a.razonSocial,
        a.documento,
        a.documentoTipo,
        a.celular,
        a.correo,
        a.direccion,
        a.cuentaBancariaEnc,
        a.estado,
        a.fechaAfiliacion,
        a.eliminadoEn,
      ],
    );
  }

  // --- Vehículos ---------------------------------------------------------------------------------
  async vehiculos(opciones: OpcionesListado = {}): Promise<VehiculoRegistro[]> {
    const filas = await this.leer(
      'select * from vehiculos where ($1::boolean or deleted_at is null) order by placa',
      [Boolean(opciones.incluirEliminados)],
    );
    return filas.map(aVehiculo);
  }

  async vehiculo(id: string): Promise<VehiculoRegistro | undefined> {
    const [f] = await this.leer('select * from vehiculos where id = $1', [id]);
    return f ? aVehiculo(f) : undefined;
  }

  async vehiculoPorPlaca(placa: string): Promise<VehiculoRegistro | undefined> {
    const [f] = await this.leer('select * from vehiculos where placa = $1', [placa]);
    return f ? aVehiculo(f) : undefined;
  }

  async guardarVehiculo(v: VehiculoRegistro): Promise<void> {
    await this.escribir(
      `insert into vehiculos (id, placa, clase, clase_cola, tipo_carroceria, modelo, repotenciacion, largo_mts,
                              km_recorrido, asociado_id, propietario_nombre, propietario_documento, parentesco,
                              trailer_placa, gps_proveedor, estado, no_elegible_hasta, deleted_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       on conflict (id) do update set
         clase = excluded.clase, clase_cola = excluded.clase_cola, tipo_carroceria = excluded.tipo_carroceria,
         modelo = excluded.modelo, repotenciacion = excluded.repotenciacion, largo_mts = excluded.largo_mts,
         km_recorrido = excluded.km_recorrido, asociado_id = excluded.asociado_id,
         propietario_nombre = excluded.propietario_nombre, propietario_documento = excluded.propietario_documento,
         parentesco = excluded.parentesco, trailer_placa = excluded.trailer_placa,
         gps_proveedor = excluded.gps_proveedor, estado = excluded.estado,
         no_elegible_hasta = excluded.no_elegible_hasta, deleted_at = excluded.deleted_at, updated_at = now()`,
      [
        v.id,
        v.placa,
        v.clase,
        v.claseCola,
        v.tipoCarroceria,
        v.modelo,
        v.repotenciacion,
        v.largoMts,
        v.kmRecorrido,
        v.asociadoId,
        v.propietarioNombre,
        v.propietarioDocumento,
        v.parentesco,
        v.trailerPlaca,
        v.gpsProveedor,
        v.estado,
        v.noElegibleHasta,
        v.eliminadoEn,
      ],
    );
  }

  async vehiculoTieneTrs(id: string): Promise<boolean> {
    const [f] = await this.leer('select exists(select 1 from trs where vehiculo_id = $1) as hay', [
      id,
    ]);
    return f?.hay === true;
  }

  // --- Conductores -------------------------------------------------------------------------------
  async conductores(opciones: OpcionesListado = {}): Promise<ConductorRegistro[]> {
    const filas = await this.leer(
      `${SELECT_CONDUCTOR} where ($1::boolean or c.deleted_at is null) order by c.nombres`,
      [Boolean(opciones.incluirEliminados)],
    );
    return filas.map(aConductor);
  }

  async conductor(id: string): Promise<ConductorRegistro | undefined> {
    const [f] = await this.leer(`${SELECT_CONDUCTOR} where c.id = $1`, [id]);
    return f ? aConductor(f) : undefined;
  }

  async conductorPorDocumento(documento: string): Promise<ConductorRegistro | undefined> {
    const [f] = await this.leer(`${SELECT_CONDUCTOR} where c.documento = $1`, [documento]);
    return f ? aConductor(f) : undefined;
  }

  async guardarConductor(c: ConductorRegistro): Promise<void> {
    await this.escribir(
      `insert into conductores (id, nombres, documento, celular, correo, asociado_id, licencia_categoria, licencia_vence, deleted_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8::date, $9)
       on conflict (id) do update set
         nombres = excluded.nombres, documento = excluded.documento, celular = excluded.celular,
         correo = excluded.correo, asociado_id = excluded.asociado_id,
         licencia_categoria = excluded.licencia_categoria, licencia_vence = excluded.licencia_vence,
         deleted_at = excluded.deleted_at, updated_at = now()`,
      [
        c.id,
        c.nombres,
        c.documento,
        c.celular,
        c.correo,
        c.asociadoId,
        c.licenciaCategoria,
        c.licenciaVence,
        c.eliminadoEn,
      ],
    );
  }

  async conductoresDe(
    vehiculoId: string,
  ): Promise<Array<VehiculoConductor & { conductor: ConductorRegistro }>> {
    const filas = await this.leer(
      `select vc.vehiculo_id, vc.conductor_id, vc.es_principal, c.*, c.licencia_vence::text as licencia_vence
         from vehiculo_conductores vc join conductores c on c.id = vc.conductor_id
        where vc.vehiculo_id = $1 order by vc.es_principal desc, c.nombres`,
      [vehiculoId],
    );
    return filas.map((f) => ({
      vehiculoId: txt(f.vehiculo_id),
      conductorId: txt(f.conductor_id),
      esPrincipal: f.es_principal === true,
      conductor: aConductor(f),
    }));
  }

  async asignarConductores(vehiculoId: string, asignaciones: VehiculoConductor[]): Promise<void> {
    await enEscrituraPg(this.pool, async (c) => {
      await c.query('delete from vehiculo_conductores where vehiculo_id = $1', [vehiculoId]);
      for (const a of asignaciones) {
        await c.query(
          'insert into vehiculo_conductores (vehiculo_id, conductor_id, es_principal) values ($1, $2, $3)',
          [vehiculoId, a.conductorId, a.esPrincipal],
        );
      }
    });
  }

  // --- Catálogos ---------------------------------------------------------------------------------
  async clientes(): Promise<ClienteRegistro[]> {
    const filas = await this.leer('select * from clientes order by codigo');
    return filas.map((f) => ({
      id: txt(f.id),
      codigo: txt(f.codigo),
      nombre: txt(f.nombre),
      requiereHabilitacion: f.requiere_habilitacion === true,
      activo: f.activo === true,
    }));
  }

  async clientePorCodigo(codigo: string): Promise<ClienteRegistro | undefined> {
    return (await this.clientes()).find((c) => c.codigo === codigo);
  }

  async guardarCliente(c: ClienteRegistro): Promise<void> {
    await this.escribir(
      `insert into clientes (id, codigo, nombre, requiere_habilitacion, activo) values ($1, $2, $3, $4, $5)
       on conflict (id) do update set nombre = excluded.nombre,
         requiere_habilitacion = excluded.requiere_habilitacion, activo = excluded.activo`,
      [c.id, c.codigo, c.nombre, c.requiereHabilitacion, c.activo],
    );
  }

  async destinos(): Promise<DestinoRegistro[]> {
    const filas = await this.leer('select * from destinos order by nombre');
    return filas.map((f) => ({
      id: txt(f.id),
      nombre: txt(f.nombre),
      km: numN(f.km),
      activo: f.activo === true,
    }));
  }

  async destinoPorNombre(nombre: string): Promise<DestinoRegistro | undefined> {
    return (await this.destinos()).find((d) => d.nombre === nombre);
  }

  async guardarDestino(d: DestinoRegistro): Promise<void> {
    await this.escribir(
      `insert into destinos (id, nombre, km, activo) values ($1, $2, $3, $4)
       on conflict (id) do update set nombre = excluded.nombre, km = excluded.km, activo = excluded.activo`,
      [d.id, d.nombre, d.km, d.activo],
    );
  }

  async transportadoras(): Promise<TransportadoraRegistro[]> {
    const filas = await this.leer('select * from transportadoras order by nombre');
    return filas.map((f) => ({ id: txt(f.id), nombre: txt(f.nombre), activo: f.activo === true }));
  }

  async transportadoraPorNombre(nombre: string): Promise<TransportadoraRegistro | undefined> {
    return (await this.transportadoras()).find((t) => t.nombre === nombre);
  }

  async guardarTransportadora(t: TransportadoraRegistro): Promise<void> {
    await this.escribir(
      `insert into transportadoras (id, nombre, activo) values ($1, $2, $3)
       on conflict (id) do update set nombre = excluded.nombre, activo = excluded.activo`,
      [t.id, t.nombre, t.activo],
    );
  }

  // --- Tarifas -----------------------------------------------------------------------------------
  async tarifas(filtro: FiltroTarifas): Promise<TarifaRegistro[]> {
    const filas = await this.leer(
      `${SELECT_TARIFA}
        where ($1::uuid is null or t.cliente_id = $1)
          and ($2::uuid is null or t.destino_id = $2)
          and ($3::text is null or t.clase = $3)
          and ($4::date is null or (t.vigencia_desde <= $4::date and (t.vigencia_hasta is null or t.vigencia_hasta >= $4::date)))
        order by t.vigencia_desde desc, t.clase, t.modalidad`,
      [
        filtro.clienteId ?? null,
        filtro.destinoId ?? null,
        filtro.clase ?? null,
        filtro.vigentesEn ?? null,
      ],
    );
    return filas.map(aTarifa);
  }

  async tarifa(id: string): Promise<TarifaRegistro | undefined> {
    const [f] = await this.leer(`${SELECT_TARIFA} where t.id = $1`, [id]);
    return f ? aTarifa(f) : undefined;
  }

  async guardarTarifa(t: TarifaRegistro): Promise<void> {
    await this.escribir(
      `insert into tarifas (id, cliente_id, origen, destino_id, clase, modalidad, valor, vigencia_desde, vigencia_hasta)
       values ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::date)
       on conflict (id) do update set valor = excluded.valor, vigencia_hasta = excluded.vigencia_hasta`,
      [
        t.id,
        t.clienteId,
        t.origen,
        t.destinoId,
        t.clase,
        t.modalidad,
        t.valor,
        t.vigenciaDesde,
        t.vigenciaHasta,
      ],
    );
  }

  // --- Documentos y habilitaciones -----------------------------------------------------------------
  async tiposDocumento(): Promise<TipoDocumentoRegistro[]> {
    const filas = await this.leer('select * from tipos_documento order by codigo');
    return filas.map((f) => ({
      id: txt(f.id),
      codigo: txt(f.codigo),
      nombre: txt(f.nombre),
      aplicaA: txt(f.aplica_a) as TipoDocumentoRegistro['aplicaA'],
      bloqueante: f.bloqueante === true,
      diasAlerta: Number(f.dias_alerta),
    }));
  }

  async documentos(filtro: FiltroDocumentos): Promise<DocumentoRegistro[]> {
    const filas = await this.leer(
      `${SELECT_DOCUMENTO}
        where ($1::boolean or d.deleted_at is null)
          and ($2::text is null or d.sujeto_tipo = $2)
          and ($3::uuid is null or d.sujeto_id = $3)
        order by d.vence_en nulls last`,
      [Boolean(filtro.incluirEliminados), filtro.sujetoTipo ?? null, filtro.sujetoId ?? null],
    );
    return filas.map(aDocumento);
  }

  async documento(id: string): Promise<DocumentoRegistro | undefined> {
    const [f] = await this.leer(`${SELECT_DOCUMENTO} where d.id = $1`, [id]);
    return f ? aDocumento(f) : undefined;
  }

  async guardarDocumento(d: DocumentoRegistro): Promise<void> {
    await this.escribir(
      `insert into documentos (id, sujeto_tipo, sujeto_id, tipo_id, numero, emitido_en, vence_en, archivo_url, deleted_at)
       values ($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9)
       on conflict (id) do update set numero = excluded.numero, emitido_en = excluded.emitido_en,
         vence_en = excluded.vence_en, archivo_url = excluded.archivo_url,
         deleted_at = excluded.deleted_at, updated_at = now()`,
      [
        d.id,
        d.sujetoTipo,
        d.sujetoId,
        d.tipoId,
        d.numero,
        d.emitidoEn,
        d.venceEn,
        d.archivoUrl,
        d.eliminadoEn,
      ],
    );
  }

  async habilitacionesDe(vehiculoId: string): Promise<HabilitacionRegistro[]> {
    const filas = await this.leer('select * from habilitaciones where vehiculo_id = $1', [
      vehiculoId,
    ]);
    return filas.map((f) => ({
      id: txt(f.id),
      vehiculoId: txt(f.vehiculo_id),
      clienteId: txt(f.cliente_id),
      apto: f.apto === true,
      // El check de la columna (0020) garantiza el catálogo; el guard solo tipa lo que ya es cierto.
      motivoBloqueoCodigo: esCodigoMotivoBloqueo(f.motivo_bloqueo_codigo)
        ? f.motivo_bloqueo_codigo
        : null,
      motivoBloqueo: txtN(f.motivo_bloqueo),
      nota: txtN(f.motivo_bloqueo_nota),
      requisitos: (f.requisitos as Record<string, unknown> | null) ?? null,
      actualizadoEn: fecha(f.updated_at),
    }));
  }

  async guardarHabilitacion(h: HabilitacionRegistro): Promise<void> {
    await this.escribir(
      `insert into habilitaciones (id, vehiculo_id, cliente_id, apto, motivo_bloqueo,
                                   motivo_bloqueo_codigo, motivo_bloqueo_nota, requisitos)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       on conflict (vehiculo_id, cliente_id) do update set apto = excluded.apto,
         motivo_bloqueo = excluded.motivo_bloqueo, motivo_bloqueo_codigo = excluded.motivo_bloqueo_codigo,
         motivo_bloqueo_nota = excluded.motivo_bloqueo_nota, requisitos = excluded.requisitos,
         updated_at = now()`,
      [
        h.id,
        h.vehiculoId,
        h.clienteId,
        h.apto,
        h.motivoBloqueo,
        h.motivoBloqueoCodigo,
        h.nota,
        h.requisitos ? JSON.stringify(h.requisitos) : null,
      ],
    );
  }

  async recalcularEstadosDocumentos(hoy: string): Promise<number> {
    return enEscrituraPg(this.pool, async (c) => {
      const { rows } = await c.query<{ n: number }>(
        'select documentos_recalcular_estado($1::date) as n',
        [hoy],
      );
      return Number(rows[0]?.n ?? 0);
    });
  }
}
