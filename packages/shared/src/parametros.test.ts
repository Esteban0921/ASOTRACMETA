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

  it('los avisos proactivos se gobiernan por parámetros enteros ≥ 1 (TASK-0057, RULE-012)', () => {
    expect(PARAMETROS_DEFAULT.aviso_proximo_turno_posiciones).toBe(2);
    expect(PARAMETROS_DEFAULT.aviso_documento_bloquea_posiciones).toBe(3);
    for (const clave of [
      'aviso_proximo_turno_posiciones',
      'aviso_documento_bloquea_posiciones',
    ] as const) {
      expect(ParametrosSchema.safeParse({ ...PARAMETROS_DEFAULT, [clave]: 0 }).success).toBe(false);
      expect(ParametrosSchema.safeParse({ ...PARAMETROS_DEFAULT, [clave]: 1.5 }).success).toBe(
        false,
      );
      expect(PatchParametrosSchema.parse({ [clave]: 5 })).toEqual({ [clave]: 5 });
    }
    // Una base anterior a la migración 0019 no trae las llaves: el esquema lo detecta.
    const { aviso_proximo_turno_posiciones: _sinLlave, ...vieja } = PARAMETROS_DEFAULT;
    expect(ParametrosSchema.safeParse(vieja).success).toBe(false);
  });

  it('la ubicación GPS se gobierna por parámetros, no por constantes (TASK-0062, RULE-012)', () => {
    expect(PARAMETROS_DEFAULT.gps_intervalo_minutos).toBe(20);
    expect(PARAMETROS_DEFAULT.gps_frescura_minutos).toBe(30);
    expect(PARAMETROS_DEFAULT.gps_sin_senal_minutos).toBe(120);
    expect(PARAMETROS_DEFAULT.gps_retencion_dias).toBe(30);
    for (const clave of [
      'gps_intervalo_minutos',
      'gps_frescura_minutos',
      'gps_sin_senal_minutos',
      'gps_retencion_dias',
    ] as const) {
      expect(ParametrosSchema.safeParse({ ...PARAMETROS_DEFAULT, [clave]: 0 }).success).toBe(false);
      expect(ParametrosSchema.safeParse({ ...PARAMETROS_DEFAULT, [clave]: 1.5 }).success).toBe(
        false,
      );
    }
    // El intervalo no baja de 10 minutos: cada corrida es un acceso a la plataforma del
    // propietario y acortarlo demasiado puede hacer que le bloqueen la cuenta (ADR-0007).
    expect(
      ParametrosSchema.safeParse({ ...PARAMETROS_DEFAULT, gps_intervalo_minutos: 5 }).success,
    ).toBe(false);
    expect(PatchParametrosSchema.parse({ gps_intervalo_minutos: 30 })).toEqual({
      gps_intervalo_minutos: 30,
    });
    // Una base anterior a la migración 0021 no trae las llaves: el esquema lo detecta.
    const { gps_retencion_dias: _sinLlave, ...vieja } = PARAMETROS_DEFAULT;
    expect(ParametrosSchema.safeParse(vieja).success).toBe(false);
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
