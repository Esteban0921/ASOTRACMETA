import type { VistaUbicacion } from '../api/tipos';
import { textoFrescura, textoHace, tonoFrescura, urlMapaExterno } from '../utils/formato';

// Última ubicación conocida de una placa (ADR-0007, TASK-0065).
//
// Componente autocontenido a propósito: se inserta con una línea en la ficha, en la sala de turnos
// y en "Mi turno", y el rediseño (TASK-0048/0050) puede moverlo sin tocar ninguna pantalla.
//
// Quien recibe la ubicación enmascarada (el veedor, `R*` en la matriz) no ve coordenadas ni enlace
// al mapa: solo si el camión reporta y hace cuánto. Eso no se decide aquí, llega decidido de la
// API; la UI simplemente no puede pintar lo que no tiene.

interface Props {
  ubicacion: VistaUbicacion | null | undefined;
  /** `completo` añade coordenadas y enlace al mapa; `chip` es solo el estado y el "hace X". */
  variante?: 'completo' | 'chip';
  placa?: string;
}

export function UltimaUbicacion({ ubicacion, variante = 'completo', placa }: Props) {
  const testId = `ubicacion-${placa ?? ubicacion?.placa ?? 'sin-placa'}`;

  if (!ubicacion) {
    return (
      <span className="badge gris" data-testid={testId} title="Esta placa nunca ha reportado">
        Sin GPS
      </span>
    );
  }

  const estado = (
    <span className={`badge ${tonoFrescura(ubicacion.frescura)}`} data-testid={testId}>
      {textoFrescura(ubicacion.frescura)} · {textoHace(ubicacion.minutosDesde)}
    </span>
  );

  if (variante === 'chip') return estado;

  const hayCoordenadas = ubicacion.latitud !== null && ubicacion.longitud !== null;
  return (
    <p className="detalle">
      {estado}{' '}
      {hayCoordenadas ? (
        <>
          <span data-testid={`${testId}-coordenadas`}>
            {ubicacion.latitud!.toFixed(5)}, {ubicacion.longitud!.toFixed(5)}
          </span>{' '}
          <a
            href={urlMapaExterno(ubicacion.latitud!, ubicacion.longitud!)}
            target="_blank"
            rel="noreferrer"
            data-testid={`${testId}-mapa`}
          >
            Ver en el mapa
          </a>
        </>
      ) : (
        <span className="detalle">Ubicación reservada para tu rol</span>
      )}
    </p>
  );
}
