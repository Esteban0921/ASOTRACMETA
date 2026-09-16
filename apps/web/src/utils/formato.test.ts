import { describe, expect, it } from 'vitest';
import {
  rutaInicialPorRol,
  textoElegibilidad,
  textoPosicion,
  tonoEstado,
  traducirError,
} from './formato';

describe('formato', () => {
  it('arma el texto de posición del asociado (spec §9.2)', () => {
    expect(textoPosicion('TM-CBZ', 3, 12)).toBe('Tu posición: 3 de 12 en TM-CBZ');
  });

  it('enruta member a /me y al resto a /ops', () => {
    expect(rutaInicialPorRol('member')).toBe('/me');
    expect(rutaInicialPorRol('admin_ops')).toBe('/ops');
    expect(rutaInicialPorRol('viewer')).toBe('/ops');
  });

  it('traduce códigos estables y no revienta con desconocidos', () => {
    expect(traducirError('COLA_LOCKED')).toMatch(/coordinador/);
    expect(traducirError('XYZ')).toContain('XYZ');
  });

  it('colores por estado (spec §9.3): abierta ámbar, asignado verde, cancelado rojo, resto gris', () => {
    expect(tonoEstado('abierta')).toBe('ambar');
    expect(tonoEstado('asignado')).toBe('verde');
    expect(tonoEstado('cancelado')).toBe('rojo');
    expect(tonoEstado('borrador')).toBe('gris');
  });

  it('describe la elegibilidad en lenguaje de operación', () => {
    expect(textoElegibilidad(null)).toBe('Elegible');
    expect(textoElegibilidad('VEHICULO_NO_HABILITADO')).toBe('No habilitada');
  });
});
