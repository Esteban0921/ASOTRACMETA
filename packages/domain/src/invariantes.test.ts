import { describe, expect, it } from 'vitest';
import { ErrorDominio } from './errores.js';
import { moverACabeza, renumerar, rotarAlFinal, verificarInvariantesCola } from './invariantes.js';
import type { ColaPosicion } from './tipos.js';

function cola(...vehiculos: string[]): ColaPosicion[] {
  return vehiculos.map((vehiculoId, i) => ({
    id: `p-${vehiculoId}`,
    claseCola: 'TM-CBZ',
    vehiculoId,
    posicion: i + 1,
    ciclo: 1,
    turnosOfrecidos: 0,
    turnosTomados: 0,
    saltosPendientes: 0,
    version: 1,
  }));
}

describe('invariantes de cola (spec §7.1)', () => {
  it('acepta posiciones densas 1..N sin repetidos', () => {
    expect(() => verificarInvariantesCola(cola('a', 'b', 'c'), 'TM-CBZ')).not.toThrow();
  });

  it('rechaza huecos', () => {
    const rota = cola('a', 'b', 'c');
    rota[1] = { ...rota[1]!, posicion: 5 };
    expect(() => verificarInvariantesCola(rota, 'TM-CBZ')).toThrow(ErrorDominio);
  });

  it('rechaza placas repetidas', () => {
    const rota = cola('a', 'b', 'c');
    rota[2] = { ...rota[2]!, vehiculoId: 'a' };
    expect(() => verificarInvariantesCola(rota, 'TM-CBZ')).toThrow(/repetido/);
  });

  it('rechaza posiciones de otra clase', () => {
    expect(() => verificarInvariantesCola(cola('a'), 'C100')).toThrow(/C100/);
  });

  it('renumerar cierra huecos conservando el orden', () => {
    const desordenada = [cola('a', 'b', 'c')[2]!, { ...cola('a')[0]!, posicion: 7 }];
    expect(renumerar(desordenada).map((p) => [p.vehiculoId, p.posicion])).toEqual([
      ['c', 1],
      ['a', 2],
    ]);
  });

  it('rotarAlFinal mueve la placa al final e incrementa ciclo y version', () => {
    const resultado = rotarAlFinal(cola('a', 'b', 'c'), 'a');
    expect(resultado.map((p) => p.vehiculoId)).toEqual(['b', 'c', 'a']);
    expect(resultado.map((p) => p.posicion)).toEqual([1, 2, 3]);
    expect(resultado[2]?.ciclo).toBe(2);
    expect(resultado[2]?.version).toBe(2);
  });

  it('moverACabeza desplaza al resto', () => {
    const resultado = moverACabeza(cola('a', 'b', 'c'), 'c');
    expect(resultado.map((p) => p.vehiculoId)).toEqual(['c', 'a', 'b']);
    expect(resultado.map((p) => p.posicion)).toEqual([1, 2, 3]);
  });

  it('rotar una placa ausente es un error de invariante', () => {
    expect(() => rotarAlFinal(cola('a'), 'zzz')).toThrow(ErrorDominio);
  });
});
