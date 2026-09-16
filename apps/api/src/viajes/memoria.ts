import type { AlmacenMemoria } from '@asotracmet/domain';
import { mesDeViaje } from '@asotracmet/shared';
import type { RepositorioMaestros } from '../maestros/tipos.js';
import type {
  FiltroRecaudos,
  FiltroViajes,
  RecaudoRegistro,
  RecaudoVista,
  RepositorioViajes,
  ViajeRegistro,
  ViajeVista,
} from './tipos.js';

// Adaptador en memoria (dev y e2e). Las vistas se arman con la proyección del dominio (TR, placa,
// asociado, cliente, destino) y con los maestros (transportadora, conductor).

function copia<T>(x: T): T {
  return structuredClone(x);
}

export class ViajesMemoria implements RepositorioViajes {
  private viajesMap = new Map<string, ViajeRegistro>();
  private recaudosMap = new Map<string, RecaudoRegistro>();

  constructor(
    private readonly almacen: AlmacenMemoria,
    private readonly maestros: RepositorioMaestros,
  ) {}

  /** Reset e2e: vuelve a cero (la semilla no trae viajes). */
  limpiar(): void {
    this.viajesMap.clear();
    this.recaudosMap.clear();
  }

  private async vista(v: ViajeRegistro): Promise<ViajeVista> {
    const estado = this.almacen.estado;
    const tr = estado.trs.find((t) => t.id === v.trId);
    const vehiculo = estado.vehiculos.find((x) => x.id === v.vehiculoId);
    const asociado = vehiculo
      ? estado.asociados.find((a) => a.id === vehiculo.asociadoId)
      : undefined;
    const cliente = tr ? estado.clientes.find((c) => c.id === tr.clienteId) : undefined;
    const destino = tr?.destinoId ? estado.destinos.find((d) => d.id === tr.destinoId) : undefined;
    const transportadora = v.transportadoraId
      ? (await this.maestros.transportadoras()).find((t) => t.id === v.transportadoraId)
      : undefined;
    const conductor = v.conductorId ? await this.maestros.conductor(v.conductorId) : undefined;
    const fechaAsignacion = tr?.fechaAsignacion ?? v.creadoEn.slice(0, 10);
    return {
      ...copia(v),
      trCodigo: tr?.codigo ?? '',
      trEstado: tr?.estado ?? 'asignado',
      fechaAsignacion,
      placa: vehiculo?.placa ?? '',
      clase: vehiculo?.clase ?? 'TM',
      claseCola: vehiculo?.claseCola ?? 'TM-CBZ',
      clienteId: tr?.clienteId ?? null,
      cliente: cliente?.codigo ?? null,
      destinoId: tr?.destinoId ?? null,
      destino: destino?.nombre ?? null,
      transportadora: transportadora?.nombre ?? null,
      conductor: conductor?.nombres ?? null,
      asociadoId: asociado?.id ?? null,
      asociadoNombre: asociado
        ? (asociado.razonSocial ?? `${asociado.nombres} ${asociado.apellidos ?? ''}`.trim())
        : null,
      asociadoDocumento: asociado?.documento ?? null,
      mes: mesDeViaje(v.fechaCargue, fechaAsignacion),
    };
  }

  private orden(a: ViajeVista, b: ViajeVista): number {
    const fa = a.fechaCargue ?? a.fechaAsignacion;
    const fb = b.fechaCargue ?? b.fechaAsignacion;
    return fb.localeCompare(fa) || b.creadoEn.localeCompare(a.creadoEn);
  }

  async viajes(filtro: FiltroViajes): Promise<ViajeVista[]> {
    const propias = filtro.vehiculoIds ? new Set(filtro.vehiculoIds) : null;
    const vistas = await Promise.all(
      [...this.viajesMap.values()]
        .filter((v) => !propias || propias.has(v.vehiculoId))
        .filter((v) => !filtro.estado || v.estado === filtro.estado)
        .filter((v) => !filtro.trId || v.trId === filtro.trId)
        .map((v) => this.vista(v)),
    );
    return vistas
      .filter((v) => !filtro.mes || v.mes === filtro.mes)
      .filter((v) => !filtro.placa || v.placa === filtro.placa)
      .sort((a, b) => this.orden(a, b));
  }

  async viaje(id: string): Promise<ViajeVista | undefined> {
    const v = this.viajesMap.get(id);
    return v ? this.vista(v) : undefined;
  }

  async viajePorTr(trId: string): Promise<ViajeVista | undefined> {
    const v = [...this.viajesMap.values()].find((x) => x.trId === trId);
    return v ? this.vista(v) : undefined;
  }

  async guardarViaje(viaje: ViajeRegistro): Promise<void> {
    this.viajesMap.set(viaje.id, copia(viaje));
  }

  private async vistaRecaudo(r: RecaudoRegistro): Promise<RecaudoVista | undefined> {
    const viaje = this.viajesMap.get(r.viajeId);
    if (!viaje) return undefined;
    const v = await this.vista(viaje);
    return {
      ...copia(r),
      trCodigo: v.trCodigo,
      placa: v.placa,
      vehiculoId: v.vehiculoId,
      asociadoNombre: v.asociadoNombre,
      asociadoDocumento: v.asociadoDocumento,
      flete: v.flete,
      valorPagado: v.valorPagado,
      mes: v.mes,
    };
  }

  async recaudos(filtro: FiltroRecaudos): Promise<RecaudoVista[]> {
    const propias = filtro.vehiculoIds ? new Set(filtro.vehiculoIds) : null;
    const vistas = await Promise.all(
      [...this.recaudosMap.values()].map((r) => this.vistaRecaudo(r)),
    );
    return vistas
      .filter((r): r is RecaudoVista => r !== undefined)
      .filter((r) => !propias || propias.has(r.vehiculoId))
      .filter((r) => !filtro.estado || r.estado === filtro.estado)
      .filter((r) => !filtro.mes || r.mes === filtro.mes)
      .filter((r) => !filtro.placa || r.placa === filtro.placa)
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  }

  async recaudo(id: string): Promise<RecaudoVista | undefined> {
    const r = this.recaudosMap.get(id);
    return r ? this.vistaRecaudo(r) : undefined;
  }

  async recaudoDeViaje(viajeId: string): Promise<RecaudoVista | undefined> {
    const r = [...this.recaudosMap.values()].find((x) => x.viajeId === viajeId);
    return r ? this.vistaRecaudo(r) : undefined;
  }

  async guardarRecaudo(recaudo: RecaudoRegistro): Promise<void> {
    this.recaudosMap.set(recaudo.id, copia(recaudo));
  }
}
