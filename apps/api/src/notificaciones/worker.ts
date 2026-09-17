import type {
  DestinoNotificacion,
  GeneradorIds,
  NotificacionOutbox,
  Reloj,
} from '@asotracmet/domain';
import type { Mensaje, Mensajeria } from '../auth/mensajeria.js';
import type { Consultas } from '../consultas/tipos.js';
import type { RepositorioMaestros } from '../maestros/tipos.js';
import type { RepositorioUsuarios, Usuario } from '../usuarios.js';
import { redactar } from './plantillas.js';
import type { EstadoEntrega, Notificacion, RepositorioNotificaciones } from './tipos.js';

// Worker de notificaciones (spec §11, §18 "un outbox simple"; ADR-0006): consume la outbox,
// resuelve destinatarios (asociado/placa o rol), redacta con plantillas y entrega por los canales
// que cada usuario tenga activos. La bandeja in-app siempre; correo y WhatsApp según preferencia.
// Un fallo de canal no bloquea al resto: queda anotado en la fila (`canales.correo = 'fallida'`).

export type Registro = (
  nivel: 'info' | 'warn',
  datos: Record<string, unknown>,
  mensaje: string,
) => void;

export interface DepsWorker {
  notificaciones: RepositorioNotificaciones;
  usuarios: RepositorioUsuarios;
  consultas: Consultas;
  maestros: RepositorioMaestros;
  mensajeria: Mensajeria;
  reloj: Reloj;
  ids: GeneradorIds;
  urlWeb: string;
  /** Intentos antes de cerrar un aviso con error (por defecto 5). */
  maxIntentos?: number;
  /** Tiempo tras el cual un aviso tomado y no cerrado vuelve a salir (por defecto 60 s). */
  reintentoMs?: number;
  log?: Registro;
}

export interface ResultadoWorker {
  avisos: number;
  entregas: number;
  fallos: number;
}

/** Usuarios activos a los que va un aviso: por rol interno, por usuario o por asociado/placa (member). */
export function destinatarios(usuarios: Usuario[], destinos: DestinoNotificacion[]): Usuario[] {
  const elegidos = new Map<string, Usuario>();
  for (const u of usuarios) {
    if (!u.activo) continue;
    for (const d of destinos) {
      const porRol = d.rol !== undefined && u.rol === d.rol;
      const porUsuario = d.usuarioId !== undefined && u.id === d.usuarioId;
      const porAsociado =
        u.rol === 'member' &&
        ((d.asociadoId !== undefined && u.asociadoId === d.asociadoId) ||
          (d.vehiculoId !== undefined && u.vehiculoIds.includes(d.vehiculoId)));
      if (porRol || porUsuario || porAsociado) elegidos.set(u.id, u);
    }
  }
  return [...elegidos.values()];
}

export class WorkerNotificaciones {
  private temporizador: NodeJS.Timeout | null = null;
  private enCurso: Promise<ResultadoWorker> | null = null;

  constructor(private readonly deps: DepsWorker) {}

  /** Una pasada. Reentrante: si ya hay una en curso devuelve esa misma promesa. */
  procesar(limite = 50): Promise<ResultadoWorker> {
    if (this.enCurso) return this.enCurso;
    this.enCurso = this.pasada(limite).finally(() => {
      this.enCurso = null;
    });
    return this.enCurso;
  }

  iniciar(intervaloMs: number): void {
    if (this.temporizador) return;
    this.temporizador = setInterval(() => {
      void this.procesar().catch((error: unknown) =>
        this.deps.log?.('warn', { err: error }, 'notificaciones: pasada fallida'),
      );
    }, intervaloMs);
    this.temporizador.unref();
  }

  detener(): void {
    if (this.temporizador) clearInterval(this.temporizador);
    this.temporizador = null;
  }

  private async pasada(limite: number): Promise<ResultadoWorker> {
    const { notificaciones, reloj, ids } = this.deps;
    const ahora = reloj.ahora().toISOString();
    const avisos = await notificaciones.tomarPendientes(
      limite,
      ahora,
      this.deps.reintentoMs ?? 60_000,
    );
    const resultado: ResultadoWorker = { avisos: avisos.length, entregas: 0, fallos: 0 };
    if (avisos.length === 0) return resultado;

    const [usuarios, vehiculos, clientes, parametros] = await Promise.all([
      this.deps.usuarios.listar(),
      this.deps.maestros.vehiculos({ incluirEliminados: true }),
      this.deps.consultas.clientes(),
      this.deps.consultas.parametros(),
    ]);
    const placas = new Map(vehiculos.map((v) => [v.id, v.placa]));
    const nombresCliente = new Map(clientes.map((c) => [c.id, c.nombre]));

    for (const aviso of avisos) {
      try {
        const datos = enriquecer(aviso, placas, nombresCliente);
        const { asunto, texto } = redactar(aviso.evento, datos, {
          urlWeb: this.deps.urlWeb,
          timezone: parametros.timezone,
        });
        for (const usuario of destinatarios(usuarios, aviso.destinos)) {
          const canales: Notificacion['canales'] = {};
          if (usuario.preferencias.correo) {
            canales.correo = await this.entregar({
              canal: 'correo',
              para: usuario.email,
              asunto,
              texto,
            });
          }
          if (usuario.preferencias.whatsapp && usuario.preferencias.celular) {
            canales.whatsapp = await this.entregar({
              canal: 'celular',
              para: usuario.preferencias.celular,
              asunto,
              texto,
            });
          }
          await notificaciones.guardar({
            id: ids.nuevo(),
            outboxId: aviso.id,
            usuarioId: usuario.id,
            evento: aviso.evento,
            asunto,
            texto,
            datos,
            canales,
            creadaEn: ahora,
            leidaEn: null,
          });
          resultado.entregas += 1;
          resultado.fallos += Object.values(canales).filter((c) => c === 'fallida').length;
        }
        await notificaciones.cerrarAviso(aviso.id, { error: null, definitivo: true }, ahora);
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        const definitivo = aviso.intentos >= (this.deps.maxIntentos ?? 5);
        this.deps.log?.(
          'warn',
          { evento: aviso.evento, intento: aviso.intentos, definitivo },
          `notificaciones: aviso fallido: ${mensaje}`,
        );
        await notificaciones.cerrarAviso(aviso.id, { error: mensaje, definitivo }, ahora);
        resultado.fallos += 1;
      }
    }
    return resultado;
  }

  private async entregar(mensaje: Omit<Mensaje, 'enviadoEn'>): Promise<EstadoEntrega> {
    try {
      await this.deps.mensajeria.enviar(mensaje);
      return 'enviada';
    } catch (error) {
      // Sin PII en el log: ni correo ni celular.
      this.deps.log?.(
        'warn',
        { canal: mensaje.canal },
        `notificaciones: fallo de envío: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 'fallida';
    }
  }
}

/** Completa placa y cliente a partir de los ids que dejó el motor, si el aviso no los trae. */
function enriquecer(
  aviso: NotificacionOutbox,
  placas: Map<string, string>,
  clientes: Map<string, string>,
): Record<string, unknown> {
  const datos: Record<string, unknown> = { ...aviso.datos };
  if (datos.placa === undefined && typeof datos.vehiculoId === 'string') {
    datos.placa = placas.get(datos.vehiculoId) ?? null;
  }
  if (datos.cliente === undefined && typeof datos.clienteId === 'string') {
    datos.cliente = clientes.get(datos.clienteId) ?? null;
  }
  return datos;
}
