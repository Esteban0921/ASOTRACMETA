import { createHash, timingSafeEqual } from 'node:crypto';

// Tokens de servicio: los usa lo que no tiene sesión ni actor humano detrás (`/metrics` y la
// ingesta del agente GPS, ADR-0007). La comparación es en tiempo constante sobre el SHA-256 de
// ambos lados, así siempre hay la misma longitud y no se filtra información por el tiempo de
// respuesta. Este módulo solo compara: si no hay token configurado, decide quien llama
// (`/metrics` sigue abierto sin `METRICS_TOKEN`; la ingesta responde 401).

export function tokenDeCabecera(cabecera: string | undefined): string | null {
  if (cabecera === undefined || !cabecera.startsWith('Bearer ')) return null;
  const token = cabecera.slice('Bearer '.length).trim();
  return token === '' ? null : token;
}

export function tokenServicioValido(
  cabecera: string | undefined,
  esperados: readonly string[],
): boolean {
  const token = tokenDeCabecera(cabecera);
  if (token === null) return false;
  const recibido = createHash('sha256').update(token).digest();
  let valido = false;
  for (const esperado of esperados) {
    if (esperado === '') continue;
    const candidato = createHash('sha256').update(esperado).digest();
    // Sin cortocircuito: todas las comparaciones cuestan lo mismo.
    if (timingSafeEqual(recibido, candidato)) valido = true;
  }
  return valido;
}
