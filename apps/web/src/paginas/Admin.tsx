import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { CLASES_COLA, type ClaseCola } from '@asotracmet/shared';
import { reauth } from '../api/auth';
import { api, codigoDeError } from '../api/cliente';
import type { Intervencion, VistaCola } from '../api/tipos';
import { useSesion } from '../sesion/contexto';
import { formatearFechaHora, textoIntervencion, traducirError } from '../utils/formato';

const CODIGO = /^\d{6}$/;

/**
 * Administración de la cola (spec §9.2 Superadmin): override y reset como acciones de dominio
 * auditadas, con motivo, confirmación y segundo factor. Nunca un input numérico sobre `posicion`.
 */
export function Admin() {
  const { sesion } = useSesion();
  const queryClient = useQueryClient();
  const [clase, setClase] = useState<ClaseCola>('TM-CBZ');
  const [vehiculoId, setVehiculoId] = useState('');
  const [posicion, setPosicion] = useState(1);
  const [motivoOverride, setMotivoOverride] = useState('');
  const [codigoOverride, setCodigoOverride] = useState('');
  const [motivoReset, setMotivoReset] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [codigoReset, setCodigoReset] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cola = useQuery({
    queryKey: ['cola', clase, ''],
    queryFn: () => api<VistaCola>(`/colas/${clase}`),
  });
  const intervenciones = useQuery({
    queryKey: ['intervenciones', clase],
    queryFn: () => api<Intervencion[]>(`/colas/${clase}/intervenciones`),
  });

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ['cola'] });
    void queryClient.invalidateQueries({ queryKey: ['intervenciones'] });
  };

  const override = useMutation({
    mutationFn: async () => {
      await reauth({ codigo: codigoOverride });
      return api<VistaCola>(`/colas/${clase}/override`, {
        method: 'POST',
        body: { vehiculoId, posicion, motivo: motivoOverride },
      });
    },
    onSuccess: () => {
      setError(null);
      setMensaje('Placa movida. La intervención queda en la auditoría.');
      setMotivoOverride('');
      setCodigoOverride('');
      invalidar();
    },
    onError: (e) => setError(traducirError(codigoDeError(e))),
  });

  const reset = useMutation({
    mutationFn: async () => {
      await reauth({ codigo: codigoReset });
      return api<VistaCola>(`/colas/${clase}/reset`, {
        method: 'POST',
        body: { motivo: motivoReset, confirmacion },
      });
    },
    onSuccess: (resultado) => {
      setError(null);
      setMensaje(`Cola ${clase} reseteada: ${resultado.total} placas activas, contadores a cero.`);
      setMotivoReset('');
      setConfirmacion('');
      setCodigoReset('');
      invalidar();
    },
    onError: (e) => setError(traducirError(codigoDeError(e))),
  });

  if (sesion?.usuario.rol !== 'superadmin') return <Navigate to="/ops" replace />;

  const total = cola.data?.total ?? 0;
  const puedeMover =
    vehiculoId !== '' &&
    motivoOverride.trim().length >= 3 &&
    CODIGO.test(codigoOverride) &&
    !override.isPending;
  const puedeResetear =
    motivoReset.trim().length >= 3 &&
    confirmacion === 'RESETEAR' &&
    CODIGO.test(codigoReset) &&
    !reset.isPending;

  function enviarOverride(evento: FormEvent) {
    evento.preventDefault();
    override.mutate();
  }

  function enviarReset(evento: FormEvent) {
    evento.preventDefault();
    // Doble confirmación (§9.2): texto literal en el formulario y confirmación explícita.
    const seguro = window.confirm(
      `Vas a resetear la cola ${clase}: se reordenan ${total} placas activas por placa y se reinician los contadores de ronda. ¿Continuar?`,
    );
    if (seguro) reset.mutate();
  }

  return (
    <div className="admin">
      <h2>Administración de la cola</h2>
      <p className="detalle">
        Cada intervención exige motivo y confirmación con el segundo factor, y queda visible para el
        veedor en la sala de turnos.
      </p>
      <div className="pestanas" role="tablist">
        {CLASES_COLA.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={c === clase}
            className={c === clase ? 'activo' : ''}
            data-testid={`admin-clase-${c}`}
            onClick={() => {
              setClase(c);
              setVehiculoId('');
              setPosicion(1);
              setMensaje(null);
            }}
          >
            {c}
          </button>
        ))}
      </div>
      {mensaje && (
        <p className="info" data-testid="admin-mensaje">
          {mensaje}
        </p>
      )}
      {error && (
        <p role="alert" className="error" data-testid="admin-error">
          {error}
        </p>
      )}

      <section className="card">
        <h3>Mover una placa (override)</h3>
        <form className="formulario" onSubmit={enviarOverride}>
          <label>
            Placa
            <select
              data-testid="override-placa"
              value={vehiculoId}
              onChange={(e) => setVehiculoId(e.target.value)}
            >
              <option value="">Elige una placa…</option>
              {cola.data?.posiciones.map((p) => (
                <option key={p.vehiculoId} value={p.vehiculoId}>
                  {p.posicion}. {p.placa}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nueva posición
            <select
              data-testid="override-posicion"
              value={posicion}
              onChange={(e) => setPosicion(Number(e.target.value))}
            >
              {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Motivo
            <input
              data-testid="override-motivo"
              value={motivoOverride}
              onChange={(e) => setMotivoOverride(e.target.value)}
              maxLength={500}
            />
          </label>
          <label>
            Código de tu aplicación de autenticación
            <input
              data-testid="override-codigo"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              value={codigoOverride}
              onChange={(e) => setCodigoOverride(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <button type="submit" data-testid="override-enviar" disabled={!puedeMover}>
            Mover placa
          </button>
        </form>
      </section>

      <section className="card">
        <h3>Resetear la cola {clase}</h3>
        <p className="detalle">
          La cola pasa a ser exactamente los vehículos activos de la clase, ordenados por placa, con
          los contadores de ronda a cero. El estado anterior queda en la auditoría.
        </p>
        <form className="formulario" onSubmit={enviarReset}>
          <label>
            Motivo
            <textarea
              data-testid="reset-motivo"
              value={motivoReset}
              onChange={(e) => setMotivoReset(e.target.value)}
              maxLength={500}
              rows={2}
            />
          </label>
          <label>
            Escribe RESETEAR para confirmar
            <input
              data-testid="reset-confirmacion"
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label>
            Código de tu aplicación de autenticación
            <input
              data-testid="reset-codigo"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              value={codigoReset}
              onChange={(e) => setCodigoReset(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <button
            type="submit"
            className="peligro"
            data-testid="reset-enviar"
            disabled={!puedeResetear}
          >
            Resetear cola
          </button>
        </form>
      </section>

      <section className="card" data-testid="admin-intervenciones">
        <h3>Intervenciones en {clase}</h3>
        {intervenciones.data?.length === 0 && <p className="detalle">Sin intervenciones.</p>}
        <ul className="lista">
          {intervenciones.data?.map((i) => (
            <li key={i.id} className="item">
              <span className="badge rojo">{textoIntervencion(i.accion)}</span>{' '}
              <span className="detalle">
                {formatearFechaHora(i.at)} · {i.actorRol} · {i.after?.motivo ?? ''}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
