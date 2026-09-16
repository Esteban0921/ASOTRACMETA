import { z } from 'zod';
import { CLASES_COLA, ESTADOS_OFERTA, ESTADOS_REQUERIMIENTO, ESTADOS_TR } from './estados.js';
import { FECHA_ISO_REGEX } from './fechas.js';
import { PlacaSchema } from './placa.js';

// Contratos de entrada de la API (spec §8). Se validan en la API y se reutilizan en el frontend.

export const FechaIsoSchema = z.string().regex(FECHA_ISO_REGEX, 'Fecha inválida: YYYY-MM-DD');

export const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(200),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const CrearRequerimientoSchema = z.object({
  clienteId: z.string().min(1),
  destinoId: z.string().min(1).optional(),
  claseCola: z.enum(CLASES_COLA),
  fechaServicio: FechaIsoSchema,
  cantidadCupos: z.number().int().min(1).max(50).default(1),
  observaciones: z.string().max(500).optional(),
});
export type CrearRequerimientoInput = z.infer<typeof CrearRequerimientoSchema>;

export const FiltroRequerimientosSchema = z.object({
  estado: z.enum(ESTADOS_REQUERIMIENTO).optional(),
  fecha: FechaIsoSchema.optional(),
});

export const DeclinarOfertaSchema = z.object({
  motivoId: z.string().min(1, 'Toda declinación pide motivo de catálogo'),
  nota: z.string().max(500).optional(),
});
export type DeclinarOfertaInput = z.infer<typeof DeclinarOfertaSchema>;

export const MotivoSchema = z.object({
  motivo: z.string().min(3).max(500),
});
export type MotivoInput = z.infer<typeof MotivoSchema>;

export const FiltroOfertasSchema = z.object({
  estado: z.enum(ESTADOS_OFERTA).optional(),
  requerimientoId: z.string().optional(),
});

export const FiltroTrsSchema = z.object({
  desde: FechaIsoSchema.optional(),
  hasta: FechaIsoSchema.optional(),
  placa: PlacaSchema.optional(),
  estado: z.enum(ESTADOS_TR).optional(),
});
export type FiltroTrsInput = z.infer<typeof FiltroTrsSchema>;

export const ClaseColaParamSchema = z.object({
  clase: z.enum(CLASES_COLA),
});

export const FiltroColaSchema = z.object({
  clienteId: z.string().optional(),
});

export const FiltroAuditSchema = z.object({
  entidad: z.string().optional(),
  id: z.string().optional(),
  limite: z.coerce.number().int().min(1).max(500).default(100),
});
