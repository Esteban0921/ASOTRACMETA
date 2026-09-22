import { ErrorDominio, type AlmacenMemoria, type Reloj } from '@asotracmet/domain';
import { motivoBloqueoDesdeTexto } from '@asotracmet/shared';
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
  SemillaMaestros,
  TarifaRegistro,
  TipoDocumentoRegistro,
  TransportadoraRegistro,
  VehiculoConductor,
  VehiculoRegistro,
} from './tipos.js';

// Adaptador en memoria de los maestros. Guarda la ficha completa y mantiene sincronizada la
// proyección del dominio (`almacen.estado`) para que el motor vea vehículos, documentos y
// habilitaciones nuevos.

function copia<T>(x: T): T {
  return structuredClone(x);
}

export class MaestrosMemoria implements RepositorioMaestros {
  private asociadosMap = new Map<string, AsociadoRegistro>();
  private vehiculosMap = new Map<string, VehiculoRegistro>();
  private conductoresMap = new Map<string, ConductorRegistro>();
  private vehiculoConductores: VehiculoConductor[] = [];
  private clientesMap = new Map<string, ClienteRegistro>();
  private destinosMap = new Map<string, DestinoRegistro>();
  private transportadorasMap = new Map<string, TransportadoraRegistro>();
  private tarifasMap = new Map<string, TarifaRegistro>();
  private tiposMap = new Map<string, TipoDocumentoRegistro>();
  private documentosMap = new Map<string, DocumentoRegistro>();
  private habilitacionesMap = new Map<string, HabilitacionRegistro>();

  constructor(
    private readonly almacen: AlmacenMemoria,
    private readonly reloj: Reloj,
  ) {}

  /** Reconstruye las fichas desde la proyección del dominio más los extras de la semilla. */
  cargar(semilla: SemillaMaestros): void {
    const estado = this.almacen.estado;
    const ahora = this.reloj.ahora().toISOString();
    this.asociadosMap = new Map(
      estado.asociados.map((a) => [
        a.id,
        {
          id: a.id,
          tipo: a.tipo,
          nombres: a.nombres,
          apellidos: a.apellidos,
          razonSocial: a.razonSocial,
          documento: a.documento,
          documentoTipo: a.tipo === 'empresa' ? 'NIT' : 'CC',
          celular: a.celular,
          correo: a.correo,
          direccion: null,
          cuentaBancariaEnc: null,
          estado: 'activo',
          fechaAfiliacion: null,
          creadoEn: ahora,
          actualizadoEn: ahora,
          eliminadoEn: null,
        },
      ]),
    );
    this.vehiculosMap = new Map(
      estado.vehiculos.map((v) => [
        v.id,
        {
          id: v.id,
          placa: v.placa,
          clase: v.clase,
          claseCola: v.claseCola,
          tipoCarroceria: null,
          modelo: null,
          repotenciacion: null,
          largoMts: null,
          kmRecorrido: null,
          asociadoId: v.asociadoId,
          propietarioNombre: null,
          propietarioDocumento: null,
          parentesco: null,
          trailerPlaca: null,
          gpsProveedor: null,
          estado: v.estado,
          noElegibleHasta: v.noElegibleHasta,
          creadoEn: ahora,
          actualizadoEn: ahora,
          eliminadoEn: null,
        },
      ]),
    );
    this.clientesMap = new Map(estado.clientes.map((c) => [c.id, { ...c, activo: true }]));
    this.destinosMap = new Map(estado.destinos.map((d) => [d.id, { ...d }]));
    this.habilitacionesMap = new Map(
      estado.habilitaciones.map((h) => {
        // La proyección del dominio solo guarda el nombre del motivo; el código y la nota se
        // recuperan del catálogo igual que hace la migración 0020 con una base anterior (TASK-0059).
        const motivo = h.apto ? null : motivoBloqueoDesdeTexto(h.motivoBloqueo);
        return [
          `${h.vehiculoId}:${h.clienteId}`,
          {
            id: `hab-${h.vehiculoId}-${h.clienteId}`,
            vehiculoId: h.vehiculoId,
            clienteId: h.clienteId,
            apto: h.apto,
            motivoBloqueoCodigo: motivo?.codigo ?? null,
            motivoBloqueo: motivo?.nombre ?? null,
            nota: motivo?.nota ?? null,
            requisitos: null,
            actualizadoEn: ahora,
          },
        ];
      }),
    );
    this.tiposMap = new Map(semilla.tiposDocumento.map((t) => [t.id, copia(t)]));
    this.transportadorasMap = new Map(semilla.transportadoras.map((t) => [t.id, copia(t)]));
    this.conductoresMap = new Map(semilla.conductores.map((c) => [c.id, copia(c)]));
    this.vehiculoConductores = semilla.vehiculoConductores.map(copia);
    this.tarifasMap = new Map(semilla.tarifas.map((t) => [t.id, copia(t)]));
    this.documentosMap = new Map(semilla.documentos.map((d) => [d.id, copia(d)]));
  }

  // --- Asociados ---------------------------------------------------------------------------------
  async asociados(opciones: OpcionesListado = {}): Promise<AsociadoRegistro[]> {
    return [...this.asociadosMap.values()]
      .filter((a) => opciones.incluirEliminados || !a.eliminadoEn)
      .sort((a, b) => a.documento.localeCompare(b.documento))
      .map(copia);
  }

  async asociado(id: string): Promise<AsociadoRegistro | undefined> {
    const a = this.asociadosMap.get(id);
    return a ? copia(a) : undefined;
  }

  async asociadoPorDocumento(documento: string): Promise<AsociadoRegistro | undefined> {
    const a = [...this.asociadosMap.values()].find((x) => x.documento === documento);
    return a ? copia(a) : undefined;
  }

  async guardarAsociado(asociado: AsociadoRegistro): Promise<void> {
    this.asociadosMap.set(asociado.id, copia(asociado));
    const proyeccion = {
      id: asociado.id,
      tipo: asociado.tipo,
      documento: asociado.documento,
      nombres: asociado.nombres ?? '',
      apellidos: asociado.apellidos,
      razonSocial: asociado.razonSocial,
      celular: asociado.celular,
      correo: asociado.correo,
    };
    const lista = this.almacen.estado.asociados;
    const indice = lista.findIndex((a) => a.id === asociado.id);
    if (indice === -1) lista.push(proyeccion);
    else lista[indice] = proyeccion;
  }

  // --- Vehículos ---------------------------------------------------------------------------------
  async vehiculos(opciones: OpcionesListado = {}): Promise<VehiculoRegistro[]> {
    return [...this.vehiculosMap.values()]
      .filter((v) => opciones.incluirEliminados || !v.eliminadoEn)
      .sort((a, b) => a.placa.localeCompare(b.placa))
      .map(copia);
  }

  async vehiculo(id: string): Promise<VehiculoRegistro | undefined> {
    const v = this.vehiculosMap.get(id);
    return v ? copia(v) : undefined;
  }

  async vehiculoPorPlaca(placa: string): Promise<VehiculoRegistro | undefined> {
    const v = [...this.vehiculosMap.values()].find((x) => x.placa === placa);
    return v ? copia(v) : undefined;
  }

  async guardarVehiculo(vehiculo: VehiculoRegistro): Promise<void> {
    this.vehiculosMap.set(vehiculo.id, copia(vehiculo));
    const proyeccion = {
      id: vehiculo.id,
      placa: vehiculo.placa,
      clase: vehiculo.clase,
      claseCola: vehiculo.claseCola,
      asociadoId: vehiculo.asociadoId,
      estado: vehiculo.estado,
      noElegibleHasta: vehiculo.noElegibleHasta,
    };
    const lista = this.almacen.estado.vehiculos;
    const indice = lista.findIndex((v) => v.id === vehiculo.id);
    if (indice === -1) lista.push(proyeccion);
    else lista[indice] = proyeccion;
  }

  async vehiculoTieneTrs(id: string): Promise<boolean> {
    return this.almacen.estado.trs.some((t) => t.vehiculoId === id);
  }

  // --- Conductores -------------------------------------------------------------------------------
  async conductores(opciones: OpcionesListado = {}): Promise<ConductorRegistro[]> {
    return [...this.conductoresMap.values()]
      .filter((c) => opciones.incluirEliminados || !c.eliminadoEn)
      .sort((a, b) => a.nombres.localeCompare(b.nombres))
      .map(copia);
  }

  async conductor(id: string): Promise<ConductorRegistro | undefined> {
    const c = this.conductoresMap.get(id);
    return c ? copia(c) : undefined;
  }

  async conductorPorDocumento(documento: string): Promise<ConductorRegistro | undefined> {
    const c = [...this.conductoresMap.values()].find((x) => x.documento === documento);
    return c ? copia(c) : undefined;
  }

  async guardarConductor(conductor: ConductorRegistro): Promise<void> {
    this.conductoresMap.set(conductor.id, copia(conductor));
  }

  async conductoresDe(
    vehiculoId: string,
  ): Promise<Array<VehiculoConductor & { conductor: ConductorRegistro }>> {
    return this.vehiculoConductores
      .filter((vc) => vc.vehiculoId === vehiculoId)
      .flatMap((vc) => {
        const conductor = this.conductoresMap.get(vc.conductorId);
        return conductor ? [{ ...vc, conductor: copia(conductor) }] : [];
      })
      .sort((a, b) => Number(b.esPrincipal) - Number(a.esPrincipal));
  }

  async asignarConductores(vehiculoId: string, asignaciones: VehiculoConductor[]): Promise<void> {
    this.vehiculoConductores = [
      ...this.vehiculoConductores.filter((vc) => vc.vehiculoId !== vehiculoId),
      ...asignaciones.map((a) => ({ ...a, vehiculoId })),
    ];
  }

  // --- Catálogos ---------------------------------------------------------------------------------
  async clientes(): Promise<ClienteRegistro[]> {
    return [...this.clientesMap.values()]
      .sort((a, b) => a.codigo.localeCompare(b.codigo))
      .map(copia);
  }

  async clientePorCodigo(codigo: string): Promise<ClienteRegistro | undefined> {
    const c = [...this.clientesMap.values()].find((x) => x.codigo === codigo);
    return c ? copia(c) : undefined;
  }

  async guardarCliente(cliente: ClienteRegistro): Promise<void> {
    this.clientesMap.set(cliente.id, copia(cliente));
    const proyeccion = {
      id: cliente.id,
      codigo: cliente.codigo,
      nombre: cliente.nombre,
      requiereHabilitacion: cliente.requiereHabilitacion,
    };
    const lista = this.almacen.estado.clientes;
    const indice = lista.findIndex((c) => c.id === cliente.id);
    if (indice === -1) lista.push(proyeccion);
    else lista[indice] = proyeccion;
  }

  async destinos(): Promise<DestinoRegistro[]> {
    return [...this.destinosMap.values()]
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map(copia);
  }

  async destinoPorNombre(nombre: string): Promise<DestinoRegistro | undefined> {
    const d = [...this.destinosMap.values()].find((x) => x.nombre === nombre);
    return d ? copia(d) : undefined;
  }

  async guardarDestino(destino: DestinoRegistro): Promise<void> {
    this.destinosMap.set(destino.id, copia(destino));
    const lista = this.almacen.estado.destinos;
    const indice = lista.findIndex((d) => d.id === destino.id);
    if (indice === -1) lista.push({ ...destino });
    else lista[indice] = { ...destino };
  }

  async transportadoras(): Promise<TransportadoraRegistro[]> {
    return [...this.transportadorasMap.values()]
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map(copia);
  }

  async transportadoraPorNombre(nombre: string): Promise<TransportadoraRegistro | undefined> {
    const t = [...this.transportadorasMap.values()].find((x) => x.nombre === nombre);
    return t ? copia(t) : undefined;
  }

  async guardarTransportadora(transportadora: TransportadoraRegistro): Promise<void> {
    this.transportadorasMap.set(transportadora.id, copia(transportadora));
  }

  // --- Tarifas -----------------------------------------------------------------------------------
  async tarifas(filtro: FiltroTarifas): Promise<TarifaRegistro[]> {
    return [...this.tarifasMap.values()]
      .filter((t) => !filtro.clienteId || t.clienteId === filtro.clienteId)
      .filter((t) => !filtro.destinoId || t.destinoId === filtro.destinoId)
      .filter((t) => !filtro.clase || t.clase === filtro.clase)
      .filter(
        (t) =>
          !filtro.vigentesEn ||
          (t.vigenciaDesde <= filtro.vigentesEn &&
            (t.vigenciaHasta === null || t.vigenciaHasta >= filtro.vigentesEn)),
      )
      .sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde))
      .map(copia);
  }

  async tarifa(id: string): Promise<TarifaRegistro | undefined> {
    const t = this.tarifasMap.get(id);
    return t ? copia(t) : undefined;
  }

  async guardarTarifa(tarifa: TarifaRegistro): Promise<void> {
    const duplicada = [...this.tarifasMap.values()].find(
      (t) =>
        t.id !== tarifa.id &&
        t.clienteId === tarifa.clienteId &&
        t.destinoId === tarifa.destinoId &&
        t.clase === tarifa.clase &&
        t.modalidad === tarifa.modalidad &&
        t.vigenciaDesde === tarifa.vigenciaDesde,
    );
    if (duplicada) {
      throw new ErrorDominio('TARIFA_DUPLICADA', 'Ya existe esa tarifa con la misma vigencia');
    }
    this.tarifasMap.set(tarifa.id, copia(tarifa));
  }

  // --- Documentos y habilitaciones -----------------------------------------------------------------
  async tiposDocumento(): Promise<TipoDocumentoRegistro[]> {
    return [...this.tiposMap.values()].sort((a, b) => a.codigo.localeCompare(b.codigo)).map(copia);
  }

  async documentos(filtro: FiltroDocumentos): Promise<DocumentoRegistro[]> {
    return [...this.documentosMap.values()]
      .filter((d) => filtro.incluirEliminados || !d.eliminadoEn)
      .filter((d) => !filtro.sujetoTipo || d.sujetoTipo === filtro.sujetoTipo)
      .filter((d) => !filtro.sujetoId || d.sujetoId === filtro.sujetoId)
      .sort((a, b) => (a.venceEn ?? '9999').localeCompare(b.venceEn ?? '9999'))
      .map(copia);
  }

  async documento(id: string): Promise<DocumentoRegistro | undefined> {
    const d = this.documentosMap.get(id);
    return d ? copia(d) : undefined;
  }

  async guardarDocumento(documento: DocumentoRegistro): Promise<void> {
    this.documentosMap.set(documento.id, copia(documento));
    const tipo = this.tiposMap.get(documento.tipoId);
    const lista = this.almacen.estado.documentos;
    const indice = lista.findIndex((d) => d.id === documento.id);
    // El motor solo necesita los documentos con vencimiento y no eliminados.
    if (!tipo || documento.eliminadoEn || !documento.venceEn) {
      if (indice !== -1) lista.splice(indice, 1);
      return;
    }
    const proyeccion = {
      id: documento.id,
      sujetoTipo: documento.sujetoTipo,
      sujetoId: documento.sujetoId,
      tipoCodigo: tipo.codigo,
      venceEn: documento.venceEn,
      bloqueante: tipo.bloqueante,
    };
    if (indice === -1) lista.push(proyeccion);
    else lista[indice] = proyeccion;
  }

  async habilitacionesDe(vehiculoId: string): Promise<HabilitacionRegistro[]> {
    return [...this.habilitacionesMap.values()]
      .filter((h) => h.vehiculoId === vehiculoId)
      .map(copia);
  }

  async guardarHabilitacion(habilitacion: HabilitacionRegistro): Promise<void> {
    this.habilitacionesMap.set(
      `${habilitacion.vehiculoId}:${habilitacion.clienteId}`,
      copia(habilitacion),
    );
    // El motor solo ve el nombre del catálogo (`elegibilidad.detalle`); la nota se queda aquí.
    const proyeccion = {
      vehiculoId: habilitacion.vehiculoId,
      clienteId: habilitacion.clienteId,
      apto: habilitacion.apto,
      motivoBloqueo: habilitacion.motivoBloqueo,
    };
    const lista = this.almacen.estado.habilitaciones;
    const indice = lista.findIndex(
      (h) => h.vehiculoId === habilitacion.vehiculoId && h.clienteId === habilitacion.clienteId,
    );
    if (indice === -1) lista.push(proyeccion);
    else lista[indice] = proyeccion;
  }

  async recalcularEstadosDocumentos(_hoy: string): Promise<number> {
    // El estado se calcula al leer (`estadoDocumento`), así que nunca queda desactualizado.
    return [...this.documentosMap.values()].filter((d) => !d.eliminadoEn).length;
  }
}
