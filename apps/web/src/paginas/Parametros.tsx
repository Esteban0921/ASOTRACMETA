import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import {
  POLITICAS_DECLINACION,
  POLITICAS_OFERTA_EXPIRADA,
  PatchParametrosSchema,
  type Parametros as ParametrosDominio,
  type PatchParametros,
} from '@asotracmet/shared';
import { api, codigoDeError } from '../api/cliente';
import type { EventoAuditoria } from '../api/tipos';
import { useSesion } from '../sesion/contexto';
import { formatearFechaHora, resumenCambios, traducirError } from '../utils/formato';

/**
 * Parámetros de cola y recaudo (spec §9.2 Superadmin, §10): reglas como datos, editadas con
 * validación Zod compartida y confirmación; cada cambio queda en audit con antes y después.
 */
export function Parametros() {
  const { sesion } = useSesion();
  const queryClient = useQueryClient();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actuales = useQuery({
    queryKey: ['parametros'],
    queryFn: () => api<ParametrosDominio>('/parametros'),
  });
  const historial = useQuery({
    queryKey: ['audit', 'parametros'],
    queryFn: () => api<EventoAuditoria[]>('/audit?entidad=parametros&limite=20'),
  });

  if (sesion?.usuario.rol !== 'superadmin') return <Navigate to="/ops" replace />;

  return (
    <div className="admin">
      <h2>Parámetros de cola y recaudo</h2>
      <p className="detalle">
        Las reglas viven como datos: cambiarlas no toca código y queda auditado. Los viajes ya
        liquidados conservan su porcentaje; los nuevos usan el vigente.
      </p>
      {mensaje && (
        <p className="info" data-testid="param-mensaje">
          {mensaje}
        </p>
      )}
      {error && (
        <p role="alert" className="error" data-testid="param-error">
          {error}
        </p>
      )}
      {actuales.data && (
        <FormularioParametros
          key={JSON.stringify(actuales.data)}
          valores={actuales.data}
          onMensaje={(texto) => {
            setError(null);
            setMensaje(texto);
          }}
          onError={(texto) => {
            setMensaje(null);
            setError(texto);
          }}
          onGuardado={() => {
            void queryClient.invalidateQueries({ queryKey: ['parametros'] });
            void queryClient.invalidateQueries({ queryKey: ['audit'] });
          }}
        />
      )}
      <section className="card" data-testid="param-historial">
        <h3>Últimos cambios</h3>
        {historial.data?.length === 0 && <p className="detalle">Sin cambios registrados.</p>}
        <ul className="lista">
          {historial.data?.map((e) => (
            <li key={e.id} className="item">
              <span className="detalle">
                {formatearFechaHora(e.at)} · {e.actorRol}
              </span>{' '}
              <span>{resumenCambios(e.before, e.after).join(' · ')}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const NUMERICOS: ReadonlyArray<{
  clave: 'oferta_ttl_minutos' | 'declinacion_n' | 'declinacion_bloqueo_horas';
  etiqueta: string;
  ayuda: string;
}> = [
  {
    clave: 'oferta_ttl_minutos',
    etiqueta: 'Minutos para responder una oferta',
    ayuda: 'Pasado ese tiempo la oferta expira y aplica la política de oferta expirada.',
  },
  {
    clave: 'declinacion_n',
    etiqueta: 'Puestos que pierde una placa al declinar (política penaliza_n)',
    ayuda: 'Solo aplica con la política penaliza_n.',
  },
  {
    clave: 'declinacion_bloqueo_horas',
    etiqueta: 'Horas de bloqueo al declinar (política bloqueo_horas)',
    ayuda: 'Solo aplica con la política bloqueo_horas.',
  },
];

const BOOLEANOS: ReadonlyArray<{
  clave:
    | 'un_tr_activo_por_placa'
    | 'posicion_por_placa'
    | 'bloquear_por_documento_vencido'
    | 'consume_posicion_al_aceptar'
    | 'tr_cancelado_regresa_al_mismo'
    | 'reset_cola_requiere_2fa';
  etiqueta: string;
}> = [
  {
    clave: 'un_tr_activo_por_placa',
    etiqueta: 'Una placa no recibe oferta mientras tenga un TR activo',
  },
  {
    clave: 'posicion_por_placa',
    etiqueta: 'La posición en la cola es por placa (no por asociado)',
  },
  {
    clave: 'bloquear_por_documento_vencido',
    etiqueta: 'Un documento bloqueante vencido deja la placa no elegible',
  },
  { clave: 'consume_posicion_al_aceptar', etiqueta: 'Aceptar una oferta rota la placa al final' },
  {
    clave: 'tr_cancelado_regresa_al_mismo',
    etiqueta: 'Un TR cancelado se reofrece a la misma placa',
  },
  { clave: 'reset_cola_requiere_2fa', etiqueta: 'El reset de cola exige segundo factor' },
];

interface PropsFormulario {
  valores: ParametrosDominio;
  onMensaje: (texto: string) => void;
  onError: (texto: string) => void;
  onGuardado: () => void;
}

/** Se monta con `key` por valores del servidor: el borrador siempre parte de lo vigente. */
function FormularioParametros({ valores, onMensaje, onError, onGuardado }: PropsFormulario) {
  const [borrador, setBorrador] = useState<ParametrosDominio>(valores);

  const cambios: PatchParametros = {};
  for (const clave of Object.keys(borrador) as Array<keyof ParametrosDominio>) {
    if (clave === 'secuencia_tr') continue; // solo por runbook "secuencia TR desfasada"
    if (borrador[clave] !== valores[clave]) {
      (cambios as Record<string, unknown>)[clave] = borrador[clave];
    }
  }
  const clavesCambiadas = Object.keys(cambios);

  const guardar = useMutation({
    mutationFn: (patch: PatchParametros) =>
      api<ParametrosDominio>('/parametros', { method: 'PATCH', body: patch }),
    onSuccess: (_nuevos, patch) => {
      onMensaje(`Guardado: ${Object.keys(patch).join(', ')}.`);
      onGuardado();
    },
    onError: (e) => onError(traducirError(codigoDeError(e))),
  });

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const validado = PatchParametrosSchema.safeParse(cambios);
    if (!validado.success) {
      onError(validado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '));
      return;
    }
    if (clavesCambiadas.length === 0) {
      onError('No hay cambios que guardar.');
      return;
    }
    const detalle = clavesCambiadas
      .map(
        (k) =>
          `${k}: ${String(valores[k as keyof ParametrosDominio])} → ${String(borrador[k as keyof ParametrosDominio])}`,
      )
      .join('\n');
    if (window.confirm(`Vas a cambiar:\n${detalle}\n\nEl cambio queda auditado. ¿Continuar?`)) {
      guardar.mutate(validado.data);
    }
  }

  const porcentaje = Math.round(borrador.recaudo_porcentaje * 10_000) / 100;

  return (
    <form className="card formulario" onSubmit={enviar} data-testid="param-formulario">
      <label>
        Recaudo (% del flete)
        <input
          type="number"
          min={0}
          max={100}
          step={0.01}
          value={porcentaje}
          data-testid="param-recaudo_porcentaje"
          onChange={(e) =>
            setBorrador({
              ...borrador,
              recaudo_porcentaje: Math.round(Number(e.target.value) * 100) / 10_000,
            })
          }
        />
      </label>
      {NUMERICOS.map((n) => (
        <label key={n.clave}>
          {n.etiqueta}
          <input
            type="number"
            min={0}
            step={1}
            value={borrador[n.clave]}
            data-testid={`param-${n.clave}`}
            onChange={(e) => setBorrador({ ...borrador, [n.clave]: Number(e.target.value) })}
          />
          <span className="ayuda">{n.ayuda}</span>
        </label>
      ))}
      <label>
        Política al declinar
        <select
          value={borrador.declinacion_politica}
          data-testid="param-declinacion_politica"
          onChange={(e) =>
            setBorrador({
              ...borrador,
              declinacion_politica: e.target.value as ParametrosDominio['declinacion_politica'],
            })
          }
        >
          {POLITICAS_DECLINACION.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label>
        Política al expirar una oferta
        <select
          value={borrador.oferta_expirada_politica}
          data-testid="param-oferta_expirada_politica"
          onChange={(e) =>
            setBorrador({
              ...borrador,
              oferta_expirada_politica: e.target
                .value as ParametrosDominio['oferta_expirada_politica'],
            })
          }
        >
          {POLITICAS_OFERTA_EXPIRADA.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      {BOOLEANOS.map((b) => (
        <label key={b.clave} className="opcion">
          <input
            type="checkbox"
            checked={borrador[b.clave]}
            data-testid={`param-${b.clave}`}
            onChange={(e) => setBorrador({ ...borrador, [b.clave]: e.target.checked })}
          />{' '}
          {b.etiqueta}
        </label>
      ))}
      <label>
        Zona horaria
        <input
          value={borrador.timezone}
          data-testid="param-timezone"
          onChange={(e) => setBorrador({ ...borrador, timezone: e.target.value })}
        />
      </label>
      <p className="detalle">
        Secuencia TR: {borrador.secuencia_tr.prefix}
        {borrador.secuencia_tr.next} (solo se ajusta por el runbook «secuencia TR desfasada»).
      </p>
      <button
        type="submit"
        data-testid="param-guardar"
        disabled={guardar.isPending || clavesCambiadas.length === 0}
      >
        Guardar {clavesCambiadas.length > 0 ? `(${clavesCambiadas.length})` : ''}
      </button>
    </form>
  );
}
