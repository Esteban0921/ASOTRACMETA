import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, codigoDeError, descargar } from '../api/cliente';
import { UltimaUbicacion } from '../componentes/UltimaUbicacion';
import type {
  VistaUbicacion,
  AlertaDocumento,
  MiPosicion,
  MotivoDeclinacion,
  VistaOferta,
  VistaTr,
} from '../api/tipos';
import { OfertaCard } from '../componentes/OfertaCard';
import { textoPosicion, tonoEstado, tonoSemaforo, traducirError } from '../utils/formato';

const REFRESCO_MS = 4_000;
// La ubicación cambia cada `gps_intervalo_minutos` (20 por defecto): no hace falta el refresco
// de 4 s del resto de la pantalla.
const REFRESCO_UBICACIONES_MS = 60_000;

/** "Mi turno" (spec §9.2 Member): posición, oferta activa, histórico de TR propios. */
export function Me() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const posiciones = useQuery({
    queryKey: ['me', 'cola'],
    queryFn: () => api<MiPosicion[]>('/me/cola'),
    refetchInterval: REFRESCO_MS,
  });
  const ubicaciones = useQuery({
    queryKey: ['me', 'ubicaciones'],
    queryFn: () => api<VistaUbicacion[]>('/vehiculos/ubicaciones'),
    refetchInterval: REFRESCO_UBICACIONES_MS,
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
  // Semáforo de documentos propios, solo lectura (spec §9.2 Member: "SOAT vence en 12 días").
  const alertas = useQuery({
    queryKey: ['me', 'alertas'],
    queryFn: () => api<AlertaDocumento[]>('/documentos/alertas'),
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

      <section className="card" data-testid="mis-ubicaciones">
        <h2>Tu camión</h2>
        {(ubicaciones.data ?? []).length === 0 && (
          <p className="detalle">Todavía no hay ubicación de tus placas.</p>
        )}
        {ubicaciones.data?.map((u) => (
          <div key={u.vehiculoId}>
            <p className="posicion">
              <strong>{u.placa}</strong>
            </p>
            <UltimaUbicacion ubicacion={u} />
          </div>
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

      <section className="card" data-testid="mis-documentos">
        <h2>Mis documentos</h2>
        {alertas.data?.length === 0 && <p className="detalle">Tus documentos están al día.</p>}
        <ul className="lista">
          {alertas.data?.map((a) => (
            <li key={a.id} className="item" data-testid={`mi-documento-${a.tipo?.codigo ?? a.id}`}>
              <span className={`badge ${tonoSemaforo(a.estado)}`}>
                {a.estado === 'vencido'
                  ? `Vencido hace ${Math.abs(a.diasParaVencer ?? 0)} d`
                  : `Vence en ${a.diasParaVencer ?? 0} d`}
              </span>{' '}
              <strong>{a.placa ?? a.sujeto}</strong>{' '}
              <span className="detalle">
                {a.tipo?.nombre ?? 'Documento'}
                {a.venceEn ? ` · vence ${a.venceEn}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card" data-testid="habeas-data">
        <h2>Tus datos</h2>
        <p className="detalle">
          Puedes pedir el extracto de tus TR, viajes y recaudos, junto con el propósito del
          tratamiento y cómo pedir corrección o supresión (habeas data).
        </p>
        <button
          type="button"
          className="secundario"
          data-testid="descargar-extracto"
          onClick={() => {
            descargar('/me/extracto', 'mi-extracto-asotracmet.json').catch((e: unknown) =>
              setError(traducirError(codigoDeError(e))),
            );
          }}
        >
          Descargar mi extracto
        </button>
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
