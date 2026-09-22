import { z } from 'zod';

// Reglas de negocio como datos (spec §10, RULE-016). Cambiar un parámetro genera audit.

export const POLITICAS_DECLINACION = ['al_final', 'penaliza_n', 'bloqueo_horas'] as const;
export type PoliticaDeclinacion = (typeof POLITICAS_DECLINACION)[number];

export const POLITICAS_OFERTA_EXPIRADA = ['declina', 'reofertar'] as const;
export type PoliticaOfertaExpirada = (typeof POLITICAS_OFERTA_EXPIRADA)[number];

export const ParametrosSchema = z.object({
  recaudo_porcentaje: z.number().min(0).max(1),
  oferta_ttl_minutos: z.number().int().min(1),
  declinacion_politica: z.enum(POLITICAS_DECLINACION),
  declinacion_n: z.number().int().min(0),
  declinacion_bloqueo_horas: z.number().int().min(1),
  oferta_expirada_politica: z.enum(POLITICAS_OFERTA_EXPIRADA),
  un_tr_activo_por_placa: z.boolean(),
  posicion_por_placa: z.boolean(),
  bloquear_por_documento_vencido: z.boolean(),
  consume_posicion_al_aceptar: z.boolean(),
  tr_cancelado_regresa_al_mismo: z.boolean(),
  reset_cola_requiere_2fa: z.boolean(),
  secuencia_tr: z.object({
    prefix: z.string().min(1),
    next: z.number().int().min(1),
  }),
  timezone: z.string().min(1),
  /**
   * Avisos proactivos (spec §11, §14; TASK-0057). Cuántas posiciones elegibles de cada clase
   * reciben "estás de N.º: alista el vehículo", y hasta qué posición de la cola un documento
   * bloqueante vencido avisa que va a costar el turno. Enteros ≥ 1: son datos, no constantes.
   */
  aviso_proximo_turno_posiciones: z.number().int().min(1),
  aviso_documento_bloquea_posiciones: z.number().int().min(1),
  /**
   * Ubicación GPS (ADR-0007, TASK-0062). `gps_intervalo_minutos` es cada cuánto vuelve el agente
   * satélite: la API se lo devuelve en cada ingesta, así que cambiarlo aquí basta. El mínimo es 10
   * a propósito: cada corrida es un inicio de sesión en la plataforma del propietario y acortarlo
   * demasiado puede hacer que esa plataforma bloquee su cuenta. Los otros tres gobiernan cuándo
   * una posición deja de ser fresca, cuándo se declara "sin señal" y cuánto se conserva el
   * historial (dato personal del conductor: spec §12).
   */
  gps_intervalo_minutos: z.number().int().min(10).max(180),
  gps_frescura_minutos: z.number().int().min(1),
  gps_sin_senal_minutos: z.number().int().min(1),
  gps_retencion_dias: z.number().int().min(1).max(365),
});

export type Parametros = z.infer<typeof ParametrosSchema>;

export const PARAMETROS_DEFAULT: Parametros = {
  recaudo_porcentaje: 0.03,
  oferta_ttl_minutos: 120,
  declinacion_politica: 'al_final',
  declinacion_n: 1,
  declinacion_bloqueo_horas: 24,
  oferta_expirada_politica: 'declina',
  un_tr_activo_por_placa: true,
  posicion_por_placa: true,
  bloquear_por_documento_vencido: true,
  consume_posicion_al_aceptar: true,
  tr_cancelado_regresa_al_mismo: false,
  reset_cola_requiere_2fa: true,
  secuencia_tr: { prefix: 'TR-', next: 41947 },
  timezone: 'America/Bogota',
  aviso_proximo_turno_posiciones: 2,
  aviso_documento_bloquea_posiciones: 3,
  gps_intervalo_minutos: 20,
  gps_frescura_minutos: 30,
  gps_sin_senal_minutos: 120,
  gps_retencion_dias: 30,
};

export const PatchParametrosSchema = ParametrosSchema.partial();
export type PatchParametros = z.infer<typeof PatchParametrosSchema>;
