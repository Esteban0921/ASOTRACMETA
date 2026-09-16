import {
  diasParaVencer,
  enmascararCelular,
  enmascararDocumento,
  estadoDocumento,
  peorEstadoDocumento,
  type EstadoDocumento,
} from '@asotracmet/shared';
import type {
  AsociadoRegistro,
  ClienteRegistro,
  ConductorRegistro,
  DocumentoRegistro,
  HabilitacionRegistro,
  TipoDocumentoRegistro,
  VehiculoRegistro,
} from './tipos.js';

// Proyecciones de los maestros. `enmascarar` aplica el `R*` de la spec §3.2 (viewer):
// cédula `******1658`, sin celular completo, sin correo, sin dirección. La cuenta bancaria nunca sale.

export function nombreAsociado(
  a: Pick<AsociadoRegistro, 'nombres' | 'apellidos' | 'razonSocial'>,
): string {
  return a.razonSocial ?? `${a.nombres ?? ''} ${a.apellidos ?? ''}`.trim();
}

export function vistaAsociado(a: AsociadoRegistro, enmascarar: boolean) {
  return {
    id: a.id,
    tipo: a.tipo,
    nombres: a.nombres,
    apellidos: a.apellidos,
    razonSocial: a.razonSocial,
    nombre: nombreAsociado(a),
    documento: enmascarar ? enmascararDocumento(a.documento) : a.documento,
    documentoTipo: a.documentoTipo,
    celular: enmascarar ? enmascararCelular(a.celular) : a.celular,
    correo: enmascarar ? null : a.correo,
    direccion: enmascarar ? null : a.direccion,
    /** Solo si hay cuenta registrada; el valor cifrado no viaja jamás. */
    cuentaBancariaRegistrada: a.cuentaBancariaEnc !== null,
    estado: a.estado,
    fechaAfiliacion: a.fechaAfiliacion,
    creadoEn: a.creadoEn,
    actualizadoEn: a.actualizadoEn,
    eliminadoEn: a.eliminadoEn,
  };
}

export function vistaVehiculo(v: VehiculoRegistro, enmascarar: boolean) {
  return {
    ...v,
    propietarioDocumento: enmascarar
      ? enmascararDocumento(v.propietarioDocumento)
      : v.propietarioDocumento,
  };
}

export function vistaConductor(c: ConductorRegistro, enmascarar: boolean) {
  return {
    ...c,
    documento: enmascarar ? (enmascararDocumento(c.documento) ?? '') : c.documento,
    celular: enmascarar ? enmascararCelular(c.celular) : c.celular,
    correo: enmascarar ? null : c.correo,
  };
}

export function vistaDocumento(
  d: DocumentoRegistro,
  tipo: TipoDocumentoRegistro | undefined,
  hoy: string,
  enmascarar: boolean,
) {
  return {
    ...d,
    numero: enmascarar ? enmascararDocumento(d.numero) : d.numero,
    tipo: tipo
      ? {
          id: tipo.id,
          codigo: tipo.codigo,
          nombre: tipo.nombre,
          aplicaA: tipo.aplicaA,
          bloqueante: tipo.bloqueante,
          diasAlerta: tipo.diasAlerta,
        }
      : null,
    estado: estadoDocumento(d.venceEn, hoy, tipo?.diasAlerta ?? 30),
    diasParaVencer: diasParaVencer(d.venceEn, hoy),
  };
}

export type VistaDocumento = ReturnType<typeof vistaDocumento>;

export function vistaHabilitacion(h: HabilitacionRegistro, cliente: ClienteRegistro | undefined) {
  return {
    ...h,
    cliente: cliente?.codigo ?? null,
    clienteNombre: cliente?.nombre ?? null,
  };
}

/** Color de la placa: el peor estado de sus documentos bloqueantes (spec §9.2 HSEQ). */
export function semaforoDe(documentos: readonly VistaDocumento[]): EstadoDocumento {
  return peorEstadoDocumento(documentos.filter((d) => d.tipo?.bloqueante).map((d) => d.estado));
}
