import { z } from 'zod';
import { FRESCURAS_GPS, type FrescuraGps } from './estados.js';
import { PLACA_REGEX } from './placa.js';
import type { Parametros } from './parametros.js';

// Ubicación GPS de la flota (ADR-0007, spec §19 fase 4; TASK-0062).
//
// El agente satélite es el único que habla con las plataformas de GPS; la API solo recibe esto.
// Los esquemas son `strict` a propósito (minimización, spec §12): lo que el proveedor traiga de
// más —nombre del conductor, teléfono, identificador del equipo— hace fallar el lote en vez de
// colarse en la base. Aquí no hay, ni habrá, ningún campo de credenciales (RULE-021, §20.9).

/** Tamaño máximo de un lote: una corrida del agente por cuenta, no un volcado histórico. */
export const LOTE_GPS_MAX = 500;
/** Placas desconocidas que la respuesta enumera; el resto solo se cuenta. */
export const PLACAS_DESCONOCIDAS_MAX = 20;
/** Margen de reloj tolerado hacia el futuro: más allá, la captura se descarta como inválida. */
export const GPS_TOLERANCIA_FUTURO_MINUTOS = 5;

/**
 * Una lectura del GPS ya normalizada. La placa viaja como texto con el formato del dominio: el
 * agente la normaliza antes (`normalizarPlaca`), y aquí se valida con la expresión, no con
 * `PlacaSchema`, porque ese es un `pipe` con `transform` que el documento OpenAPI no puede
 * describir.
 */
export const UbicacionGpsSchema = z
  .object({
    placa: z.string().regex(PLACA_REGEX, 'Placa inválida: se espera formato AAA123'),
    latitud: z.number().min(-90).max(90),
    longitud: z.number().min(-180).max(180),
    velocidadKmh: z.number().min(0).max(300).optional(),
    rumboGrados: z.number().min(0).lt(360).optional(),
    /** Instante que reporta la plataforma, con zona horaria explícita. */
    capturadaEn: z.iso.datetime({ offset: true }),
    /** Plataforma de la que salió (`SATRACK`, `rastreoflotas`…). Nunca su usuario ni su clave. */
    proveedor: z.string().min(1).max(60),
  })
  .strict();
export type UbicacionGps = z.infer<typeof UbicacionGpsSchema>;

/**
 * Lo que el agente envía en cada corrida: un lote por cuenta. `ubicaciones` admite cero elementos
 * porque el agente manda un lote vacío al arrancar para comprobar el token antes de entrar a
 * ninguna plataforma (un token mal rotado no debe quemar intentos de acceso de los propietarios).
 */
export const LoteUbicacionesGpsSchema = z
  .object({
    loteId: z.uuid(),
    /** Identificador opaco de la cuenta del archivo de secretos. Nunca el usuario real. */
    cuentaId: z.string().min(1).max(40),
    ubicaciones: z.array(UbicacionGpsSchema).max(LOTE_GPS_MAX),
  })
  .strict();
export type LoteUbicacionesGps = z.infer<typeof LoteUbicacionesGpsSchema>;

/** Respuesta de la ingesta: qué se guardó y cada cuánto debe volver el agente. */
export const ResultadoIngestaGpsSchema = z.object({
  loteId: z.string(),
  recibidas: z.number(),
  guardadas: z.number(),
  /** Ya estaban (misma placa y mismo instante): el reintento de un lote no duplica. */
  duplicadas: z.number(),
  /** Descartadas por placa desconocida, vehículo no activo o instante fuera de rango. */
  ignoradas: z.number(),
  vehiculosInactivos: z.number(),
  /** La placa reporta desde una plataforma distinta a la declarada en su ficha. */
  proveedorDistinto: z.number(),
  placasDesconocidas: z.array(z.string()),
  intervaloMinutos: z.number(),
});
export type ResultadoIngestaGps = z.infer<typeof ResultadoIngestaGpsSchema>;

/** Rango del recorrido de una placa (`GET /vehiculos/:id/ubicaciones`, TASK-0066). */
export const FiltroHistorialGpsSchema = z.object({
  desde: z.iso.datetime({ offset: true }).optional(),
  hasta: z.iso.datetime({ offset: true }).optional(),
  limite: z.coerce.number().int().min(1).max(2000).optional(),
});
export type FiltroHistorialGps = z.infer<typeof FiltroHistorialGpsSchema>;

type ParametrosFrescura = Pick<Parametros, 'gps_frescura_minutos' | 'gps_sin_senal_minutos'>;

/**
 * Frescura de una lectura según su antigüedad en minutos. `null` (la placa nunca reportó) y
 * cualquier antigüedad mayor que `gps_sin_senal_minutos` son `sin_senal`. Es pura: la API la
 * calcula con su propio reloj para que la web no dependa del reloj del teléfono.
 */
export function frescuraDe(minutos: number | null, parametros: ParametrosFrescura): FrescuraGps {
  if (minutos === null || minutos >= parametros.gps_sin_senal_minutos) return 'sin_senal';
  if (minutos >= parametros.gps_frescura_minutos) return 'desactualizada';
  return 'reciente';
}

export function esFrescuraGps(valor: string): valor is FrescuraGps {
  return (FRESCURAS_GPS as readonly string[]).includes(valor);
}

/** Cotejo tolerante del proveedor declarado en la ficha con el que reporta la plataforma. */
export function mismoProveedorGps(declarado: string | null, reportado: string): boolean {
  if (!declarado) return true;
  const normaliza = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');
  return normaliza(declarado) === normaliza(reportado);
}
