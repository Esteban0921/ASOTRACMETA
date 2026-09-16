import { describe, expect, it } from 'vitest';
import { diasEntre, diasParaVencer, estadoDocumento, peorEstadoDocumento } from './documentos.js';

describe('semáforo de documentos (spec §6.3, §9.2)', () => {
  const hoy = '2026-09-16';

  it('calcula días entre fechas de negocio sin efectos de zona horaria', () => {
    expect(diasEntre('2026-09-16', '2026-09-28')).toBe(12);
    expect(diasEntre('2026-09-16', '2026-09-01')).toBe(-15);
    expect(diasEntre('2026-12-31', '2027-01-01')).toBe(1);
    expect(diasParaVencer(null, hoy)).toBeNull();
  });

  it('vencido si la fecha ya pasó, por vencer dentro de la alerta, vigente el resto', () => {
    expect(estadoDocumento('2026-09-01', hoy, 30)).toBe('vencido');
    expect(estadoDocumento('2026-09-16', hoy, 30)).toBe('por_vencer'); // vence hoy: aún vale
    expect(estadoDocumento('2026-09-28', hoy, 30)).toBe('por_vencer');
    expect(estadoDocumento('2026-10-16', hoy, 30)).toBe('vigente');
    expect(estadoDocumento('2026-10-15', hoy, 30)).toBe('por_vencer');
    expect(estadoDocumento(null, hoy, 30)).toBe('vigente');
  });

  it('el semáforo de la placa es el peor estado de sus documentos', () => {
    expect(peorEstadoDocumento([])).toBe('vigente');
    expect(peorEstadoDocumento(['vigente', 'por_vencer'])).toBe('por_vencer');
    expect(peorEstadoDocumento(['por_vencer', 'vencido', 'vigente'])).toBe('vencido');
  });
});
