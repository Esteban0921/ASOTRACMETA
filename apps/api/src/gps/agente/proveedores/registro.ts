import { GpsSimulado } from './simulado.js';
import type { ProveedorGps } from './tipos.js';

// Qué adaptador atiende a cada plataforma. Una cuenta cuyo `proveedor` no esté aquí se salta con
// un aviso en el log: el resto de las cuentas sigue consultándose.
//
// Cuando llegue el adaptador real de Vía GPS (TASK-0067) se añade su clase y esta lista crece en
// una línea. Hasta entonces, `simulado` permite probar todo el circuito sin credenciales.

export type RegistroProveedores = ReadonlyMap<string, ProveedorGps>;

export function registroProveedores(extra: readonly ProveedorGps[] = []): RegistroProveedores {
  const todos: ProveedorGps[] = [new GpsSimulado(), ...extra];
  return new Map(todos.map((p) => [p.clase, p]));
}
