import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../api/cliente';
import type { VistaUbicacion } from '../api/tipos';
import { textoFrescura, textoHace, tonoFrescura } from '../utils/formato';

// Mapa de la flota (ADR-0007, TASK-0066). Carga perezosa: Leaflet y sus estilos solo llegan al
// navegador de quien abre esta pantalla, y su trozo queda fuera del precache de la PWA (ver
// vite.config.ts), que está pensado para que "Mi turno" funcione sin conexión, no para cartografía.
//
// Al servidor de teselas le llegan las coordenadas que se consultan: por eso el mapa es una
// pantalla aparte y no se pinta en la sala de turnos. Quien recibe la ubicación enmascarada (el
// veedor) no entra aquí: la API le niega el recorrido y no le manda coordenadas.

const REFRESCO_MS = 60_000;
/** Villavicencio: el centro de la operación mientras no haya ninguna posición que encuadrar. */
const CENTRO: [number, number] = [4.142, -73.6266];
const TESELAS =
  (import.meta.env.VITE_MAPA_TILES_URL as string | undefined) ??
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATRIBUCION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const COLOR: Record<string, string> = {
  verde: '#2f7d4f',
  ambar: '#b8860b',
  rojo: '#a33',
  gris: '#777',
};

export function Mapa() {
  const contenedor = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<L.Map | null>(null);
  const capaPuntos = useRef<L.LayerGroup | null>(null);
  const capaRuta = useRef<L.LayerGroup | null>(null);
  const [seleccionada, setSeleccionada] = useState<VistaUbicacion | null>(null);

  const ubicaciones = useQuery({
    queryKey: ['mapa', 'ubicaciones'],
    queryFn: () => api<VistaUbicacion[]>('/vehiculos/ubicaciones'),
    refetchInterval: REFRESCO_MS,
  });
  const recorrido = useQuery({
    queryKey: ['mapa', 'recorrido', seleccionada?.vehiculoId],
    queryFn: () => api<VistaUbicacion[]>(`/vehiculos/${seleccionada!.vehiculoId}/ubicaciones`),
    enabled: seleccionada !== null,
  });

  // El mapa se crea una vez y se destruye al salir: React no sabe nada de lo que pinta Leaflet.
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    const instancia = L.map(contenedor.current).setView(CENTRO, 8);
    L.tileLayer(TESELAS, { attribution: ATRIBUCION, maxZoom: 18 }).addTo(instancia);
    capaPuntos.current = L.layerGroup().addTo(instancia);
    capaRuta.current = L.layerGroup().addTo(instancia);
    mapa.current = instancia;
    return () => {
      instancia.remove();
      mapa.current = null;
    };
  }, []);

  // Un punto por placa, con su color de frescura. Al tocarlo se pide su recorrido.
  useEffect(() => {
    const capa = capaPuntos.current;
    const instancia = mapa.current;
    if (!capa || !instancia) return;
    capa.clearLayers();
    const conCoordenadas = (ubicaciones.data ?? []).filter(
      (u) => u.latitud !== null && u.longitud !== null,
    );
    for (const u of conCoordenadas) {
      L.circleMarker([u.latitud!, u.longitud!], {
        radius: 8,
        color: COLOR[tonoFrescura(u.frescura)] ?? COLOR.gris,
        fillOpacity: 0.85,
      })
        .bindTooltip(`${u.placa} · ${textoHace(u.minutosDesde)}`, { permanent: false })
        .on('click', () => setSeleccionada(u))
        .addTo(capa);
    }
    if (conCoordenadas.length > 0) {
      instancia.fitBounds(
        L.latLngBounds(conCoordenadas.map((u) => [u.latitud!, u.longitud!] as [number, number])),
        { padding: [40, 40], maxZoom: 13 },
      );
    }
  }, [ubicaciones.data]);

  // La línea del recorrido de la placa elegida (últimas 24 h).
  useEffect(() => {
    const capa = capaRuta.current;
    if (!capa) return;
    capa.clearLayers();
    const puntos = (recorrido.data ?? [])
      .filter((u) => u.latitud !== null && u.longitud !== null)
      .map((u) => [u.latitud!, u.longitud!] as [number, number]);
    if (puntos.length > 1) {
      L.polyline(puntos, { color: '#0f3d3e', weight: 3, opacity: 0.8 }).addTo(capa);
    }
  }, [recorrido.data]);

  const total = (ubicaciones.data ?? []).length;
  return (
    <div className="pagina" data-testid="mapa">
      <section className="card">
        <h2>Mapa de la flota</h2>
        <p className="detalle" data-testid="mapa-resumen">
          {ubicaciones.isPending
            ? 'Cargando ubicaciones…'
            : `${total} ${total === 1 ? 'placa reportando' : 'placas con ubicación'}`}
          {seleccionada && (
            <>
              {' · '}
              <strong>{seleccionada.placa}</strong>{' '}
              <span className={`badge ${tonoFrescura(seleccionada.frescura)}`}>
                {textoFrescura(seleccionada.frescura)} · {textoHace(seleccionada.minutosDesde)}
              </span>{' '}
              <button type="button" className="enlace" onClick={() => setSeleccionada(null)}>
                quitar recorrido
              </button>
            </>
          )}
        </p>
        <div
          ref={contenedor}
          className="mapa"
          data-testid="mapa-lienzo"
          style={{ height: '65vh', minHeight: 320, borderRadius: 8 }}
        />
        <p className="detalle">
          Toca un punto para ver por dónde anduvo en las últimas 24 horas. Las posiciones se
          refrescan solas y vienen del GPS de cada propietario.
        </p>
      </section>
    </div>
  );
}

export default Mapa;
