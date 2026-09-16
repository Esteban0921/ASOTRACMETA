import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VistaOferta } from '../api/tipos';
import { OfertaCard } from './OfertaCard';

const oferta: VistaOferta = {
  id: 'o-1',
  requerimientoId: 'req-1',
  vehiculoId: 'veh-FST189',
  placa: 'FST189',
  claseCola: 'TM-CBZ',
  etiqueta: 'ASOCIADO 02 ANONIMIZADO · FST189',
  estado: 'abierta',
  ofrecidaEn: '2026-09-16T13:00:00.000Z',
  expiraEn: '2026-09-16T15:00:00.000Z',
  motivoDeclinacion: null,
  nota: null,
  requerimiento: {
    id: 'req-1',
    clienteId: 'cli-hlb',
    cliente: 'HLB',
    clienteNombre: 'Halliburton',
    destino: 'CASTILLA LA NUEVA',
    claseCola: 'TM-CBZ',
    fechaServicio: '2026-09-17',
    cantidadCupos: 2,
    cuposAsignados: 0,
    ofertasAbiertas: 1,
    cuposDisponibles: 1,
    observaciones: null,
    estado: 'abierto',
  },
};

const motivos = [
  { id: 'mot-mantenimiento', codigo: 'MANTENIMIENTO', nombre: 'Vehículo en mantenimiento' },
  { id: 'mot-personal', codigo: 'PERSONAL', nombre: 'Motivo personal' },
];

describe('OfertaCard', () => {
  it('muestra placa, cliente y destino', () => {
    render(
      <OfertaCard
        oferta={oferta}
        motivos={motivos}
        ocupado={false}
        onAceptar={vi.fn()}
        onDeclinar={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'FST189' })).toBeInTheDocument();
    expect(screen.getByText(/HLB · CASTILLA LA NUEVA/)).toBeInTheDocument();
  });

  it('aceptar llama a onAceptar', () => {
    const onAceptar = vi.fn();
    render(
      <OfertaCard
        oferta={oferta}
        motivos={motivos}
        ocupado={false}
        onAceptar={onAceptar}
        onDeclinar={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('aceptar-oferta'));
    expect(onAceptar).toHaveBeenCalledTimes(1);
  });

  it('declinar exige motivo de catálogo (spec §9.3)', () => {
    const onDeclinar = vi.fn();
    render(
      <OfertaCard
        oferta={oferta}
        motivos={motivos}
        ocupado={false}
        onAceptar={vi.fn()}
        onDeclinar={onDeclinar}
      />,
    );
    const boton = screen.getByTestId('declinar-oferta');
    expect(boton).toBeDisabled();
    fireEvent.change(screen.getByTestId('motivo-declinacion'), {
      target: { value: 'mot-personal' },
    });
    fireEvent.change(screen.getByTestId('nota-declinacion'), { target: { value: 'Cita médica' } });
    expect(boton).toBeEnabled();
    fireEvent.click(boton);
    expect(onDeclinar).toHaveBeenCalledWith('mot-personal', 'Cita médica');
  });

  it('con ocupado=true no permite acciones', () => {
    render(
      <OfertaCard
        oferta={oferta}
        motivos={motivos}
        ocupado
        onAceptar={vi.fn()}
        onDeclinar={vi.fn()}
      />,
    );
    expect(screen.getByTestId('aceptar-oferta')).toBeDisabled();
    expect(screen.getByTestId('declinar-oferta')).toBeDisabled();
  });
});
