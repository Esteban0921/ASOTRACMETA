import type { Actor, PosicionCola } from '@asotracmet/domain';
import {
  enmascararCelular,
  enmascararDocumento,
  etiquetaAsociadoPlaca,
  veEnmascarado,
} from '@asotracmet/shared';

// Proyección de la cola. Viene del motor (`snapshotCola`), así que no depende del almacén.
// El resto de vistas las componen los adaptadores de `Consultas`.

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
