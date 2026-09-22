import type {
  AlmacenMemoria,
  EstadoMemoria,
  EventoAuditoria,
  Oferta,
  OfertaSalto,
  Requerimiento,
  Tr,
} from '@asotracmet/domain';
import {
  ESTADOS_TR_VIGENTES,
  enmascararDocumento,
  etiquetaAsociadoPlaca,
  fechaLocal,
  type ClaseCola,
  type Parametros,
} from '@asotracmet/shared';
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

// Adaptador de lectura sobre el almacén en memoria (fase puente).

function nombreAsociado(estado: EstadoMemoria, asociadoId: string): string {
  const a = estado.asociados.find((x) => x.id === asociadoId);
  if (!a) return 'ASOCIADO DESCONOCIDO';
  return a.razonSocial ?? `${a.nombres} ${a.apellidos ?? ''}`.trim();
}

export function vistaRequerimiento(estado: EstadoMemoria, req: Requerimiento): VistaRequerimiento {
  const cliente = estado.clientes.find((c) => c.id === req.clienteId);
  const destino = req.destinoId ? estado.destinos.find((d) => d.id === req.destinoId) : null;
  const vigentes = estado.trs.filter(
    (t) => t.requerimientoId === req.id && ESTADOS_TR_VIGENTES.includes(t.estado),
  ).length;
  const abiertas = estado.ofertas.filter(
    (o) => o.requerimientoId === req.id && o.estado === 'abierta',
  ).length;
  return {
    ...req,
    cliente: cliente?.codigo ?? null,
    clienteNombre: cliente?.nombre ?? null,
    destino: destino?.nombre ?? null,
    cuposAsignados: vigentes,
    ofertasAbiertas: abiertas,
    cuposDisponibles: Math.max(req.cantidadCupos - vigentes - abiertas, 0),
  };
}

export function vistaOferta(estado: EstadoMemoria, oferta: Oferta): VistaOferta {
  const vehiculo = estado.vehiculos.find((v) => v.id === oferta.vehiculoId);
  const requerimiento = estado.requerimientos.find((r) => r.id === oferta.requerimientoId);
  const motivo = oferta.motivoDeclinacionId
    ? estado.motivosDeclinacion.find((m) => m.id === oferta.motivoDeclinacionId)
    : null;
  return {
    ...oferta,
    placa: vehiculo?.placa ?? null,
    claseCola: vehiculo?.claseCola ?? null,
    etiqueta: vehiculo
      ? etiquetaAsociadoPlaca(nombreAsociado(estado, oferta.asociadoId), vehiculo.placa)
      : null,
    motivoDeclinacion: motivo?.nombre ?? null,
    requerimiento: requerimiento ? vistaRequerimiento(estado, requerimiento) : null,
  };
}

export function vistaTr(estado: EstadoMemoria, tr: Tr): VistaTr {
  const vehiculo = estado.vehiculos.find((v) => v.id === tr.vehiculoId);
  const cliente = estado.clientes.find((c) => c.id === tr.clienteId);
  const destino = tr.destinoId ? estado.destinos.find((d) => d.id === tr.destinoId) : null;
  const { version: _version, ...resto } = tr;
  return {
    ...resto,
    placa: vehiculo?.placa ?? null,
    cliente: cliente?.codigo ?? null,
    destino: destino?.nombre ?? null,
    etiqueta: vehiculo
      ? etiquetaAsociadoPlaca(nombreAsociado(estado, vehiculo.asociadoId), vehiculo.placa)
      : null,
  };
}

function vistaSalto(estado: EstadoMemoria, salto: OfertaSalto): VistaSalto {
  const vehiculo = estado.vehiculos.find((v) => v.id === salto.vehiculoId);
  return {
    id: salto.id,
    ofertaId: salto.ofertaId,
    vehiculoId: salto.vehiculoId,
    placa: salto.placa,
    etiqueta: etiquetaAsociadoPlaca(
      vehiculo ? nombreAsociado(estado, vehiculo.asociadoId) : 'ASOCIADO DESCONOCIDO',
      salto.placa,
    ),
    posicion: salto.posicion,
    motivo: salto.motivo,
    detalle: salto.detalle,
    creadoEn: salto.creadoEn,
  };
}

/** `undefined` si la oferta o su requerimiento no existen: equivale al `join` del adaptador Postgres. */
function vistaSaltoPropio(estado: EstadoMemoria, salto: OfertaSalto): VistaSaltoPropio | undefined {
  const oferta = estado.ofertas.find((o) => o.id === salto.ofertaId);
  const requerimiento = oferta
    ? estado.requerimientos.find((r) => r.id === oferta.requerimientoId)
    : undefined;
  if (!oferta || !requerimiento) return undefined;
  const cliente = estado.clientes.find((c) => c.id === requerimiento.clienteId);
  const destino = requerimiento.destinoId
    ? estado.destinos.find((d) => d.id === requerimiento.destinoId)
    : null;
  return {
    ...vistaSalto(estado, salto),
    claseCola: requerimiento.claseCola,
    requerimientoId: requerimiento.id,
    cliente: cliente?.codigo ?? null,
    destino: destino?.nombre ?? null,
    fechaServicio: requerimiento.fechaServicio,
    ofertaEstado: oferta.estado,
  };
}

export class ConsultasMemoria implements Consultas {
  constructor(private readonly almacen: AlmacenMemoria) {}

  private get estado(): EstadoMemoria {
    return this.almacen.estado;
  }

  async clientes(): Promise<VistaCliente[]> {
    return this.estado.clientes.map((c) => ({ ...c }));
  }

  async destinos(): Promise<VistaDestino[]> {
    return this.estado.destinos
      .filter((d) => d.activo)
      .map((d) => ({ id: d.id, nombre: d.nombre, km: d.km }));
  }

  async motivosDeclinacion(): Promise<VistaMotivo[]> {
    return this.estado.motivosDeclinacion
      .filter((m) => m.activo)
      .map((m) => ({ id: m.id, codigo: m.codigo, nombre: m.nombre }));
  }

  async vehiculos(opciones: {
    vehiculoIds?: readonly string[];
    enmascarar: boolean;
  }): Promise<VistaVehiculo[]> {
    const propias = opciones.vehiculoIds ? new Set(opciones.vehiculoIds) : null;
    return this.estado.vehiculos
      .filter((v) => !propias || propias.has(v.id))
      .map((v) => {
        const asociado = this.estado.asociados.find((a) => a.id === v.asociadoId);
        return {
          id: v.id,
          placa: v.placa,
          clase: v.clase,
          claseCola: v.claseCola,
          estado: v.estado,
          noElegibleHasta: v.noElegibleHasta,
          asociadoId: v.asociadoId,
          asociado: asociado
            ? {
                id: asociado.id,
                nombre:
                  asociado.razonSocial ?? `${asociado.nombres} ${asociado.apellidos ?? ''}`.trim(),
                documento: opciones.enmascarar
                  ? enmascararDocumento(asociado.documento)
                  : asociado.documento,
              }
            : null,
          habilitaciones: this.estado.habilitaciones
            .filter((h) => h.vehiculoId === v.id)
            .map((h) => ({
              clienteId: h.clienteId,
              cliente: this.estado.clientes.find((c) => c.id === h.clienteId)?.codigo ?? null,
              apto: h.apto,
              motivoBloqueo: h.motivoBloqueo,
            })),
        };
      });
  }

  async requerimientos(filtro: FiltroRequerimientos): Promise<VistaRequerimiento[]> {
    return this.estado.requerimientos
      .filter((r) => !filtro.estado || r.estado === filtro.estado)
      .filter((r) => !filtro.fecha || r.fechaServicio === filtro.fecha)
      .sort((a, b) => a.fechaServicio.localeCompare(b.fechaServicio))
      .map((r) => vistaRequerimiento(this.estado, r));
  }

  async requerimientoPorId(id: string): Promise<VistaRequerimiento | undefined> {
    const req = this.estado.requerimientos.find((r) => r.id === id);
    return req ? vistaRequerimiento(this.estado, req) : undefined;
  }

  async ofertas(filtro: FiltroOfertas): Promise<VistaOferta[]> {
    const propias = filtro.vehiculoIds ? new Set(filtro.vehiculoIds) : null;
    return this.estado.ofertas
      .filter((o) => !propias || propias.has(o.vehiculoId))
      .filter((o) => !filtro.estado || o.estado === filtro.estado)
      .filter((o) => !filtro.requerimientoId || o.requerimientoId === filtro.requerimientoId)
      .sort((a, b) => b.ofrecidaEn.localeCompare(a.ofrecidaEn))
      .map((o) => vistaOferta(this.estado, o));
  }

  async ofertaPorId(id: string): Promise<VistaOferta | undefined> {
    const oferta = this.estado.ofertas.find((o) => o.id === id);
    return oferta ? vistaOferta(this.estado, oferta) : undefined;
  }

  async trs(filtro: FiltroTrs): Promise<VistaTr[]> {
    const propias = filtro.vehiculoIds ? new Set(filtro.vehiculoIds) : null;
    return this.estado.trs
      .filter((t) => !propias || propias.has(t.vehiculoId))
      .filter((t) => !filtro.estado || t.estado === filtro.estado)
      .filter((t) => !filtro.desde || t.fechaAsignacion >= filtro.desde)
      .filter((t) => !filtro.hasta || t.fechaAsignacion <= filtro.hasta)
      .map((t) => vistaTr(this.estado, t))
      .filter((t) => !filtro.placa || t.placa === filtro.placa)
      .sort((a, b) => b.codigo.localeCompare(a.codigo));
  }

  async trPorId(id: string): Promise<VistaTr | undefined> {
    const tr = this.estado.trs.find((t) => t.id === id);
    return tr ? vistaTr(this.estado, tr) : undefined;
  }

  async posicionesDeVehiculos(vehiculoIds: readonly string[]): Promise<MiPosicion[]> {
    const propias = new Set(vehiculoIds);
    const resultado: MiPosicion[] = [];
    for (const vehiculo of this.estado.vehiculos.filter((v) => propias.has(v.id))) {
      const posiciones = this.estado.posiciones.filter((p) => p.claseCola === vehiculo.claseCola);
      const mia = posiciones.find((p) => p.vehiculoId === vehiculo.id);
      if (mia) {
        resultado.push({
          placa: vehiculo.placa,
          claseCola: vehiculo.claseCola,
          posicion: mia.posicion,
          total: posiciones.length,
        });
      }
    }
    return resultado.sort((a, b) => a.placa.localeCompare(b.placa));
  }

  async saltosDeOferta(ofertaId: string): Promise<VistaSalto[]> {
    return this.estado.saltos
      .filter((s) => s.ofertaId === ofertaId)
      .sort((a, b) => a.posicion - b.posicion)
      .map((s) => vistaSalto(this.estado, s));
  }

  async saltosDeVehiculos(
    vehiculoIds: readonly string[],
    rango: RangoFechas = {},
  ): Promise<VistaSaltoPropio[]> {
    const propias = new Set(vehiculoIds);
    const { timezone } = this.estado.parametros;
    const fecha = (s: OfertaSalto) => fechaLocal(new Date(s.creadoEn), timezone);
    return [...this.estado.saltos]
      .reverse() // a igual instante (reloj fijo en tests), el último registrado primero
      .filter((s) => propias.has(s.vehiculoId))
      .filter((s) => !rango.desde || fecha(s) >= rango.desde)
      .filter((s) => !rango.hasta || fecha(s) <= rango.hasta)
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
      .flatMap((s) => vistaSaltoPropio(this.estado, s) ?? []);
  }

  async saltosPorClase(claseCola: ClaseCola, mes: string): Promise<VistaSaltoAgregado[]> {
    const { timezone } = this.estado.parametros;
    const agregados = new Map<string, VistaSaltoAgregado>();
    for (const salto of this.estado.saltos) {
      const propio = vistaSaltoPropio(this.estado, salto);
      if (!propio || propio.claseCola !== claseCola) continue;
      if (!fechaLocal(new Date(salto.creadoEn), timezone).startsWith(`${mes}-`)) continue;
      const clave = `${salto.vehiculoId}:${salto.motivo}`;
      const actual = agregados.get(clave);
      if (actual) actual.total += 1;
      else {
        agregados.set(clave, {
          vehiculoId: salto.vehiculoId,
          placa: salto.placa,
          etiqueta: propio.etiqueta,
          motivo: salto.motivo,
          total: 1,
        });
      }
    }
    return [...agregados.values()].sort(
      (a, b) => a.placa.localeCompare(b.placa) || a.motivo.localeCompare(b.motivo),
    );
  }

  async parametros(): Promise<Parametros> {
    return this.estado.parametros;
  }

  async audit(filtro: FiltroAudit): Promise<EventoAuditoria[]> {
    const permitidas = filtro.entidadesPermitidas;
    return this.estado.auditoria
      .filter((e) => permitidas === null || permitidas.includes(e.entidad))
      .filter((e) => !filtro.entidad || e.entidad === filtro.entidad)
      .filter((e) => !filtro.entidadId || e.entidadId === filtro.entidadId)
      .filter((e) => !filtro.acciones || filtro.acciones.includes(e.accion))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, filtro.limite);
  }
}
