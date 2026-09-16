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
import { MaestrosMemoria } from '../maestros/memoria.js';
import { MaestrosPostgres } from '../maestros/postgres.js';
import type { RepositorioMaestros } from '../maestros/tipos.js';
import { crearSeed } from '../seed.js';
import { AlmacenUsuarios, UsuariosPostgres, type RepositorioUsuarios } from '../usuarios.js';
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
  return {
    clase: 'memoria',
    uow: almacen,
    consultas: new ConsultasMemoria(almacen),
    usuarios,
    auth,
    maestros,
    viajes,
    idSemilla: (nombre) => nombre,
    reiniciar: async () => {
      const nuevo = crearSeed(opciones.reloj.ahora(), opciones.claveCifrado);
      almacen.reemplazar(nuevo.estado);
      usuarios.reemplazar(nuevo.usuarios);
      auth.limpiar();
      maestros.cargar(nuevo.maestros);
      viajes.limpiar();
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
    idSemilla: uuidSemilla,
    cerrar: () => almacen.cerrar(),
  };
}

export function crearPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl, max: 10 });
}
