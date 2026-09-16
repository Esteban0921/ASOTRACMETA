import { describe, expect, it } from 'vitest';
import {
  CLASES_COLA,
  ESTADOS_OFERTA,
  ESTADOS_TR,
  ESTADOS_TR_ACTIVOS,
  ESTADOS_VEHICULO,
  claseColaDe,
  esClaseCola,
} from './estados.js';

describe('estados cerrados (spec §4)', () => {
  it('TM y CBZ comparten la cola TM-CBZ; el resto es su propia clase', () => {
    expect(claseColaDe('TM')).toBe('TM-CBZ');
    expect(claseColaDe('CBZ')).toBe('TM-CBZ');
    expect(claseColaDe('C100')).toBe('C100');
    expect(claseColaDe('MM')).toBe('MM');
  });

  it('las listas de estado no tienen duplicados', () => {
    for (const lista of [ESTADOS_OFERTA, ESTADOS_TR, ESTADOS_VEHICULO, CLASES_COLA]) {
      expect(new Set(lista).size).toBe(lista.length);
    }
  });

  it('los TR activos son un subconjunto de los estados de TR', () => {
    for (const estado of ESTADOS_TR_ACTIVOS) {
      expect(ESTADOS_TR).toContain(estado);
    }
  });

  it('reconoce clases de cola válidas', () => {
    expect(esClaseCola('TM-CBZ')).toBe(true);
    expect(esClaseCola('DECLINA')).toBe(false);
  });
});
