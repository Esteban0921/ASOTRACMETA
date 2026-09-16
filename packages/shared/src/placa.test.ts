import { describe, expect, it } from 'vitest';
import { PlacaSchema, esPlacaValida, normalizarPlaca } from './placa.js';

describe('placa', () => {
  it('normaliza espacios, guiones y minúsculas (migración §13.1)', () => {
    expect(normalizarPlaca('SUL 470')).toBe('SUL470');
    expect(normalizarPlaca('sps-413')).toBe('SPS413');
    expect(normalizarPlaca('  fst189 ')).toBe('FST189');
  });

  it('valida el formato AAA123', () => {
    expect(esPlacaValida('SWI750')).toBe(true);
    expect(esPlacaValida('SWI75')).toBe(false);
    expect(esPlacaValida('1234AB')).toBe(false);
  });

  it('el esquema normaliza y luego valida', () => {
    expect(PlacaSchema.parse('qor 007')).toBe('QOR007');
    expect(PlacaSchema.safeParse('ABC12').success).toBe(false);
  });
});
