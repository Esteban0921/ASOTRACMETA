import { describe, expect, it } from 'vitest';
import { enmascararCelular, enmascararDocumento, etiquetaAsociadoPlaca } from './pii.js';
import { fechaLocal } from './fechas.js';

describe('pii', () => {
  it('enmascara cédula dejando los últimos 4 dígitos (spec §3.2)', () => {
    expect(enmascararDocumento('1012341658')).toBe('******1658');
    expect(enmascararDocumento(null)).toBeNull();
  });

  it('enmascara celular', () => {
    expect(enmascararCelular('3101234567')).toBe('*******567');
  });

  it('etiqueta nombre completo · placa, nunca recortado (spec §9.3)', () => {
    expect(etiquetaAsociadoPlaca('Elkin Giovanni Moya Duarte', 'SOF336')).toBe(
      'ELKIN GIOVANNI MOYA DUARTE · SOF336',
    );
  });
});

describe('fechas', () => {
  it('la fecha de negocio se calcula en America/Bogota', () => {
    // 2026-09-16T03:30Z son las 22:30 del 15 en Bogotá (UTC-5).
    expect(fechaLocal(new Date('2026-09-16T03:30:00Z'), 'America/Bogota')).toBe('2026-09-15');
    expect(fechaLocal(new Date('2026-09-16T12:00:00Z'), 'America/Bogota')).toBe('2026-09-16');
  });
});
