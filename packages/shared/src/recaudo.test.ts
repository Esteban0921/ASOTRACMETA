import { describe, expect, it } from 'vitest';
import { calcularRecaudo, estadoRecaudoSegunPago, mesDeViaje } from './recaudo.js';

describe('recaudo (spec §6.5, §20.7)', () => {
  it('calcula flete × porcentaje redondeado al peso, con el porcentaje como dato', () => {
    expect(calcularRecaudo(1_500_000, 0.03)).toBe(45_000);
    expect(calcularRecaudo(3_803_850, 0.03)).toBe(114_116);
    expect(calcularRecaudo(1_500_000, 0.05)).toBe(75_000);
    expect(calcularRecaudo(0, 0.03)).toBe(0);
    expect(() => calcularRecaudo(-1, 0.03)).toThrow(RangeError);
    expect(() => calcularRecaudo(100, 1.5)).toThrow(RangeError);
  });

  it('el estado del recaudo sigue a lo pagado con tolerancia de un peso', () => {
    expect(estadoRecaudoSegunPago(45_000, 0)).toBe('pendiente');
    expect(estadoRecaudoSegunPago(45_000, 20_000)).toBe('parcial');
    expect(estadoRecaudoSegunPago(45_000, 44_999)).toBe('pagado');
    expect(estadoRecaudoSegunPago(45_000, 45_000)).toBe('pagado');
  });

  it('el mes del viaje es el de cargue y, si falta, el de asignación del TR', () => {
    expect(mesDeViaje('2026-09-17', '2026-09-16')).toBe('2026-09');
    expect(mesDeViaje(null, '2026-08-31')).toBe('2026-08');
  });
});
