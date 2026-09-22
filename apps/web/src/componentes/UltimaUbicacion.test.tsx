import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { VistaUbicacion } from '../api/tipos';
import { UltimaUbicacion } from './UltimaUbicacion';
import { textoHace } from '../utils/formato';

// Última ubicación en la web (ADR-0007, TASK-0065). Lo que importa: que el veedor no vea
// coordenadas ni enlace al mapa (criterio §20.11) y que una placa sin lecturas no parezca un error.

const UBICACION: VistaUbicacion = {
  vehiculoId: 'veh-FST189',
  placa: 'FST189',
  latitud: 4.1421,
  longitud: -73.6266,
  velocidadKmh: 62,
  rumboGrados: 91,
  proveedor: 'SATRACK',
  capturadaEn: '2026-09-22T13:00:00.000Z',
  recibidaEn: '2026-09-22T13:00:05.000Z',
  minutosDesde: 12,
  frescura: 'reciente',
  enmascarada: false,
};

describe('UltimaUbicacion', () => {
  it('muestra el estado, el "hace X" y el enlace al mapa', () => {
    render(<UltimaUbicacion ubicacion={UBICACION} />);
    expect(screen.getByTestId('ubicacion-FST189')).toHaveTextContent('Reportando');
    expect(screen.getByTestId('ubicacion-FST189')).toHaveTextContent('hace 12 min');
    expect(screen.getByTestId('ubicacion-FST189-coordenadas')).toHaveTextContent('4.14210');
    expect(screen.getByTestId('ubicacion-FST189-mapa')).toHaveAttribute(
      'href',
      'https://www.google.com/maps?q=4.1421,-73.6266',
    );
  });

  it('al veedor no le pinta coordenadas ni enlace: la API se las manda en nulo', () => {
    render(
      <UltimaUbicacion
        ubicacion={{
          ...UBICACION,
          latitud: null,
          longitud: null,
          velocidadKmh: null,
          rumboGrados: null,
          enmascarada: true,
        }}
      />,
    );
    expect(screen.getByTestId('ubicacion-FST189')).toHaveTextContent('Reportando');
    expect(screen.queryByTestId('ubicacion-FST189-coordenadas')).toBeNull();
    expect(screen.queryByTestId('ubicacion-FST189-mapa')).toBeNull();
  });

  it('una placa sin lecturas dice "Sin GPS", no un error', () => {
    render(<UltimaUbicacion ubicacion={null} placa="TKM221" />);
    expect(screen.getByTestId('ubicacion-TKM221')).toHaveTextContent('Sin GPS');
  });

  it('distingue el reporte atrasado del camión sin señal', () => {
    const { rerender } = render(
      <UltimaUbicacion
        ubicacion={{ ...UBICACION, frescura: 'desactualizada', minutosDesde: 45 }}
      />,
    );
    expect(screen.getByTestId('ubicacion-FST189')).toHaveTextContent('Reporte atrasado');
    rerender(
      <UltimaUbicacion ubicacion={{ ...UBICACION, frescura: 'sin_senal', minutosDesde: 300 }} />,
    );
    expect(screen.getByTestId('ubicacion-FST189')).toHaveTextContent('Sin señal');
    expect(screen.getByTestId('ubicacion-FST189')).toHaveTextContent('hace 5 h');
  });
});

describe('textoHace', () => {
  it('redacta minutos, horas y días', () => {
    expect(textoHace(0)).toBe('hace un momento');
    expect(textoHace(12)).toBe('hace 12 min');
    expect(textoHace(59)).toBe('hace 59 min');
    expect(textoHace(60)).toBe('hace 1 h');
    expect(textoHace(23 * 60)).toBe('hace 23 h');
    expect(textoHace(24 * 60)).toBe('hace 1 día');
    expect(textoHace(3 * 24 * 60)).toBe('hace 3 días');
  });
});
