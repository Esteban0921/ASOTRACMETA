import { z } from 'zod';

// Notificaciones (spec §11, TASK-0026): eventos cerrados, canales como datos (WhatsApp es un canal,
// nunca estado del TR) y preferencias por usuario. La bandeja in-app siempre recibe el aviso;
// correo y WhatsApp son opt-in.

export const EVENTOS_NOTIFICACION = [
  'oferta.abierta',
  'oferta.por_expirar',
  'oferta.declinada',
  'tr.asignado',
  'tr.cancelado',
  'documento.por_vencer',
  'recaudo.pendiente',
] as const;
export type EventoNotificacion = (typeof EVENTOS_NOTIFICACION)[number];

export const CANALES_NOTIFICACION = ['in_app', 'correo', 'whatsapp'] as const;
export type CanalNotificacion = (typeof CANALES_NOTIFICACION)[number];

/** Celular con indicativo (E.164 laxo): solo dígitos, `+` opcional. */
export const CELULAR_REGEX = /^\+?[0-9]{10,15}$/;

export const PreferenciasNotificacionSchema = z
  .object({
    correo: z.boolean(),
    whatsapp: z.boolean(),
    celular: z
      .string()
      .trim()
      .regex(CELULAR_REGEX, 'Celular inválido: solo dígitos, con indicativo (+57...)')
      .nullable(),
  })
  .refine((p) => !p.whatsapp || p.celular !== null, {
    message: 'Para recibir WhatsApp hace falta un celular',
    path: ['celular'],
  });
export type PreferenciasNotificacion = z.infer<typeof PreferenciasNotificacionSchema>;

export const PREFERENCIAS_POR_DEFECTO: PreferenciasNotificacion = {
  correo: true,
  whatsapp: false,
  celular: null,
};

/** Normaliza lo que venga de la base o de un cliente viejo sin perder el valor por defecto. */
export function preferenciasDesde(valor: unknown): PreferenciasNotificacion {
  const parseado = PreferenciasNotificacionSchema.safeParse(valor);
  return parseado.success ? parseado.data : { ...PREFERENCIAS_POR_DEFECTO };
}

export const FiltroNotificacionesSchema = z.object({
  noLeidas: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  limite: z.coerce.number().int().min(1).max(200).optional(),
});
