import { ErrorDominio, type Actor } from '@asotracmet/domain';
import { veEnmascarado, type Recurso } from '@asotracmet/shared';

// Alcance `own` y enmascarado de PII (spec §3.2, RULE-022). Vivían dentro de `rutasMaestros`;
// se extrajeron aquí para que la ruta de ubicaciones (ADR-0007) aplique exactamente la misma
// regla: dos definiciones que se separen serían un incidente de seguridad esperando su turno.

export function esMember(actor: Actor): boolean {
  return actor.rol === 'member';
}

/** Ids de vehículo del asociado (no placas): es lo que trae la sesión. */
export function placasPropias(actor: Actor): Set<string> {
  return new Set(actor.vehiculoIds ?? []);
}

export function exigirPropio(actor: Actor, vehiculoId: string): void {
  if (esMember(actor) && !placasPropias(actor).has(vehiculoId)) {
    throw new ErrorDominio('FORBIDDEN_OWN_SCOPE', 'La placa no es tuya');
  }
}

/** `R*` de la matriz RBAC: el veedor ve la fila, con los campos sensibles en blanco. */
export function enmascara(actor: Actor, recurso: Recurso): boolean {
  return veEnmascarado(actor.rol, recurso);
}
