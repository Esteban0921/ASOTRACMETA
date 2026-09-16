import { describe, expect, it } from 'vitest';
import { PARAMETROS_DEFAULT, ParametrosSchema, PatchParametrosSchema } from './parametros.js';

describe('parametros (spec §10)', () => {
  it('los valores por defecto validan contra el esquema', () => {
    expect(ParametrosSchema.parse(PARAMETROS_DEFAULT)).toEqual(PARAMETROS_DEFAULT);
  });

  it('el 3% es un parámetro acotado a [0,1], no una constante mágica', () => {
    expect(PARAMETROS_DEFAULT.recaudo_porcentaje).toBe(0.03);
    expect(
      ParametrosSchema.safeParse({ ...PARAMETROS_DEFAULT, recaudo_porcentaje: 3 }).success,
    ).toBe(false);
  });

  it('la secuencia TR es entera y positiva', () => {
    expect(
      ParametrosSchema.safeParse({
        ...PARAMETROS_DEFAULT,
        secuencia_tr: { prefix: 'TR-', next: 0 },
      }).success,
    ).toBe(false);
  });

  it('un patch parcial acepta solo llaves conocidas con tipos correctos', () => {
    expect(PatchParametrosSchema.parse({ oferta_ttl_minutos: 30 })).toEqual({
      oferta_ttl_minutos: 30,
    });
    expect(PatchParametrosSchema.safeParse({ declinacion_politica: 'DECLINA' }).success).toBe(
      false,
    );
  });
});
