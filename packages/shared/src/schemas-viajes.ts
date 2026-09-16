import { z } from 'zod';
import { ESTADOS_RECAUDO, ESTADOS_VIAJE } from './estados.js';
import { FECHA_ISO_REGEX } from './fechas.js';

// Contratos de viajes y recaudos (spec §6.5, §8.4, §9.2 Finance). El viaje nace de un TR; el flete
// acordado gana a la tarifa sugerida; el recaudo se liquida con el parámetro vigente y queda como snapshot.

const Fecha = z.string().regex(FECHA_ISO_REGEX, 'Fecha inválida: YYYY-MM-DD');
const Texto = (max: number) => z.string().trim().max(max);
const Dinero = z.number().min(0).max(1_000_000_000);

export const MesSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes inválido: YYYY-MM');

const fechasCoherentes = (v: { fechaCargue?: string | null; fechaDescargue?: string | null }) =>
  !v.fechaCargue || !v.fechaDescargue || v.fechaDescargue >= v.fechaCargue;

export const CrearViajeSchema = z
  .object({
    trId: z.string().min(1),
    conductorId: z.string().min(1).optional(),
    fechaCargue: Fecha.optional(),
    fechaDescargue: Fecha.optional(),
    lugarDescargue: Texto(120).optional(),
    transportadoraId: z.string().min(1).optional(),
    /** Flete acordado con la transportadora; si falta, se fija después o al liquidar. */
    flete: Dinero.optional(),
    notas: Texto(500).optional(),
  })
  .refine(fechasCoherentes, { message: 'El descargue no puede ser anterior al cargue' });
export type CrearViajeInput = z.infer<typeof CrearViajeSchema>;

export const ActualizarViajeSchema = z
  .object({
    conductorId: z.string().min(1).nullable().optional(),
    fechaCargue: Fecha.nullable().optional(),
    fechaDescargue: Fecha.nullable().optional(),
    lugarDescargue: Texto(120).nullable().optional(),
    transportadoraId: z.string().min(1).nullable().optional(),
    flete: Dinero.nullable().optional(),
    notas: Texto(500).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });
export type ActualizarViajeInput = z.infer<typeof ActualizarViajeSchema>;

export const LiquidarViajeSchema = z.object({
  /** Permite fijar o corregir el flete en el mismo paso; después de liquidar ya no cambia. */
  flete: Dinero.optional(),
});

export const AnularViajeSchema = z.object({ motivo: Texto(200).min(3) });

export const RegistrarPagoSchema = z.object({
  valor: z.number().positive().max(1_000_000_000),
  fechaPago: Fecha,
  /** Número de consignación o comprobante. */
  referencia: Texto(60).optional(),
});
export type RegistrarPagoInput = z.infer<typeof RegistrarPagoSchema>;

export const FiltroViajesSchema = z.object({
  mes: MesSchema.optional(),
  estado: z.enum(ESTADOS_VIAJE).optional(),
  placa: z.string().trim().toUpperCase().optional(),
  trId: z.string().optional(),
});

export const FiltroRecaudosSchema = z.object({
  mes: MesSchema.optional(),
  estado: z.enum(ESTADOS_RECAUDO).optional(),
  placa: z.string().trim().toUpperCase().optional(),
});

export const ResumenMesSchema = z.object({ mes: MesSchema });
