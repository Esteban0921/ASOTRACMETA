import type { UbicacionGps } from '@asotracmet/shared';
import type { CuentaGps } from '../cuentas.js';

// Puerto de una plataforma de GPS (ADR-0007, TASK-0064). Un adaptador por plataforma, con el
// mismo molde que `AlmacenSoportes` o `Mensajeria`: `fetch` inyectable para poder probarlo con
// respuestas grabadas, sin red y sin credenciales reales (RULE-020).

/** Motivo por el que una cuenta no se pudo consultar. Decide el castigo del ciclo. */
export type MotivoFalloGps = 'credenciales_invalidas' | 'formato_inesperado' | 'red' | 'limitado';

export class ErrorProveedorGps extends Error {
  constructor(
    readonly motivo: MotivoFalloGps,
    mensaje: string,
    readonly detalle?: { status?: number; esperarMs?: number },
  ) {
    super(mensaje);
    this.name = 'ErrorProveedorGps';
  }
}

export interface ContextoProveedor {
  /** Siempre inyectado: los tests pasan uno falso. */
  fetch: typeof fetch;
  /** Reloj del agente; nunca `new Date()` dentro del adaptador (RULE-020). */
  ahora: () => Date;
  /** Corta la consulta si la plataforma no responde. */
  signal: AbortSignal;
  /** Solo conteos y estados; jamás usuario, clave ni coordenadas. */
  log: (datos: Record<string, unknown>, mensaje: string) => void;
}

export interface ProveedorGps {
  /** Nombre con el que las cuentas lo eligen (`simulado`, `viagps`…). */
  readonly clase: string;
  /**
   * Devuelve la última posición conocida de cada placa de la cuenta. Un solo acceso por llamada:
   * repetir el inicio de sesión cada pocos minutos puede hacer que la plataforma bloquee la cuenta
   * del propietario.
   */
  ubicaciones(cuenta: CuentaGps, ctx: ContextoProveedor): Promise<UbicacionGps[]>;
}
