import type pg from 'pg';
import type { EventoNotificacion } from '@asotracmet/shared';
import type {
  DestinoNotificacion,
  NotificacionOutbox,
  NuevaNotificacion,
} from '@asotracmet/domain';
import { enEscrituraPg, enLecturaPg } from '../persistencia/postgres.js';
import type {
  CierreAviso,
  FiltroNotificaciones,
  Notificacion,
  RepositorioNotificaciones,
} from './tipos.js';

// Tablas `notificaciones_outbox` y `notificaciones` (migración 0016). La outbox la inserta el
// motor dentro de su transacción (`TransaccionPostgres.notificar`); aquí se consume y se lleva la
// bandeja. `tomarPendientes` usa `for update skip locked`: varias instancias no se pisan.

type Fila = Record<string, unknown>;

const iso = (v: unknown): string | null =>
  v instanceof Date ? v.toISOString() : v === null || v === undefined ? null : String(v);
const objeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

function aAviso(f: Fila): NotificacionOutbox {
  return {
    id: String(f.id),
    evento: String(f.evento) as EventoNotificacion,
    destinos: (Array.isArray(f.destinos) ? f.destinos : []) as DestinoNotificacion[],
    datos: objeto(f.datos),
    clave: f.clave === null || f.clave === undefined ? null : String(f.clave),
    creadaEn: iso(f.creada_en) ?? '',
    tomadaEn: iso(f.tomada_en),
    intentos: Number(f.intentos ?? 0),
    procesadaEn: iso(f.procesada_en),
    error: f.error === null || f.error === undefined ? null : String(f.error),
  };
}

function aNotificacion(f: Fila): Notificacion {
  return {
    id: String(f.id),
    outboxId: f.outbox_id === null || f.outbox_id === undefined ? null : String(f.outbox_id),
    usuarioId: String(f.usuario_id),
    evento: String(f.evento) as EventoNotificacion,
    asunto: String(f.asunto),
    texto: String(f.texto),
    datos: objeto(f.datos),
    canales: objeto(f.canales) as Notificacion['canales'],
    creadaEn: iso(f.creada_en) ?? '',
    leidaEn: iso(f.leida_en),
  };
}

export class NotificacionesPostgres implements RepositorioNotificaciones {
  constructor(private readonly pool: pg.Pool) {}

  async tomarPendientes(
    limite: number,
    ahora: string,
    reintentoMs: number,
  ): Promise<NotificacionOutbox[]> {
    return enEscrituraPg(this.pool, async (c) => {
      const { rows } = await c.query<Fila>(
        `update notificaciones_outbox o
            set tomada_en = $2::timestamptz, intentos = o.intentos + 1
          where o.id in (
            select id
              from notificaciones_outbox
             where procesada_en is null
               and (tomada_en is null
                    or tomada_en < $2::timestamptz - ($3::int * interval '1 millisecond'))
             order by creada_en
             limit $1
             for update skip locked)
        returning o.*`,
        [limite, ahora, reintentoMs],
      );
      return rows.map(aAviso);
    });
  }

  async cerrarAviso(id: string, cierre: CierreAviso, ahora: string): Promise<void> {
    await enEscrituraPg(this.pool, (c) =>
      c.query(
        `update notificaciones_outbox
            set error = $2,
                procesada_en = case when $3::boolean then $4::timestamptz else procesada_en end
          where id = $1`,
        [id, cierre.error, cierre.definitivo, ahora],
      ),
    );
  }

  async encolar(aviso: NuevaNotificacion, ahora: string): Promise<boolean> {
    const resultado = await enEscrituraPg(this.pool, (c) =>
      c.query(
        `insert into notificaciones_outbox (evento, destinos, datos, clave, creada_en)
         values ($1, $2::jsonb, $3::jsonb, $4, $5::timestamptz)
         on conflict (clave) do nothing`,
        [
          aviso.evento,
          JSON.stringify(aviso.destinos),
          JSON.stringify(aviso.datos),
          aviso.clave ?? null,
          ahora,
        ],
      ),
    );
    return (resultado.rowCount ?? 0) > 0;
  }

  async pendientes(): Promise<number> {
    return enLecturaPg(this.pool, async (c) => {
      const { rows } = await c.query<{ n: string }>(
        'select count(*)::text as n from notificaciones_outbox where procesada_en is null',
      );
      return Number(rows[0]?.n ?? 0);
    });
  }

  async guardar(n: Notificacion): Promise<void> {
    await enEscrituraPg(this.pool, (c) =>
      c.query(
        `insert into notificaciones
           (id, outbox_id, usuario_id, evento, asunto, texto, datos, canales, creada_en, leida_en)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::timestamptz, $10::timestamptz)
         on conflict (outbox_id, usuario_id) where outbox_id is not null do nothing`,
        [
          n.id,
          n.outboxId,
          n.usuarioId,
          n.evento,
          n.asunto,
          n.texto,
          JSON.stringify(n.datos),
          JSON.stringify(n.canales),
          n.creadaEn,
          n.leidaEn,
        ],
      ),
    );
  }

  async deUsuario(usuarioId: string, filtro: FiltroNotificaciones = {}): Promise<Notificacion[]> {
    return enLecturaPg(this.pool, async (c) => {
      const { rows } = await c.query<Fila>(
        `select * from notificaciones
          where usuario_id = $1 and (not $2::boolean or leida_en is null)
          order by creada_en desc, id desc
          limit $3`,
        [usuarioId, filtro.soloNoLeidas === true, filtro.limite ?? 50],
      );
      return rows.map(aNotificacion);
    });
  }

  async marcarLeida(id: string, usuarioId: string, ahora: string): Promise<boolean> {
    const resultado = await enEscrituraPg(this.pool, (c) =>
      c.query(
        `update notificaciones set leida_en = coalesce(leida_en, $3::timestamptz)
          where id = $1 and usuario_id = $2`,
        [id, usuarioId, ahora],
      ),
    );
    return (resultado.rowCount ?? 0) > 0;
  }
}
