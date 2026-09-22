import { describe, expect, it } from 'vitest';
import {
  FiltroHistorialGpsSchema,
  LoteUbicacionesGpsSchema,
  UbicacionGpsSchema,
  frescuraDe,
  mismoProveedorGps,
} from './gps.js';
import { PARAMETROS_DEFAULT } from './parametros.js';

const LOTE = {
  loteId: '0199b1f0-1111-7000-8000-000000000001',
  cuentaId: 'cuenta-uno',
  ubicaciones: [
    {
      placa: 'FST189',
      latitud: 4.1421,
      longitud: -73.6266,
      capturadaEn: '2026-09-22T13:00:00.000Z',
      proveedor: 'SATRACK',
    },
  ],
};

describe('ubicación GPS (ADR-0007)', () => {
  it('acepta una lectura normalizada con los campos opcionales', () => {
    const leida = UbicacionGpsSchema.parse({
      ...LOTE.ubicaciones[0],
      velocidadKmh: 62.5,
      rumboGrados: 91,
    });
    expect(leida.placa).toBe('FST189');
    expect(leida.velocidadKmh).toBe(62.5);
  });

  it('rechaza una placa que no tiene el formato del dominio', () => {
    expect(UbicacionGpsSchema.safeParse({ ...LOTE.ubicaciones[0], placa: 'fst 189' }).success).toBe(
      false,
    );
  });

  it('rechaza coordenadas fuera de rango y rumbos de 360 grados', () => {
    expect(UbicacionGpsSchema.safeParse({ ...LOTE.ubicaciones[0], latitud: 91 }).success).toBe(
      false,
    );
    expect(UbicacionGpsSchema.safeParse({ ...LOTE.ubicaciones[0], longitud: -181 }).success).toBe(
      false,
    );
    expect(UbicacionGpsSchema.safeParse({ ...LOTE.ubicaciones[0], rumboGrados: 360 }).success).toBe(
      false,
    );
  });

  it('exige el instante de captura con zona horaria', () => {
    expect(
      UbicacionGpsSchema.safeParse({ ...LOTE.ubicaciones[0], capturadaEn: '2026-09-22 13:00' })
        .success,
    ).toBe(false);
  });

  it('minimización (spec §12): un campo de más del proveedor hace fallar el lote', () => {
    const conPii = {
      ...LOTE,
      ubicaciones: [
        { ...LOTE.ubicaciones[0], conductor: 'Nombre Apellido', telefono: '3001234567' },
      ],
    };
    expect(LoteUbicacionesGpsSchema.safeParse(conPii).success).toBe(false);
  });

  it('nunca hay un campo de credenciales en el lote', () => {
    const conClave = { ...LOTE, usuario: 'propietario@correo', clave: 'secreta' };
    expect(LoteUbicacionesGpsSchema.safeParse(conClave).success).toBe(false);
  });

  it('admite el lote vacío con el que el agente comprueba el token antes de consultar', () => {
    expect(LoteUbicacionesGpsSchema.parse({ ...LOTE, ubicaciones: [] }).ubicaciones).toEqual([]);
  });

  it('acota el lote a 500 lecturas', () => {
    const muchas = Array.from({ length: 501 }, () => LOTE.ubicaciones[0]);
    expect(LoteUbicacionesGpsSchema.safeParse({ ...LOTE, ubicaciones: muchas }).success).toBe(
      false,
    );
  });

  it('la frescura sale de los parámetros, no de constantes (RULE-012)', () => {
    expect(frescuraDe(5, PARAMETROS_DEFAULT)).toBe('reciente');
    expect(frescuraDe(PARAMETROS_DEFAULT.gps_frescura_minutos, PARAMETROS_DEFAULT)).toBe(
      'desactualizada',
    );
    expect(frescuraDe(PARAMETROS_DEFAULT.gps_sin_senal_minutos, PARAMETROS_DEFAULT)).toBe(
      'sin_senal',
    );
    // Una placa que nunca reportó.
    expect(frescuraDe(null, PARAMETROS_DEFAULT)).toBe('sin_senal');
  });

  it('el proveedor se coteja sin distinguir mayúsculas ni espacios de más', () => {
    expect(mismoProveedorGps('  Satrack ', 'SATRACK')).toBe(true);
    expect(mismoProveedorGps(null, 'SATRACK')).toBe(true);
    expect(mismoProveedorGps('rastreoflotas', 'SATRACK')).toBe(false);
  });

  it('el filtro del recorrido acota el límite', () => {
    expect(FiltroHistorialGpsSchema.parse({ limite: '50' }).limite).toBe(50);
    expect(FiltroHistorialGpsSchema.safeParse({ limite: 5000 }).success).toBe(false);
  });
});
