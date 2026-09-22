import { z } from 'zod';
import { CLASES_VEHICULO, ESTADOS_VEHICULO } from './estados.js';
import { FECHA_ISO_REGEX } from './fechas.js';
import { MotivoBloqueoSchema } from './motivos-bloqueo.js';
import { PlacaSchema } from './placa.js';

// Contratos de entrada de los maestros (spec §6.2-6.4, §8.3). Soft delete siempre; nunca DELETE físico.

const Fecha = z.string().regex(FECHA_ISO_REGEX, 'Fecha inválida: YYYY-MM-DD');
const Texto = (max: number) => z.string().trim().max(max);

export const TIPOS_ASOCIADO = ['persona', 'empresa'] as const;
export const TIPOS_DOCUMENTO_IDENTIDAD = ['CC', 'CE', 'NIT', 'PASAPORTE'] as const;
export const ESTADOS_ASOCIADO = ['activo', 'inactivo', 'retirado'] as const;
export const SUJETOS_DOCUMENTO = ['vehiculo', 'conductor'] as const;

// --- Asociados ---------------------------------------------------------------------------------
const AsociadoBase = z.object({
  tipo: z.enum(TIPOS_ASOCIADO),
  nombres: Texto(120).optional(),
  apellidos: Texto(120).optional(),
  razonSocial: Texto(160).optional(),
  documento: z.string().trim().min(5).max(20),
  documentoTipo: z.enum(TIPOS_DOCUMENTO_IDENTIDAD).optional(),
  celular: Texto(20).optional(),
  correo: z.email().optional(),
  direccion: Texto(200).optional(),
  /** Se cifra en aplicación (AES-GCM) y nunca vuelve completa por la API. */
  cuentaBancaria: z.string().trim().min(6).max(40).optional(),
  fechaAfiliacion: Fecha.optional(),
});

export const CrearAsociadoSchema = AsociadoBase.refine(
  (a) => (a.tipo === 'persona' ? Boolean(a.nombres) : Boolean(a.razonSocial)),
  { message: 'Una persona necesita nombres; una empresa, razón social' },
);
export type CrearAsociadoInput = z.infer<typeof CrearAsociadoSchema>;

export const ActualizarAsociadoSchema = AsociadoBase.partial()
  .extend({ estado: z.enum(ESTADOS_ASOCIADO).optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });

// --- Vehículos ---------------------------------------------------------------------------------
const VehiculoFicha = z.object({
  asociadoId: z.string().min(1),
  tipoCarroceria: Texto(40).optional(),
  modelo: z.number().int().min(1950).max(2100).optional(),
  repotenciacion: z.number().int().min(1950).max(2100).optional(),
  largoMts: z.number().min(0).max(40).optional(),
  kmRecorrido: z.number().int().min(0).optional(),
  propietarioNombre: Texto(120).optional(),
  propietarioDocumento: Texto(20).optional(),
  parentesco: Texto(40).optional(),
  trailerPlaca: Texto(10).optional(),
  /** Solo el proveedor. Nunca una contraseña (spec §12). */
  gpsProveedor: Texto(60).optional(),
});

export const CrearVehiculoSchema = VehiculoFicha.extend({
  placa: PlacaSchema,
  clase: z.enum(CLASES_VEHICULO),
});
export type CrearVehiculoInput = z.infer<typeof CrearVehiculoSchema>;

export const ActualizarVehiculoSchema = VehiculoFicha.partial()
  .extend({
    clase: z.enum(CLASES_VEHICULO).optional(),
    estado: z.enum(ESTADOS_VEHICULO).optional(),
    /** Obligatorio al cambiar estado o clase: queda en la auditoría de la cola. */
    motivo: Texto(300).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' })
  .refine((v) => !(v.estado || v.clase) || Boolean(v.motivo && v.motivo.length >= 3), {
    message: 'Cambiar el estado o la clase exige un motivo',
  });
export type ActualizarVehiculoInput = z.infer<typeof ActualizarVehiculoSchema>;

// --- Conductores -------------------------------------------------------------------------------
const ConductorBase = z.object({
  nombres: z.string().trim().min(2).max(160),
  documento: z.string().trim().min(5).max(20),
  celular: Texto(20).optional(),
  correo: z.email().optional(),
  asociadoId: z.string().min(1).optional(),
  licenciaCategoria: Texto(10).optional(),
  licenciaVence: Fecha.optional(),
});
export const CrearConductorSchema = ConductorBase;
export const ActualizarConductorSchema = ConductorBase.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'Nada que actualizar' },
);

export const AsignarConductoresSchema = z
  .object({
    conductores: z
      .array(z.object({ conductorId: z.string().min(1), esPrincipal: z.boolean().default(false) }))
      .max(10),
  })
  .refine((v) => v.conductores.filter((c) => c.esPrincipal).length <= 1, {
    message: 'Solo puede haber un conductor principal',
  });

// --- Catálogos ---------------------------------------------------------------------------------
export const CrearClienteSchema = z.object({
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(20)
    .regex(/^[A-Z0-9_]+$/, 'Código en mayúsculas, números o guion bajo'),
  nombre: z.string().trim().min(2).max(120),
  requiereHabilitacion: z.boolean().default(true),
});
export const ActualizarClienteSchema = z
  .object({
    nombre: z.string().trim().min(2).max(120).optional(),
    requiereHabilitacion: z.boolean().optional(),
    activo: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });

export const CrearDestinoSchema = z.object({
  nombre: z.string().trim().toUpperCase().min(2).max(120),
  km: z.number().int().min(0).max(5000).optional(),
});
export const ActualizarDestinoSchema = z
  .object({
    nombre: z.string().trim().toUpperCase().min(2).max(120).optional(),
    km: z.number().int().min(0).max(5000).nullable().optional(),
    activo: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });

export const CrearTransportadoraSchema = z.object({
  nombre: z.string().trim().toUpperCase().min(2).max(120),
});
export const ActualizarTransportadoraSchema = z
  .object({
    nombre: z.string().trim().toUpperCase().min(2).max(120).optional(),
    activo: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });

// --- Tarifas (spec §6.4: una tarifa tiene vigencia; no hay celda mágica) -------------------------
export const CrearTarifaSchema = z
  .object({
    clienteId: z.string().min(1),
    origen: z.string().trim().toUpperCase().min(2).max(80).default('VILLAVICENCIO'),
    destinoId: z.string().min(1),
    clase: z.enum(CLASES_VEHICULO),
    modalidad: z.string().trim().toLowerCase().min(2).max(40),
    valor: z.number().min(0).max(1_000_000_000),
    vigenciaDesde: Fecha,
    vigenciaHasta: Fecha.optional(),
  })
  .refine((t) => !t.vigenciaHasta || t.vigenciaHasta >= t.vigenciaDesde, {
    message: 'La vigencia termina antes de empezar',
  });
export type CrearTarifaInput = z.infer<typeof CrearTarifaSchema>;

export const ActualizarTarifaSchema = z
  .object({
    valor: z.number().min(0).max(1_000_000_000).optional(),
    vigenciaHasta: Fecha.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });

export const FiltroTarifasSchema = z.object({
  clienteId: z.string().optional(),
  destinoId: z.string().optional(),
  clase: z.enum(CLASES_VEHICULO).optional(),
  /** Solo tarifas vigentes en esa fecha. */
  vigentesEn: Fecha.optional(),
});

// --- Documentos y habilitaciones (spec §6.3) ------------------------------------------------------
export const CrearDocumentoSchema = z.object({
  sujetoTipo: z.enum(SUJETOS_DOCUMENTO),
  sujetoId: z.string().min(1),
  tipoId: z.string().min(1),
  numero: Texto(60).optional(),
  emitidoEn: Fecha.optional(),
  venceEn: Fecha.optional(),
  /** URL en object storage; nunca el archivo dentro de la base (spec §6.3). */
  archivoUrl: z.url().max(500).optional(),
});
export type CrearDocumentoInput = z.infer<typeof CrearDocumentoSchema>;

export const ActualizarDocumentoSchema = z
  .object({
    numero: Texto(60).nullable().optional(),
    emitidoEn: Fecha.nullable().optional(),
    venceEn: Fecha.nullable().optional(),
    archivoUrl: z.url().max(500).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });

export const FiltroDocumentosSchema = z.object({
  sujetoTipo: z.enum(SUJETOS_DOCUMENTO).optional(),
  sujetoId: z.string().optional(),
});

export const GuardarHabilitacionSchema = z
  .object({
    apto: z.boolean(),
    /**
     * Motivo del catálogo cerrado (TASK-0059). Ya no se acepta texto libre: el nombre del catálogo
     * es lo que llega a la cola y al acta de turno.
     */
    motivoBloqueoCodigo: MotivoBloqueoSchema.optional(),
    /** Detalle interno de HSEQ. Puede ser sensible: solo sale en la ficha (spec §12). */
    nota: Texto(200).optional(),
    /** Snapshot de los checks del TURNERO (antigüedad, km, cursos). */
    requisitos: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((h) => h.apto || h.motivoBloqueoCodigo !== undefined, {
    message: 'Una placa no apta necesita un motivo de bloqueo del catálogo',
    path: ['motivoBloqueoCodigo'],
  })
  .refine(
    (h) => h.apto || h.motivoBloqueoCodigo !== 'OTRO' || Boolean(h.nota && h.nota.length >= 3),
    { message: 'El motivo "Otro" necesita una nota que lo explique', path: ['nota'] },
  );
export type GuardarHabilitacionInput = z.infer<typeof GuardarHabilitacionSchema>;

export const FiltroMaestrosSchema = z.object({
  incluirEliminados: z.coerce.boolean().optional(),
});
