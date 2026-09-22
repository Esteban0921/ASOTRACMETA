import { z } from 'zod';
import { CLASES_COLA, ESTADOS_OFERTA, ESTADOS_REQUERIMIENTO, ESTADOS_TR } from './estados.js';
import { FECHA_ISO_REGEX } from './fechas.js';
import { PlacaSchema } from './placa.js';
import { ROLES } from './roles.js';

// Contratos de entrada de la API (spec §8). Se validan en la API y se reutilizan en el frontend.

export const FechaIsoSchema = z.string().regex(FECHA_ISO_REGEX, 'Fecha inválida: YYYY-MM-DD');

/** Sin contraseña: se envía un código (roles internos) o un enlace de acceso (`member`). */
export const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(200).optional(),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const SolicitarAccesoSchema = z.object({
  email: z.email(),
});

export const CodigoSeisDigitosSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'El código tiene seis dígitos');

export const VerificarTotpSchema = z.object({
  challenge: z.string().min(20),
  codigo: CodigoSeisDigitosSchema,
});
export type VerificarTotpInput = z.infer<typeof VerificarTotpSchema>;

export const VerificarOtpSchema = z.object({
  email: z.email(),
  codigo: CodigoSeisDigitosSchema,
});

export const CanjearEnlaceSchema = z.object({
  token: z.string().min(20).max(300),
});

export const ReauthSchema = z
  .object({
    password: z.string().min(8).max(200).optional(),
    codigo: CodigoSeisDigitosSchema.optional(),
  })
  .refine((v) => Boolean(v.password || v.codigo), {
    message: 'Indica la contraseña o el código del segundo factor',
  });

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

/**
 * `POST /requerimientos/:id/ofertas` (acta de turno, brief §5). `esperado` es lo que la sala vio en
 * la vista previa: la placa que saldría y la firma de la cola. El motor lo verifica y, si la cola
 * cambió, responde `CANDIDATO_CAMBIO` sin efectos. Sin `esperado` se ofrece como siempre.
 */
export const OfrecerSchema = z.object({
  esperado: z
    .object({
      vehiculoId: z.string().min(1),
      firma: z.string().regex(/^[0-9a-f]{16}$/, 'Firma inválida: 16 hex de FNV-1a 64'),
    })
    .optional(),
});
export type OfrecerInput = z.infer<typeof OfrecerSchema>;

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

/** `cola.override` (§7.1.5): mover una placa a una posición concreta, con motivo. */
export const OverrideColaSchema = z.object({
  vehiculoId: z.string().min(1),
  posicion: z.number().int().min(1),
  motivo: z.string().trim().min(3).max(500),
});
export type OverrideColaInput = z.infer<typeof OverrideColaSchema>;

/** Reset de cola por clase (§9.2): doble confirmación con el texto literal `RESETEAR`. */
export const ResetColaSchema = z.object({
  motivo: z.string().trim().min(3).max(500),
  confirmacion: z.literal('RESETEAR'),
  /** Placas que van primero, en ese orden; el resto sigue por placa. */
  orden: z.array(z.string().min(1)).max(500).optional(),
});
export type ResetColaInput = z.infer<typeof ResetColaSchema>;

// IAM (spec §8.2). Un usuario tiene un rol primario; `member` no tiene contraseña y sí placas.

export const CrearUsuarioSchema = z.object({
  email: z.email(),
  nombre: z.string().trim().min(2).max(120),
  rol: z.enum(ROLES),
  password: z.string().min(8).max(200).optional(),
  asociadoId: z.string().min(1).optional(),
  vehiculoIds: z.array(z.string().min(1)).max(50).optional(),
});
export type CrearUsuarioInput = z.infer<typeof CrearUsuarioSchema>;

export const ActualizarUsuarioSchema = z
  .object({
    nombre: z.string().trim().min(2).max(120).optional(),
    activo: z.boolean().optional(),
    asociadoId: z.string().min(1).nullable().optional(),
    /** `null` retira la contraseña (el usuario seguirá entrando con código por correo). */
    password: z.string().min(8).max(200).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });
export type ActualizarUsuarioInput = z.infer<typeof ActualizarUsuarioSchema>;

export const CambiarRolSchema = z.object({
  rol: z.enum(ROLES),
});

export const AsignarVehiculosSchema = z.object({
  vehiculoIds: z.array(z.string().min(1)).max(50),
});

export const FiltroAuditSchema = z.object({
  entidad: z.string().optional(),
  id: z.string().optional(),
  limite: z.coerce.number().int().min(1).max(500).default(100),
});
