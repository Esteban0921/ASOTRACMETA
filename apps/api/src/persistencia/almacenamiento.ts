import pg from 'pg';
import {
  AlmacenMemoria,
  type GeneradorIds,
  type Reloj,
  type UnidadDeTrabajo,
} from '@asotracmet/domain';
import { AuthMemoria, type RepositorioAuth } from '../auth/sesiones.js';
import { ConsultasMemoria } from '../consultas/memoria.js';
import { ConsultasPostgres } from '../consultas/postgres.js';
import type { Consultas } from '../consultas/tipos.js';
import { UbicacionesMemoria } from '../gps/memoria.js';
import { UbicacionesPostgres } from '../gps/postgres.js';
import type { RepositorioUbicaciones } from '../gps/tipos.js';
import { MaestrosMemoria } from '../maestros/memoria.js';
import { MaestrosPostgres } from '../maestros/postgres.js';
import type { RepositorioMaestros } from '../maestros/tipos.js';
import { NotificacionesMemoria } from '../notificaciones/memoria.js';
import { NotificacionesPostgres } from '../notificaciones/postgres.js';
import type { RepositorioNotificaciones } from '../notificaciones/tipos.js';
import { crearSeed } from '../seed.js';
import { AlmacenUsuarios, UsuariosPostgres, type RepositorioUsuarios } from '../usuarios.js';
import { MetricasMemoria } from '../tablero/memoria.js';
import { MetricasPostgres } from '../tablero/postgres.js';
import type { RepositorioMetricas } from '../tablero/tipos.js';
import { ViajesMemoria } from '../viajes/memoria.js';
import { ViajesPostgres } from '../viajes/postgres.js';
import type { RepositorioViajes } from '../viajes/tipos.js';
import { AuthPostgres } from './auth-postgres.js';
import { AlmacenPostgres } from './postgres.js';
import { uuidSemilla } from './seed-postgres.js';

// Un solo objeto agrupa los puertos que la API necesita (escritura, lectura, usuarios y sesiones),
// para que `construirApp` no sepa contra qué almacén corre.

export interface Almacenamiento {
  readonly clase: 'memoria' | 'postgres';
  readonly uow: UnidadDeTrabajo;
  readonly consultas: Consultas;
  readonly usuarios: RepositorioUsuarios;
  readonly auth: RepositorioAuth;
  readonly maestros: RepositorioMaestros;
  readonly viajes: RepositorioViajes;
  readonly metricas: RepositorioMetricas;
  /** Outbox de avisos y bandeja in-app (spec §11, TASK-0026). */
  readonly notificaciones: RepositorioNotificaciones;
  /** Ubicación GPS por placa, que deja el agente satélite (ADR-0007, TASK-0062). */
  readonly ubicaciones: RepositorioUbicaciones;
  /**
   * Traduce un identificador legible de la semilla al que usa este almacén.
   * En memoria es el mismo; en Postgres, su UUID determinista.
   */
  idSemilla(nombre: string): string;
  /** Solo disponible en modo e2e sobre memoria. */
  reiniciar?(): Promise<void>;
  cerrar(): Promise<void>;
}

export function almacenamientoMemoria(opciones: {
  reloj: Reloj;
  ids: GeneradorIds;
  claveCifrado: Buffer;
  almacen?: AlmacenMemoria;
  usuarios?: AlmacenUsuarios;
}): Almacenamiento {
  const semilla = crearSeed(opciones.reloj.ahora(), opciones.claveCifrado);
  const almacen =
    opciones.almacen ??
    new AlmacenMemoria(semilla.estado, { reloj: opciones.reloj, ids: opciones.ids });
  const usuarios = opciones.usuarios ?? new AlmacenUsuarios(semilla.usuarios);
  const auth = new AuthMemoria();
  const maestros = new MaestrosMemoria(almacen, opciones.reloj);
  maestros.cargar(semilla.maestros);
  const viajes = new ViajesMemoria(almacen, maestros);
  const metricas = new MetricasMemoria();
  const notificaciones = new NotificacionesMemoria(almacen, opciones.ids);
  const ubicaciones = new UbicacionesMemoria();
  return {
    clase: 'memoria',
    uow: almacen,
    consultas: new ConsultasMemoria(almacen),
    usuarios,
    auth,
    maestros,
    viajes,
    metricas,
    notificaciones,
    ubicaciones,
    idSemilla: (nombre) => nombre,
    reiniciar: async () => {
      const nuevo = crearSeed(opciones.reloj.ahora(), opciones.claveCifrado);
      almacen.reemplazar(nuevo.estado);
      usuarios.reemplazar(nuevo.usuarios);
      auth.limpiar();
      maestros.cargar(nuevo.maestros);
      viajes.limpiar();
      metricas.limpiar();
      notificaciones.limpiar();
      ubicaciones.limpiar();
    },
    cerrar: async () => undefined,
  };
}

export function almacenamientoPostgres(opciones: { pool: pg.Pool }): Almacenamiento {
  const almacen = new AlmacenPostgres(opciones.pool);
  return {
    clase: 'postgres',
    uow: almacen,
    consultas: new ConsultasPostgres(opciones.pool),
    usuarios: new UsuariosPostgres(opciones.pool),
    auth: new AuthPostgres(opciones.pool),
    maestros: new MaestrosPostgres(opciones.pool),
    viajes: new ViajesPostgres(opciones.pool),
    metricas: new MetricasPostgres(opciones.pool),
    notificaciones: new NotificacionesPostgres(opciones.pool),
    ubicaciones: new UbicacionesPostgres(opciones.pool),
    idSemilla: uuidSemilla,
    cerrar: () => almacen.cerrar(),
  };
}

export function crearPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl, max: 10 });
}
