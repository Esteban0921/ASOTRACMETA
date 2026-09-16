import type {
  Actor,
  EstadoMemoria,
  Oferta,
  PosicionCola,
  Requerimiento,
  Tr,
} from '@asotracmet/domain';
import {
  enmascararCelular,
  enmascararDocumento,
  etiquetaAsociadoPlaca,
  veEnmascarado,
} from '@asotracmet/shared';

// Proyecciones de lectura para la API. Aquí se aplica el enmascarado `R*`.

function nombreAsociado(estado: EstadoMemoria, asociadoId: string): string {
  const a = estado.asociados.find((x) => x.id === asociadoId);
  if (!a) return 'ASOCIADO DESCONOCIDO';
  return a.razonSocial ?? `${a.nombres} ${a.apellidos ?? ''}`.trim();
}

export function vistaOferta(estado: EstadoMemoria, oferta: Oferta) {
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

export function vistaTr(estado: EstadoMemoria, tr: Tr) {
  const vehiculo = estado.vehiculos.find((v) => v.id === tr.vehiculoId);
  const cliente = estado.clientes.find((c) => c.id === tr.clienteId);
  const destino = tr.destinoId ? estado.destinos.find((d) => d.id === tr.destinoId) : null;
  return {
    ...tr,
    placa: vehiculo?.placa ?? null,
    cliente: cliente?.codigo ?? null,
    destino: destino?.nombre ?? null,
    etiqueta: vehiculo
      ? etiquetaAsociadoPlaca(nombreAsociado(estado, vehiculo.asociadoId), vehiculo.placa)
      : null,
  };
}

export function vistaRequerimiento(estado: EstadoMemoria, req: Requerimiento) {
  const cliente = estado.clientes.find((c) => c.id === req.clienteId);
  const destino = req.destinoId ? estado.destinos.find((d) => d.id === req.destinoId) : null;
  const vigentes = estado.trs.filter(
    (t) => t.requerimientoId === req.id && ['asignado', 'en_curso', 'cumplido'].includes(t.estado),
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

export function vistaPosicion(actor: Actor, posicion: PosicionCola) {
  const enmascarar = veEnmascarado(actor.rol, 'asociados');
  const asociado = posicion.asociado;
  const nombre = asociado
    ? (asociado.razonSocial ?? `${asociado.nombres} ${asociado.apellidos ?? ''}`.trim())
    : '';
  return {
    posicion: posicion.posicion,
    ciclo: posicion.ciclo,
    turnosOfrecidos: posicion.turnosOfrecidos,
    turnosTomados: posicion.turnosTomados,
    saltosPendientes: posicion.saltosPendientes,
    vehiculoId: posicion.vehiculoId,
    placa: posicion.vehiculo.placa,
    clase: posicion.vehiculo.clase,
    estadoVehiculo: posicion.vehiculo.estado,
    asociadoId: posicion.vehiculo.asociadoId,
    etiqueta: etiquetaAsociadoPlaca(nombre, posicion.vehiculo.placa),
    asociado: asociado
      ? {
          nombre,
          documento: enmascarar ? enmascararDocumento(asociado.documento) : asociado.documento,
          celular: enmascarar ? enmascararCelular(asociado.celular) : asociado.celular,
        }
      : null,
    elegibilidad: posicion.elegibilidad,
  };
}
