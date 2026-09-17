import { z } from 'zod';
import { CODIGOS_ERROR, type CodigoError } from './codigos-error.js';
import {
  CLASES_COLA,
  CLASES_VEHICULO,
  ESTADOS_DOCUMENTO,
  ESTADOS_OFERTA,
  ESTADOS_RECAUDO,
  ESTADOS_TR,
  ESTADOS_VEHICULO,
  ESTADOS_VIAJE,
} from './estados.js';
import { EVENTOS_NOTIFICACION } from './notificaciones.js';
import { ROLES } from './roles.js';

// Contrato de las respuestas de la API (TASK-0033): lo que la web puede dar por hecho de cada
// proyección. La API lo publica en `GET /api/v1/openapi.json` y lo valida en sus tests; la web
// deriva sus tipos de aquí (`apps/web/src/api/tipos.ts`). Las respuestas pueden traer campos de
// más (no son `strict`): añadir uno a la API no rompe el contrato; quitar uno documentado, sí.

const TextoONulo = z.string().nullable();
const NumeroONulo = z.number().nullable();
const ClaseColaSchema = z.enum(CLASES_COLA);
const ClaseVehiculoSchema = z.enum(CLASES_VEHICULO);
const EstadoDocumentoSchema = z.enum(ESTADOS_DOCUMENTO);

export const ErrorApiSchema = z.object({
  code: z.enum(Object.keys(CODIGOS_ERROR) as [CodigoError, ...CodigoError[]]),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

// --- Sesión y acceso (spec §3.3) ------------------------------------------------------------------

export const UsuarioSesionSchema = z.object({
  id: z.string(),
  email: z.string(),
  nombre: z.string(),
  rol: z.enum(ROLES),
  activo: z.boolean(),
  asociadoId: TextoONulo,
  vehiculoIds: z.array(z.string()),
  /** Si ya configuró el segundo factor. Nunca viaja el secreto. */
  totpConfigurado: z.boolean(),
});
export type UsuarioSesion = z.infer<typeof UsuarioSesionSchema>;

export const SesionSchema = z.object({
  token: z.string(),
  expiraEn: z.string(),
  usuario: UsuarioSesionSchema,
});
export type Sesion = z.infer<typeof SesionSchema>;

/** Respuesta de `POST /auth/login`: el acceso se completa en un segundo paso. */
export const RespuestaLoginSchema = z.discriminatedUnion('paso', [
  z.object({ paso: z.literal('codigo_enviado') }),
  z.object({ paso: z.literal('totp'), challenge: z.string() }),
  z.object({
    paso: z.literal('totp_enrolar'),
    challenge: z.string(),
    secret: z.string(),
    otpauthUrl: z.string(),
  }),
  SesionSchema.extend({ paso: z.literal('sesion') }),
]);
export type RespuestaLogin = z.infer<typeof RespuestaLoginSchema>;

export const MeSchema = UsuarioSesionSchema.extend({
  sesion: z.object({ expiraEn: z.string(), reauthHasta: z.string().nullable() }),
});

// --- Catálogos y operación (spec §7, §8.4, §8.5) ---------------------------------------------------

export const ClienteSchema = z.object({
  id: z.string(),
  codigo: z.string(),
  nombre: z.string(),
  requiereHabilitacion: z.boolean().optional(),
});
export type Cliente = z.infer<typeof ClienteSchema>;

export const MotivoDeclinacionSchema = z.object({
  id: z.string(),
  codigo: z.string(),
  nombre: z.string(),
});
export type MotivoDeclinacion = z.infer<typeof MotivoDeclinacionSchema>;

export const VistaRequerimientoSchema = z.object({
  id: z.string(),
  clienteId: z.string(),
  cliente: TextoONulo,
  clienteNombre: TextoONulo,
  destino: TextoONulo,
  claseCola: ClaseColaSchema,
  fechaServicio: z.string(),
  cantidadCupos: z.number(),
  cuposAsignados: z.number(),
  ofertasAbiertas: z.number(),
  cuposDisponibles: z.number(),
  observaciones: TextoONulo,
  estado: z.string(),
});
export type VistaRequerimiento = z.infer<typeof VistaRequerimientoSchema>;

export const VistaOfertaSchema = z.object({
  id: z.string(),
  requerimientoId: z.string(),
  vehiculoId: z.string(),
  placa: TextoONulo,
  claseCola: ClaseColaSchema.nullable(),
  etiqueta: TextoONulo,
  estado: z.enum(ESTADOS_OFERTA),
  ofrecidaEn: z.string(),
  expiraEn: z.string(),
  motivoDeclinacion: TextoONulo,
  nota: TextoONulo,
  requerimiento: VistaRequerimientoSchema.nullable(),
});
export type VistaOferta = z.infer<typeof VistaOfertaSchema>;

export const VistaTrSchema = z.object({
  id: z.string(),
  codigo: z.string(),
  placa: TextoONulo,
  cliente: TextoONulo,
  destino: TextoONulo,
  etiqueta: TextoONulo,
  fechaAsignacion: z.string(),
  estado: z.enum(ESTADOS_TR),
  motivoCancelacion: TextoONulo,
});
export type VistaTr = z.infer<typeof VistaTrSchema>;

export const ElegibilidadSchema = z.object({
  elegible: z.boolean(),
  motivo: TextoONulo,
  detalle: TextoONulo,
});
export type Elegibilidad = z.infer<typeof ElegibilidadSchema>;

export const VistaPosicionSchema = z.object({
  posicion: z.number(),
  ciclo: z.number(),
  turnosOfrecidos: z.number(),
  turnosTomados: z.number(),
  vehiculoId: z.string(),
  placa: z.string(),
  clase: z.string(),
  estadoVehiculo: z.string(),
  etiqueta: z.string(),
  asociado: z.object({ nombre: z.string(), documento: TextoONulo, celular: TextoONulo }).nullable(),
  elegibilidad: ElegibilidadSchema,
});
export type VistaPosicion = z.infer<typeof VistaPosicionSchema>;

export const VistaColaSchema = z.object({
  claseCola: ClaseColaSchema,
  clienteId: TextoONulo,
  total: z.number(),
  cabezaElegible: TextoONulo,
  posiciones: z.array(VistaPosicionSchema),
});
export type VistaCola = z.infer<typeof VistaColaSchema>;

export const MiPosicionSchema = z.object({
  placa: z.string(),
  claseCola: ClaseColaSchema,
  posicion: z.number(),
  total: z.number(),
});
export type MiPosicion = z.infer<typeof MiPosicionSchema>;

export const VistaVehiculoSchema = z.object({
  id: z.string(),
  placa: z.string(),
  clase: z.string(),
  claseCola: ClaseColaSchema,
  estado: z.string(),
  noElegibleHasta: TextoONulo,
  asociadoId: z.string(),
  asociado: z.object({ id: z.string(), nombre: z.string(), documento: TextoONulo }).nullable(),
  habilitaciones: z.array(
    z.object({
      clienteId: z.string(),
      cliente: TextoONulo,
      apto: z.boolean(),
      motivoBloqueo: TextoONulo,
    }),
  ),
});
export type VistaVehiculo = z.infer<typeof VistaVehiculoSchema>;

/** Evento de auditoría de `cola.override` / `cola.reset` (`GET /colas/:clase/intervenciones`). */
export const IntervencionSchema = z.object({
  id: z.string(),
  at: z.string(),
  actorId: z.string(),
  actorRol: z.string(),
  accion: z.string(),
  entidad: z.string(),
  entidadId: z.string(),
  before: z.unknown(),
  after: z
    .object({
      motivo: z.string().optional(),
      vehiculoId: z.string().optional(),
      posicion: z.number().optional(),
      orden: z.array(z.string()).optional(),
    })
    .nullable(),
});
export type Intervencion = z.infer<typeof IntervencionSchema>;

// --- Maestros (spec §6.2-6.4) -----------------------------------------------------------------------

export const VistaAsociadoSchema = z.object({
  id: z.string(),
  tipo: z.enum(['persona', 'empresa']),
  nombre: z.string(),
  nombres: TextoONulo,
  apellidos: TextoONulo,
  razonSocial: TextoONulo,
  documento: TextoONulo,
  documentoTipo: TextoONulo,
  celular: TextoONulo,
  correo: TextoONulo,
  direccion: TextoONulo,
  cuentaBancariaRegistrada: z.boolean(),
  estado: z.enum(['activo', 'inactivo', 'retirado']),
  fechaAfiliacion: TextoONulo,
  eliminadoEn: TextoONulo,
});
export type VistaAsociado = z.infer<typeof VistaAsociadoSchema>;

export const VistaVehiculoRegistroSchema = z.object({
  id: z.string(),
  placa: z.string(),
  clase: ClaseVehiculoSchema,
  claseCola: ClaseColaSchema,
  estado: z.enum(ESTADOS_VEHICULO),
  asociadoId: z.string(),
  tipoCarroceria: TextoONulo,
  modelo: NumeroONulo,
  repotenciacion: NumeroONulo,
  largoMts: NumeroONulo,
  kmRecorrido: NumeroONulo,
  propietarioNombre: TextoONulo,
  propietarioDocumento: TextoONulo,
  parentesco: TextoONulo,
  trailerPlaca: TextoONulo,
  gpsProveedor: TextoONulo,
  noElegibleHasta: TextoONulo,
  eliminadoEn: TextoONulo,
});
export type VistaVehiculoRegistro = z.infer<typeof VistaVehiculoRegistroSchema>;

export const TipoDocumentoSchema = z.object({
  id: z.string(),
  codigo: z.string(),
  nombre: z.string(),
  aplicaA: z.enum(['vehiculo', 'conductor']),
  bloqueante: z.boolean(),
  diasAlerta: z.number(),
});
export type TipoDocumento = z.infer<typeof TipoDocumentoSchema>;

export const VistaDocumentoSchema = z.object({
  id: z.string(),
  sujetoTipo: z.enum(['vehiculo', 'conductor']),
  sujetoId: z.string(),
  tipoId: z.string(),
  numero: TextoONulo,
  emitidoEn: TextoONulo,
  venceEn: TextoONulo,
  archivoUrl: TextoONulo,
  eliminadoEn: TextoONulo,
  tipo: TipoDocumentoSchema.nullable(),
  estado: EstadoDocumentoSchema,
  diasParaVencer: NumeroONulo,
});
export type VistaDocumento = z.infer<typeof VistaDocumentoSchema>;

/** `GET /documentos/alertas`: documentos vencidos o por vencer, del más urgente al menos. */
export const AlertaDocumentoSchema = VistaDocumentoSchema.extend({
  placa: TextoONulo,
  conductor: TextoONulo,
  sujeto: z.string(),
});
export type AlertaDocumento = z.infer<typeof AlertaDocumentoSchema>;

export const VistaHabilitacionSchema = z.object({
  id: z.string(),
  vehiculoId: z.string(),
  clienteId: z.string(),
  apto: z.boolean(),
  motivoBloqueo: TextoONulo,
  cliente: TextoONulo,
  clienteNombre: TextoONulo,
});
export type VistaHabilitacion = z.infer<typeof VistaHabilitacionSchema>;

export const VistaConductorFichaSchema = z.object({
  id: z.string(),
  nombres: z.string(),
  documento: z.string(),
  celular: TextoONulo,
  correo: TextoONulo,
  licenciaCategoria: TextoONulo,
  licenciaVence: TextoONulo,
  esPrincipal: z.boolean(),
});
export type VistaConductorFicha = z.infer<typeof VistaConductorFichaSchema>;

export const VistaFichaSchema = z.object({
  vehiculo: VistaVehiculoRegistroSchema,
  asociado: VistaAsociadoSchema.nullable(),
  conductores: z.array(VistaConductorFichaSchema),
  documentos: z.array(VistaDocumentoSchema),
  habilitaciones: z.array(VistaHabilitacionSchema),
  semaforo: EstadoDocumentoSchema,
  enCola: MiPosicionSchema.nullable(),
});
export type VistaFicha = z.infer<typeof VistaFichaSchema>;

export const SemaforoPlacaSchema = z.object({
  id: z.string(),
  placa: z.string(),
  clase: ClaseVehiculoSchema,
  claseCola: ClaseColaSchema,
  estado: z.enum(ESTADOS_VEHICULO),
  asociadoNombre: TextoONulo,
  semaforo: EstadoDocumentoSchema,
  vencidos: z.number(),
  porVencer: z.number(),
});
export type SemaforoPlaca = z.infer<typeof SemaforoPlacaSchema>;

export const TransportadoraSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  activo: z.boolean(),
});
export type Transportadora = z.infer<typeof TransportadoraSchema>;

// --- Viajes y recaudo (spec §6.5, §9.2 Finance) -----------------------------------------------------

export const TarifaSugeridaSchema = z.object({
  id: z.string(),
  modalidad: z.string(),
  valor: z.number(),
});
export type TarifaSugerida = z.infer<typeof TarifaSugeridaSchema>;

export const VistaRecaudoSchema = z.object({
  id: z.string(),
  viajeId: z.string(),
  asociadoId: z.string(),
  valor: z.number(),
  estado: z.enum(ESTADOS_RECAUDO),
  fechaPago: TextoONulo,
  referencia: TextoONulo,
  trCodigo: z.string(),
  placa: z.string(),
  asociadoNombre: TextoONulo,
  asociadoDocumento: TextoONulo,
  flete: NumeroONulo,
  valorPagado: z.number(),
  mes: z.string(),
});
export type VistaRecaudo = z.infer<typeof VistaRecaudoSchema>;

export const VistaViajeSchema = z.object({
  id: z.string(),
  trId: z.string(),
  trCodigo: z.string(),
  trEstado: z.enum(ESTADOS_TR),
  fechaAsignacion: z.string(),
  placa: z.string(),
  clase: ClaseVehiculoSchema,
  etiqueta: z.string(),
  cliente: TextoONulo,
  destino: TextoONulo,
  asociadoNombre: TextoONulo,
  asociadoDocumento: TextoONulo,
  conductorId: TextoONulo,
  conductor: TextoONulo,
  transportadoraId: TextoONulo,
  transportadora: TextoONulo,
  fechaCargue: TextoONulo,
  fechaDescargue: TextoONulo,
  lugarDescargue: TextoONulo,
  flete: NumeroONulo,
  porcentajeAplicado: NumeroONulo,
  valorRecaudo: NumeroONulo,
  valorPagado: z.number(),
  estado: z.enum(ESTADOS_VIAJE),
  notas: TextoONulo,
  mes: z.string(),
});
export type VistaViaje = z.infer<typeof VistaViajeSchema>;

export const DetalleViajeSchema = VistaViajeSchema.extend({
  tarifasSugeridas: z.array(TarifaSugeridaSchema),
  recaudo: VistaRecaudoSchema.nullable(),
});
export type DetalleViaje = z.infer<typeof DetalleViajeSchema>;

export const VistaResumenMesSchema = z.object({
  mes: z.string(),
  porcentajeVigente: z.number(),
  viajes: z.number(),
  liquidados: z.number(),
  flete: z.number(),
  recaudo: z.number(),
  pagado: z.number(),
  pendiente: z.number(),
  porCliente: z.array(
    z.object({ cliente: z.string(), viajes: z.number(), flete: z.number(), recaudo: z.number() }),
  ),
  porPlaca: z.array(
    z.object({
      placa: z.string(),
      asociado: TextoONulo,
      viajes: z.number(),
      flete: z.number(),
      recaudo: z.number(),
      pagado: z.number(),
    }),
  ),
});
export type ResumenMes = z.infer<typeof VistaResumenMesSchema>;

// --- Auditoría, tablero y avisos ----------------------------------------------------------------------

/** `GET /audit` (spec §6.6): append-only; `before`/`after` son JSON libres según la acción. */
export const EventoAuditoriaSchema = z.object({
  id: z.string(),
  at: z.string(),
  actorId: z.string(),
  actorRol: z.string(),
  accion: z.string(),
  entidad: z.string(),
  entidadId: TextoONulo,
  before: z.unknown(),
  after: z.unknown(),
});
export type EventoAuditoria = z.infer<typeof EventoAuditoriaSchema>;

export const MetricaPlacaSchema = z.object({
  vehiculoId: z.string(),
  placa: z.string(),
  claseCola: ClaseColaSchema,
  etiqueta: z.string(),
  ofrecidas: z.number(),
  tomadas: z.number(),
  declinadas: z.number(),
  expiradas: z.number(),
  anuladas: z.number(),
  trs: z.number(),
  viajes: z.number(),
  flete: z.number(),
  recaudo: z.number(),
  pagado: z.number(),
});
export type MetricaPlaca = z.infer<typeof MetricaPlacaSchema>;

export const TableroSchema = z.object({
  mes: z.string(),
  ofertas: z.object({
    ofrecidas: z.number(),
    aceptadas: z.number(),
    declinadas: z.number(),
    expiradas: z.number(),
    anuladas: z.number(),
    abiertas: z.number(),
  }),
  trs: z.object({
    asignados: z.number(),
    cumplidos: z.number(),
    cancelados: z.number(),
    noTramitar: z.number(),
  }),
  viajes: z.object({
    total: z.number(),
    liquidados: z.number(),
    flete: z.number(),
    recaudo: z.number(),
    pagado: z.number(),
    pendiente: z.number(),
  }),
  porClase: z.array(
    z.object({
      claseCola: ClaseColaSchema,
      ofrecidas: z.number(),
      tomadas: z.number(),
      declinadas: z.number(),
    }),
  ),
  declinacionesPorMotivo: z.array(z.object({ motivo: z.string(), total: z.number() })),
  equidad: z.array(MetricaPlacaSchema),
});
export type Tablero = z.infer<typeof TableroSchema>;

export const SnapshotMesSchema = z.object({
  mes: z.string(),
  generadoEn: z.string(),
  filas: z.array(MetricaPlacaSchema),
});

/** Bandeja de avisos (spec §11). */
export const NotificacionSchema = z.object({
  id: z.string(),
  evento: z.enum(EVENTOS_NOTIFICACION),
  asunto: z.string(),
  texto: z.string(),
  datos: z.record(z.string(), z.unknown()),
  canales: z.object({
    correo: z.enum(['enviada', 'fallida', 'omitida']).optional(),
    whatsapp: z.enum(['enviada', 'fallida', 'omitida']).optional(),
  }),
  creadaEn: z.string(),
  leidaEn: TextoONulo,
});
export type Notificacion = z.infer<typeof NotificacionSchema>;
