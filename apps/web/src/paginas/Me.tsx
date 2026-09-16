import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, codigoDeError } from '../api/cliente';
import type { MiPosicion, MotivoDeclinacion, VistaOferta, VistaTr } from '../api/tipos';
import { OfertaCard } from '../componentes/OfertaCard';
import { textoPosicion, tonoEstado, traducirError } from '../utils/formato';

const REFRESCO_MS = 4_000;

/** "Mi turno" (spec §9.2 Member): posición, oferta activa, histórico de TR propios. */
export function Me() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const posiciones = useQuery({
    queryKey: ['me', 'cola'],
    queryFn: () => api<MiPosicion[]>('/me/cola'),
    refetchInterval: REFRESCO_MS,
  });
  const ofertas = useQuery({
    queryKey: ['me', 'ofertas'],
    queryFn: () => api<VistaOferta[]>('/me/ofertas'),
    refetchInterval: REFRESCO_MS,
  });
  const trs = useQuery({
    queryKey: ['me', 'trs'],
    queryFn: () => api<VistaTr[]>('/me/trs'),
    refetchInterval: REFRESCO_MS,
  });
  const motivos = useQuery({
    queryKey: ['motivos-declinacion'],
    queryFn: () => api<MotivoDeclinacion[]>('/motivos-declinacion'),
  });

  const invalidar = () => void queryClient.invalidateQueries({ queryKey: ['me'] });

  const aceptar = useMutation({
    mutationFn: (id: string) => api<{ tr: VistaTr }>(`/ofertas/${id}/aceptar`, { method: 'POST' }),
    onSuccess: () => {
      setError(null);
      invalidar();
    },
    onError: (e) => setError(traducirError(codigoDeError(e))),
  });
  const declinar = useMutation({
    mutationFn: ({ id, motivoId, nota }: { id: string; motivoId: string; nota: string }) =>
      api(`/ofertas/${id}/declinar`, {
        method: 'POST',
        body: { motivoId, nota: nota || undefined },
      }),
    onSuccess: () => {
      setError(null);
      invalidar();
    },
    onError: (e) => setError(traducirError(codigoDeError(e))),
  });

  const abiertas = ofertas.data?.filter((o) => o.estado === 'abierta') ?? [];
  const ocupado = aceptar.isPending || declinar.isPending;

  return (
    <div className="mi-turno">
      {error && (
        <p role="alert" className="error" data-testid="error-me">
          {error}
        </p>
      )}
      <section className="card">
        <h2>Tu posición</h2>
        {posiciones.data?.length === 0 && <p className="detalle">No tienes placas en cola.</p>}
        {posiciones.data?.map((p) => (
          <p key={p.placa} className="posicion" data-testid="mi-posicion">
            {textoPosicion(p.claseCola, p.posicion, p.total)} · <strong>{p.placa}</strong>
          </p>
        ))}
      </section>

      <section>
        <h2>Oferta activa</h2>
        {abiertas.length === 0 && (
          <p className="detalle" data-testid="sin-oferta">
            No tienes ofertas abiertas. Te avisaremos cuando llegue tu turno.
          </p>
        )}
        {abiertas.map((o) => (
          <OfertaCard
            key={o.id}
            oferta={o}
            motivos={motivos.data ?? []}
            ocupado={ocupado}
            onAceptar={() => aceptar.mutate(o.id)}
            onDeclinar={(motivoId, nota) => declinar.mutate({ id: o.id, motivoId, nota })}
          />
        ))}
      </section>

      <section className="card" data-testid="mis-trs">
        <h2>Mis TR</h2>
        {trs.data?.length === 0 && <p className="detalle">Todavía no tienes TR.</p>}
        <ul className="lista">
          {trs.data?.map((t) => (
            <li key={t.id} className={`item ${tonoEstado(t.estado)}`}>
              <span className={`badge ${tonoEstado(t.estado)}`}>{t.estado}</span>{' '}
              <strong>{t.codigo}</strong>{' '}
              <span className="detalle">
                {t.placa} · {t.cliente} · {t.destino ?? '—'} · {t.fechaAsignacion}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
