import type {
  AlmacenMemoria,
  GeneradorIds,
  NotificacionOutbox,
  NuevaNotificacion,
} from '@asotracmet/domain';
import type {
  CierreAviso,
  FiltroNotificaciones,
  Notificacion,
  RepositorioNotificaciones,
} from './tipos.js';

// En memoria la outbox vive dentro del estado del dominio (`estado.outbox`): así el rollback de
// `AlmacenMemoria.ejecutar` también deshace el aviso, igual que en Postgres. La bandeja es propia.

function copiaAviso(a: NotificacionOutbox): NotificacionOutbox {
  return { ...a, destinos: a.destinos.map((d) => ({ ...d })), datos: { ...a.datos } };
}

function copiaNotificacion(n: Notificacion): Notificacion {
  return { ...n, datos: { ...n.datos }, canales: { ...n.canales } };
}

export class NotificacionesMemoria implements RepositorioNotificaciones {
  private bandeja: Notificacion[] = [];

  constructor(
    private readonly almacen: AlmacenMemoria,
    private readonly ids: GeneradorIds,
  ) {}

  private get outbox(): NotificacionOutbox[] {
    return this.almacen.estado.outbox;
  }

  async tomarPendientes(
    limite: number,
    ahora: string,
    reintentoMs: number,
  ): Promise<NotificacionOutbox[]> {
    const corte = Date.parse(ahora) - reintentoMs;
    const tomados = this.outbox
      .filter(
        (a) => a.procesadaEn === null && (a.tomadaEn === null || Date.parse(a.tomadaEn) < corte),
      )
      .sort((a, b) => a.creadaEn.localeCompare(b.creadaEn))
      .slice(0, limite);
    for (const a of tomados) {
      a.tomadaEn = ahora;
      a.intentos += 1;
    }
    return tomados.map(copiaAviso);
  }

  async cerrarAviso(id: string, cierre: CierreAviso, ahora: string): Promise<void> {
    const aviso = this.outbox.find((a) => a.id === id);
    if (!aviso) return;
    aviso.error = cierre.error;
    if (cierre.definitivo) aviso.procesadaEn = ahora;
  }

  async encolar(aviso: NuevaNotificacion, ahora: string): Promise<boolean> {
    const clave = aviso.clave ?? null;
    if (clave && this.outbox.some((a) => a.clave === clave)) return false;
    this.outbox.push({
      id: this.ids.nuevo(),
      evento: aviso.evento,
      destinos: aviso.destinos.map((d) => ({ ...d })),
      datos: { ...aviso.datos },
      clave,
      creadaEn: ahora,
      tomadaEn: null,
      intentos: 0,
      procesadaEn: null,
      error: null,
    });
    return true;
  }

  async pendientes(): Promise<number> {
    return this.outbox.filter((a) => a.procesadaEn === null).length;
  }

  async guardar(n: Notificacion): Promise<void> {
    if (
      n.outboxId &&
      this.bandeja.some((x) => x.outboxId === n.outboxId && x.usuarioId === n.usuarioId)
    ) {
      return;
    }
    this.bandeja.push(copiaNotificacion(n));
  }

  async deUsuario(usuarioId: string, filtro: FiltroNotificaciones = {}): Promise<Notificacion[]> {
    // Más reciente primero; con la misma marca de tiempo, la última insertada primero.
    return this.bandeja
      .filter((n) => n.usuarioId === usuarioId && (!filtro.soloNoLeidas || n.leidaEn === null))
      .reverse()
      .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn))
      .slice(0, filtro.limite ?? 50)
      .map(copiaNotificacion);
  }

  async marcarLeida(id: string, usuarioId: string, ahora: string): Promise<boolean> {
    const n = this.bandeja.find((x) => x.id === id && x.usuarioId === usuarioId);
    if (!n) return false;
    n.leidaEn ??= ahora;
    return true;
  }

  /** Reset e2e: la outbox se va con `almacen.reemplazar`; la bandeja aquí. */
  limpiar(): void {
    this.bandeja = [];
  }
}
