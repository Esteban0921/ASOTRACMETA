import type { ClaseCola } from '@asotracmet/shared';
import { ErrorDominio } from './errores.js';
import type { ColaPosicion } from './tipos.js';

// Invariantes de cola (spec §7.1). Toda mutación de posiciones pasa por aquí.

export function verificarInvariantesCola(posiciones: ColaPosicion[], claseCola: ClaseCola): void {
  const ordenadas = [...posiciones].sort((a, b) => a.posicion - b.posicion);
  const vehiculos = new Set<string>();
  ordenadas.forEach((p, indice) => {
    if (p.claseCola !== claseCola) {
      throw new ErrorDominio('INVARIANTE_COLA', `Posición de ${p.claseCola} en cola ${claseCola}`);
    }
    if (p.posicion !== indice + 1) {
      throw new ErrorDominio('INVARIANTE_COLA', `Posiciones no densas en ${claseCola}`, {
        esperada: indice + 1,
        encontrada: p.posicion,
      });
    }
    if (vehiculos.has(p.vehiculoId)) {
      throw new ErrorDominio('INVARIANTE_COLA', `Vehículo repetido en ${claseCola}`, {
        vehiculoId: p.vehiculoId,
      });
    }
    vehiculos.add(p.vehiculoId);
  });
}

/** Devuelve una copia ordenada con posiciones 1..N densas. */
export function renumerar(posiciones: ColaPosicion[]): ColaPosicion[] {
  return [...posiciones]
    .sort((a, b) => a.posicion - b.posicion)
    .map((p, indice) => (p.posicion === indice + 1 ? p : { ...p, posicion: indice + 1 }));
}

/** Saca la placa de su lugar y la lleva al final. Incrementa `ciclo` y `version`. */
export function rotarAlFinal(posiciones: ColaPosicion[], vehiculoId: string): ColaPosicion[] {
  const actual = posiciones.find((p) => p.vehiculoId === vehiculoId);
  if (!actual) {
    throw new ErrorDominio('INVARIANTE_COLA', 'Vehículo no está en la cola', { vehiculoId });
  }
  const resto = renumerar(posiciones.filter((p) => p.vehiculoId !== vehiculoId));
  return [
    ...resto,
    {
      ...actual,
      posicion: resto.length + 1,
      ciclo: actual.ciclo + 1,
      version: actual.version + 1,
    },
  ];
}

/** Inserta (o mueve) la placa a la cabeza desplazando al resto. Solo con regla explícita (§7.5). */
export function moverACabeza(posiciones: ColaPosicion[], vehiculoId: string): ColaPosicion[] {
  const actual = posiciones.find((p) => p.vehiculoId === vehiculoId);
  if (!actual) {
    throw new ErrorDominio('INVARIANTE_COLA', 'Vehículo no está en la cola', { vehiculoId });
  }
  const resto = renumerar(posiciones.filter((p) => p.vehiculoId !== vehiculoId));
  return [
    { ...actual, posicion: 1, version: actual.version + 1 },
    ...resto.map((p) => ({ ...p, posicion: p.posicion + 1 })),
  ];
}

/**
 * Lleva la placa a una posición concreta desplazando al resto (`cola.override`, §7.1.5).
 * Es una acción de dominio auditada, nunca un input numérico sobre `posicion` (§9.3).
 */
export function moverAPosicion(
  posiciones: ColaPosicion[],
  vehiculoId: string,
  nuevaPosicion: number,
): ColaPosicion[] {
  const actual = posiciones.find((p) => p.vehiculoId === vehiculoId);
  if (!actual) {
    throw new ErrorDominio('INVARIANTE_COLA', 'Vehículo no está en la cola', { vehiculoId });
  }
  if (!Number.isInteger(nuevaPosicion) || nuevaPosicion < 1 || nuevaPosicion > posiciones.length) {
    throw new ErrorDominio(
      'VALIDATION_ERROR',
      `La posición debe estar entre 1 y ${posiciones.length}`,
      { posicion: nuevaPosicion },
    );
  }
  const resto = renumerar(posiciones.filter((p) => p.vehiculoId !== vehiculoId));
  resto.splice(nuevaPosicion - 1, 0, { ...actual, version: actual.version + 1 });
  return resto.map((p, indice) => (p.posicion === indice + 1 ? p : { ...p, posicion: indice + 1 }));
}

export function actualizarPosicion(
  posiciones: ColaPosicion[],
  vehiculoId: string,
  cambios: Partial<Pick<ColaPosicion, 'turnosOfrecidos' | 'turnosTomados' | 'saltosPendientes'>>,
): ColaPosicion[] {
  return posiciones.map((p) =>
    p.vehiculoId === vehiculoId ? { ...p, ...cambios, version: p.version + 1 } : p,
  );
}
