import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { puede } from '@asotracmet/shared';
import { api } from '../api/cliente';
import type { Tablero as TableroMes } from '../api/tipos';
import { useSesion } from '../sesion/contexto';
import { formatearPesos, mesActual } from '../utils/formato';

const REFRESCO_MS = 15_000;

/**
 * Tablero del mes (spec §9.2 Viewer): viajes, declinaciones y equidad (turnos tomados vs
 * ofrecidos por placa). Solo lectura; la cola en vivo sin botones ya está en la sala de turnos.
 */
export function Tablero() {
  const { sesion } = useSesion();
  const rol = sesion?.usuario.rol ?? 'viewer';
  const [mes, setMes] = useState(mesActual());
  const tablero = useQuery({
    queryKey: ['tablero', mes],
    queryFn: () => api<TableroMes>(`/tablero?mes=${mes}`),
    refetchInterval: REFRESCO_MS,
    enabled: rol !== 'member',
  });

  if (rol === 'member' || !puede(rol, 'trs', 'R')) return <Navigate to="/me" replace />;
  const t = tablero.data;
  const porcentaje = (tomadas: number, ofrecidas: number) =>
    ofrecidas === 0 ? '—' : `${Math.round((tomadas / ofrecidas) * 100)} %`;

  return (
    <div className="admin tablero">
      <div className="pestanas">
        <h2>Tablero del mes</h2>
        <label>
          Mes
          <input
            type="month"
            value={mes}
            data-testid="tablero-mes"
            onChange={(e) => setMes(e.target.value || mesActual())}
          />
        </label>
      </div>
      {t && (
        <>
          <section className="card" data-testid="tablero-resumen">
            <h3>Ofertas y TR</h3>
            <p>
              Ofrecidas <strong data-testid="tablero-ofrecidas">{t.ofertas.ofrecidas}</strong> ·
              aceptadas <strong data-testid="tablero-aceptadas">{t.ofertas.aceptadas}</strong> ·
              declinadas <strong data-testid="tablero-declinadas">{t.ofertas.declinadas}</strong> ·
              expiradas <strong>{t.ofertas.expiradas}</strong> · anuladas{' '}
              <strong>{t.ofertas.anuladas}</strong> · abiertas <strong>{t.ofertas.abiertas}</strong>
            </p>
            <p>
              TR asignados <strong>{t.trs.asignados}</strong> · cumplidos{' '}
              <strong>{t.trs.cumplidos}</strong> · cancelados <strong>{t.trs.cancelados}</strong> ·
              no tramitados <strong>{t.trs.noTramitar}</strong>
            </p>
            <h3>Viajes y recaudo</h3>
            <p>
              Viajes <strong>{t.viajes.total}</strong> (liquidados {t.viajes.liquidados}) · flete{' '}
              <strong>{formatearPesos(t.viajes.flete)}</strong> · recaudo{' '}
              <strong>{formatearPesos(t.viajes.recaudo)}</strong> · pagado{' '}
              {formatearPesos(t.viajes.pagado)} · pendiente {formatearPesos(t.viajes.pendiente)}
            </p>
          </section>

          <section className="card">
            <h3>Por clase</h3>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Clase</th>
                  <th>Ofrecidas</th>
                  <th>Tomadas</th>
                  <th>Declinadas</th>
                </tr>
              </thead>
              <tbody>
                {t.porClase.map((c) => (
                  <tr key={c.claseCola}>
                    <td>{c.claseCola}</td>
                    <td>{c.ofrecidas}</td>
                    <td>{c.tomadas}</td>
                    <td>{c.declinadas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {t.declinacionesPorMotivo.length > 0 && (
              <p className="detalle" data-testid="tablero-motivos">
                Declinaciones por motivo:{' '}
                {t.declinacionesPorMotivo.map((m) => `${m.motivo} (${m.total})`).join(' · ')}
              </p>
            )}
          </section>

          <section className="card">
            <h3>Equidad por placa</h3>
            <table className="tabla" data-testid="tablero-equidad">
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Ofrecidas</th>
                  <th>Tomadas</th>
                  <th>Declinadas</th>
                  <th>Expiradas</th>
                  <th>Tomó</th>
                  <th>TR</th>
                  <th>Viajes</th>
                  <th>Recaudo</th>
                </tr>
              </thead>
              <tbody>
                {t.equidad.length === 0 && (
                  <tr>
                    <td colSpan={9} className="detalle">
                      Sin movimientos en {mes}.
                    </td>
                  </tr>
                )}
                {t.equidad.map((e) => (
                  <tr key={e.vehiculoId} data-testid={`tablero-placa-${e.placa}`}>
                    <td>{e.etiqueta}</td>
                    <td>{e.ofrecidas}</td>
                    <td>{e.tomadas}</td>
                    <td>{e.declinadas}</td>
                    <td>{e.expiradas}</td>
                    <td>{porcentaje(e.tomadas, e.ofrecidas)}</td>
                    <td>{e.trs}</td>
                    <td>{e.viajes}</td>
                    <td>{formatearPesos(e.recaudo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
