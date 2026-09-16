import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CLASES_COLA, puede, type ClaseCola } from '@asotracmet/shared';
import { api, codigoDeError } from '../api/cliente';
import type { Cliente, VistaCola, VistaOferta, VistaRequerimiento, VistaTr } from '../api/tipos';
import { useSesion } from '../sesion/contexto';
import { formatearFechaHora, textoElegibilidad, tonoEstado, traducirError } from '../utils/formato';

const REFRESCO_MS = 4_000;

/** Sala de turnos (spec §9.2 Ops): requerimientos · colas · actividad. El frontend nunca elige "quién sigue". */
export function Ops() {
  const { sesion } = useSesion();
  const rol = sesion?.usuario.rol ?? 'viewer';
  const puedeOfrecer = puede(rol, 'ofertas', 'C');
  const puedeAnular = puede(rol, 'ofertas', 'A') && rol !== 'member';
  const queryClient = useQueryClient();
  const [clase, setClase] = useState<ClaseCola>('TM-CBZ');
  const [clienteId, setClienteId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const clientes = useQuery({ queryKey: ['clientes'], queryFn: () => api<Cliente[]>('/clientes') });
  const clienteActivo = clienteId || clientes.data?.[0]?.id || '';

  const requerimientos = useQuery({
    queryKey: ['requerimientos', 'abierto'],
    queryFn: () => api<VistaRequerimiento[]>('/requerimientos?estado=abierto'),
    refetchInterval: REFRESCO_MS,
  });
  const cola = useQuery({
    queryKey: ['cola', clase, clienteActivo],
    queryFn: () =>
      api<VistaCola>(`/colas/${clase}${clienteActivo ? `?clienteId=${clienteActivo}` : ''}`),
    refetchInterval: REFRESCO_MS,
  });
  const ofertas = useQuery({
    queryKey: ['ofertas', 'abierta'],
    queryFn: () => api<VistaOferta[]>('/ofertas?estado=abierta'),
    refetchInterval: REFRESCO_MS,
  });
  const trs = useQuery({
    queryKey: ['trs'],
    queryFn: () => api<VistaTr[]>('/trs'),
    refetchInterval: REFRESCO_MS,
  });

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ['requerimientos'] });
    void queryClient.invalidateQueries({ queryKey: ['cola'] });
    void queryClient.invalidateQueries({ queryKey: ['ofertas'] });
    void queryClient.invalidateQueries({ queryKey: ['trs'] });
  };

  const ofrecer = useMutation({
    mutationFn: (requerimientoId: string) =>
      api<VistaOferta>(`/requerimientos/${requerimientoId}/ofertas`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
      }),
    onSuccess: () => {
      setError(null);
      invalidar();
    },
    onError: (e) => setError(traducirError(codigoDeError(e))),
  });

  const anular = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      api<VistaOferta>(`/ofertas/${id}/anular`, { method: 'POST', body: { motivo } }),
    onSuccess: () => {
      setError(null);
      invalidar();
    },
    onError: (e) => setError(traducirError(codigoDeError(e))),
  });

  return (
    <div className="sala">
      {error && (
        <p role="alert" className="error" data-testid="error-ops">
          {error}
        </p>
      )}
      <section className="columna" aria-labelledby="titulo-req">
        <h2 id="titulo-req">Requerimientos abiertos</h2>
        {requerimientos.data?.length === 0 && (
          <p className="detalle">Sin requerimientos abiertos.</p>
        )}
        {requerimientos.data?.map((r) => (
          <article key={r.id} className="card" data-testid={`requerimiento-${r.id}`}>
            <h3>
              {r.cliente} · {r.destino ?? 'Destino por confirmar'} · {r.claseCola} x
              {r.cantidadCupos}
            </h3>
            <p className="detalle">
              Servicio {r.fechaServicio} · asignados {r.cuposAsignados} · ofertas abiertas{' '}
              {r.ofertasAbiertas} · libres {r.cuposDisponibles}
            </p>
            {r.observaciones && <p className="detalle">{r.observaciones}</p>}
            {puedeOfrecer && (
              <button
                type="button"
                data-testid={`ofrecer-${r.id}`}
                disabled={ofrecer.isPending || r.cuposDisponibles === 0}
                onClick={() => ofrecer.mutate(r.id)}
              >
                Ofrecer cupo
              </button>
            )}
          </article>
        ))}
      </section>

      <section className="columna ancha" aria-labelledby="titulo-colas">
        <h2 id="titulo-colas">Colas</h2>
        <div className="pestanas" role="tablist">
          {CLASES_COLA.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={c === clase}
              className={c === clase ? 'activo' : ''}
              data-testid={`cola-tab-${c}`}
              onClick={() => setClase(c)}
            >
              {c}
            </button>
          ))}
          <select
            data-testid="cola-cliente"
            value={clienteActivo}
            onChange={(e) => setClienteId(e.target.value)}
            aria-label="Cliente para evaluar habilitación"
          >
            {clientes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo}
              </option>
            ))}
          </select>
        </div>
        <table className="tabla" data-testid={`cola-${clase}`}>
          <thead>
            <tr>
              <th>#</th>
              <th>Placa · asociado</th>
              <th>Ronda</th>
              <th>Turnos</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {cola.data?.posiciones.map((p) => {
              const cabeza = cola.data?.cabezaElegible === p.vehiculoId;
              return (
                <tr
                  key={p.vehiculoId}
                  data-testid={`cola-fila-${p.placa}`}
                  data-cabeza={cabeza ? 'true' : 'false'}
                  className={cabeza ? 'cabeza' : p.elegibilidad.elegible ? '' : 'gris'}
                  title={p.elegibilidad.detalle ?? undefined}
                >
                  <td>{p.posicion}</td>
                  <td>
                    <strong>{p.placa}</strong> <span className="detalle">{p.etiqueta}</span>
                    {cabeza && <span className="badge verde">Siguiente</span>}
                  </td>
                  <td>{p.ciclo}</td>
                  <td>
                    {p.turnosTomados}/{p.turnosOfrecidos}
                  </td>
                  <td>
                    <span className={`badge ${p.elegibilidad.elegible ? 'verde' : 'gris'}`}>
                      {textoElegibilidad(p.elegibilidad.motivo)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {cola.data && cola.data.total === 0 && <p className="detalle">Cola vacía.</p>}
      </section>

      <section className="columna" aria-labelledby="titulo-act" data-testid="actividad">
        <h2 id="titulo-act">Actividad</h2>
        <h3>Ofertas abiertas</h3>
        {ofertas.data?.length === 0 && <p className="detalle">Ninguna.</p>}
        <ul className="lista">
          {ofertas.data?.map((o) => (
            <li key={o.id} className="item ambar" data-testid="oferta-abierta">
              <span className="badge ambar">Oferta</span> <strong>{o.placa}</strong>{' '}
              <span className="detalle">
                {o.requerimiento?.cliente} · expira {formatearFechaHora(o.expiraEn)}
              </span>
              {puedeAnular && (
                <button
                  type="button"
                  className="secundario"
                  data-testid={`anular-${o.id}`}
                  onClick={() => {
                    const motivo = window.prompt('Motivo de anulación (obligatorio)');
                    if (motivo && motivo.trim().length >= 3)
                      anular.mutate({ id: o.id, motivo: motivo.trim() });
                  }}
                >
                  Anular
                </button>
              )}
            </li>
          ))}
        </ul>
        <h3>TR recientes</h3>
        <ul className="lista">
          {trs.data?.slice(0, 15).map((t) => (
            <li key={t.id} className={`item ${tonoEstado(t.estado)}`} data-testid="tr-item">
              <span className={`badge ${tonoEstado(t.estado)}`}>{t.estado}</span>{' '}
              <button
                type="button"
                className="enlace"
                title="Copiar código"
                onClick={() => void navigator.clipboard?.writeText(t.codigo)}
              >
                {t.codigo}
              </button>{' '}
              <strong>{t.placa}</strong>{' '}
              <span className="detalle">
                {t.cliente} · {t.fechaAsignacion}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
