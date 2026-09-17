import type { EventoNotificacion } from '@asotracmet/shared';
import type { NotificacionOutbox, NuevaNotificacion } from '@asotracmet/domain';

// Notificaciones (spec §11, TASK-0026): la outbox la escribe el motor en su transacción
// (`Transaccion.notificar`); este puerto la consume y guarda la bandeja in-app por usuario.

export type EstadoEntrega = 'enviada' | 'fallida' | 'omitida';

/** Una fila por aviso y persona: la bandeja in-app, con el resultado de los demás canales. */
export interface Notificacion {
  id: string;
  outboxId: string | null;
  usuarioId: string;
  evento: EventoNotificacion;
  asunto: string;
  texto: string;
  datos: Record<string, unknown>;
  canales: Partial<Record<'correo' | 'whatsapp', EstadoEntrega>>;
  creadaEn: string;
  leidaEn: string | null;
}

export interface FiltroNotificaciones {
  soloNoLeidas?: boolean;
  limite?: number;
}

export interface CierreAviso {
  error: string | null;
  /** Cierra el aviso (con o sin error). Si es falso queda pendiente y se reintenta. */
  definitivo: boolean;
}

export interface RepositorioNotificaciones {
  /**
   * Toma hasta `limite` avisos pendientes (en Postgres con `for update skip locked`, así varias
   * instancias no se pisan), los marca como tomados y cuenta el intento. Un aviso tomado hace más
   * de `reintentoMs` sin cerrarse vuelve a salir (worker caído a medias).
   */
  tomarPendientes(
    limite: number,
    ahora: string,
    reintentoMs: number,
  ): Promise<NotificacionOutbox[]>;
  cerrarAviso(id: string, cierre: CierreAviso, ahora: string): Promise<void>;
  /** Jobs, fuera del motor: encola con idempotencia por `clave`. `false` si ya existía. */
  encolar(aviso: NuevaNotificacion, ahora: string): Promise<boolean>;
  pendientes(): Promise<number>;
  /** Bandeja: idempotente por (aviso, usuario). */
  guardar(notificacion: Notificacion): Promise<void>;
  deUsuario(usuarioId: string, filtro?: FiltroNotificaciones): Promise<Notificacion[]>;
  /** `false` si no existe o no es del usuario. Marcar dos veces no cambia la fecha. */
  marcarLeida(id: string, usuarioId: string, ahora: string): Promise<boolean>;
}
