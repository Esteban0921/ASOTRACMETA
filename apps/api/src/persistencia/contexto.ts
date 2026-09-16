import { AsyncLocalStorage } from 'node:async_hooks';
import type { Rol } from '@asotracmet/shared';

// Contexto de la petición para Row Level Security (ADR-0004, ADR-0005).
// El adaptador Postgres lo traduce a `set local app.rol` / `set local app.vehiculo_ids`.
// El almacén en memoria lo ignora: allí el filtrado lo hace la API y el motor.

export interface ContextoRls {
  rol: Rol | 'sistema';
  vehiculoIds: readonly string[];
}

/** Sin petición en curso (migraciones, jobs, arranque) el rol efectivo es `sistema`. */
const SISTEMA: ContextoRls = { rol: 'sistema', vehiculoIds: [] };

const almacenamiento = new AsyncLocalStorage<ContextoRls>();

/** Fija el contexto para el resto de la cadena asíncrona (hook `onRequest` de Fastify). */
export function fijarContexto(contexto: ContextoRls): void {
  almacenamiento.enterWith(contexto);
}

export function conContexto<T>(contexto: ContextoRls, fn: () => Promise<T>): Promise<T> {
  return almacenamiento.run(contexto, fn);
}

export function contextoActual(): ContextoRls {
  return almacenamiento.getStore() ?? SISTEMA;
}
