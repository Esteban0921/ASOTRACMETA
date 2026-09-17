import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, codigoDeError } from '../api/cliente';
import type { Notificacion, PreferenciasNotificacion } from '../api/tipos';
import { traducirError } from '../utils/formato';

const REFRESCO_MS = 10_000;
const POR_DEFECTO: PreferenciasNotificacion = { correo: true, whatsapp: false, celular: null };

function fechaHora(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

/** Bandeja de avisos y preferencias de canal (spec §11, TASK-0026). Para todos los roles. */
export function Notificaciones() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [editadas, setEditadas] = useState<PreferenciasNotificacion | null>(null);

  const avisos = useQuery({
    queryKey: ['me', 'notificaciones'],
    queryFn: () => api<Notificacion[]>('/me/notificaciones?limite=100'),
    refetchInterval: REFRESCO_MS,
  });
  const preferencias = useQuery({
    queryKey: ['me', 'preferencias'],
    queryFn: () => api<PreferenciasNotificacion>('/me/preferencias'),
  });
  // Hasta que el usuario toca el formulario, muestra lo guardado; después, lo editado.
  const form = editadas ?? preferencias.data ?? POR_DEFECTO;
  const setForm = (p: PreferenciasNotificacion) => setEditadas(p);

  const leer = useMutation({
    mutationFn: (id: string) => api(`/me/notificaciones/${id}/leer`, { method: 'POST' }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['me', 'notificaciones'] });
    },
    onError: (e) => setError(traducirError(codigoDeError(e))),
  });
  const guardar = useMutation({
    mutationFn: (p: PreferenciasNotificacion) =>
      api<PreferenciasNotificacion>('/me/preferencias', { method: 'PATCH', body: p }),
    onSuccess: (p) => {
      setError(null);
      setMensaje('Preferencias guardadas');
      queryClient.setQueryData(['me', 'preferencias'], p);
      setEditadas(null);
    },
    onError: (e) => {
      setMensaje(null);
      setError(traducirError(codigoDeError(e)));
    },
  });

  const noLeidas = avisos.data?.filter((n) => !n.leidaEn).length ?? 0;

  return (
    <div className="mi-turno">
      {error && (
        <p role="alert" className="error" data-testid="error-notificaciones">
          {error}
        </p>
      )}
      <section className="card" data-testid="avisos">
        <h2>Avisos{noLeidas > 0 ? ` (${noLeidas} sin leer)` : ''}</h2>
        {avisos.data?.length === 0 && (
          <p className="detalle" data-testid="sin-avisos">
            Sin avisos todavía. Aquí verás tus turnos, TR y vencimientos.
          </p>
        )}
        <ul className="lista">
          {avisos.data?.map((n) => (
            <li
              key={n.id}
              className="item"
              data-testid={`aviso-${n.evento}`}
              data-leida={n.leidaEn ? 'si' : 'no'}
            >
              <strong>{n.asunto}</strong> <span className="detalle">{fechaHora(n.creadaEn)}</span>
              <p>{n.texto}</p>
              {n.leidaEn ? (
                <span className="badge">Leída</span>
              ) : (
                <button
                  type="button"
                  className="secundario"
                  disabled={leer.isPending}
                  onClick={() => leer.mutate(n.id)}
                  data-testid="aviso-leer"
                >
                  Marcar leída
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card" data-testid="preferencias">
        <h2>Cómo quieres que te avisemos</h2>
        <p className="detalle">
          Los avisos siempre aparecen en esta bandeja. Correo y WhatsApp son opcionales.
        </p>
        <form
          className="formulario"
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate(form);
          }}
        >
          <label>
            <input
              type="checkbox"
              checked={form.correo}
              onChange={(e) => setForm({ ...form, correo: e.target.checked })}
              data-testid="pref-correo"
            />{' '}
            Correo electrónico
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.checked })}
              data-testid="pref-whatsapp"
            />{' '}
            WhatsApp
          </label>
          <label>
            Celular con indicativo (p. ej. +573001234567)
            <input
              type="tel"
              value={form.celular ?? ''}
              onChange={(e) => setForm({ ...form, celular: e.target.value.trim() || null })}
              data-testid="pref-celular"
            />
          </label>
          <div className="acciones">
            <button type="submit" disabled={guardar.isPending} data-testid="pref-guardar">
              Guardar
            </button>
            {mensaje && (
              <span className="info" data-testid="pref-mensaje">
                {mensaje}
              </span>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
