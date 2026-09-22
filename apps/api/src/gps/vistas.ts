import { frescuraDe, type Parametros } from '@asotracmet/shared';
import type { UbicacionRegistro, VistaUbicacion } from './tipos.js';

// Proyección de la ubicación (ADR-0007). La frescura y los minutos los calcula el servidor con su
// propio reloj: el navegador no compara fechas (el reloj del celular se desvía, TASK-0058).

export function minutosDesde(instante: string, ahora: Date): number {
  const transcurridos = Math.floor((ahora.getTime() - new Date(instante).getTime()) / 60_000);
  return Math.max(0, transcurridos);
}

/**
 * `enmascarar` es `veEnmascarado(rol, 'vehiculos')`: el veedor (`R*`) recibe la frescura y el
 * "hace X min", nunca las coordenadas ni la velocidad (spec §3.2, criterio §20.11). Se aplica en
 * todas las rutas que devuelven ubicación, la ficha del vehículo incluida.
 */
export function vistaUbicacion(
  registro: UbicacionRegistro,
  placa: string,
  ahora: Date,
  parametros: Pick<Parametros, 'gps_frescura_minutos' | 'gps_sin_senal_minutos'>,
  enmascarar: boolean,
): VistaUbicacion {
  const minutos = minutosDesde(registro.capturadaEn, ahora);
  return {
    vehiculoId: registro.vehiculoId,
    placa,
    latitud: enmascarar ? null : registro.latitud,
    longitud: enmascarar ? null : registro.longitud,
    velocidadKmh: enmascarar ? null : registro.velocidadKmh,
    rumboGrados: enmascarar ? null : registro.rumboGrados,
    proveedor: registro.proveedor,
    capturadaEn: registro.capturadaEn,
    recibidaEn: registro.recibidaEn,
    minutosDesde: minutos,
    frescura: frescuraDe(minutos, parametros),
    enmascarada: enmascarar,
  };
}
