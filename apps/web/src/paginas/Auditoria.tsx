import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api/cliente';
import type { EventoAuditoria } from '../api/tipos';
import { useSesion } from '../sesion/contexto';
import { formatearFechaHora, resumenCambios } from '../utils/formato';

const ENTIDADES = [
  'cola',
  'ofertas',
  'trs',
  'requerimientos',
  'parametros',
  'usuarios',
  'asociados',
  'vehiculos',
  'conductores',
  'documentos',
  'habilitaciones',
  'catalogos',
  'tarifas',
  'viajes',
  'recaudos',
] as const;

/** Auditoría filtrable (spec §9.2 Superadmin, §6.6): append-only, con antes y después legibles. */
export function Auditoria() {
  const { sesion } = useSesion();
  const [entidad, setEntidad] = useState('');
  const [id, setId] = useState('');
  const [accion, setAccion] = useState('');
  const [limite, setLimite] = useState(100);

  const consulta = new URLSearchParams({ limite: String(limite) });
  if (entidad) consulta.set('entidad', entidad);
  if (id.trim()) consulta.set('id', id.trim());
  const eventos = useQuery({
    queryKey: ['audit', 'todo', consulta.toString()],
    queryFn: () => api<EventoAuditoria[]>(`/audit?${consulta.toString()}`),
    enabled: sesion?.usuario.rol === 'superadmin',
  });

  if (sesion?.usuario.rol !== 'superadmin') return <Navigate to="/ops" replace />;

  const filtrados = (eventos.data ?? []).filter(
    (e) => !accion.trim() || e.accion.toLowerCase().includes(accion.trim().toLowerCase()),
  );

  return (
    <div className="admin">
      <h2>Auditoría</h2>
      <p className="detalle">
        Cada mutación deja actor, momento, acción y el antes/después. El registro no se edita ni se
        borra.
      </p>
      <form className="card formulario" onSubmit={(e) => e.preventDefault()}>
        <label>
          Entidad
          <select
            value={entidad}
            data-testid="audit-entidad"
            onChange={(e) => setEntidad(e.target.value)}
          >
            <option value="">Todas</option>
            {ENTIDADES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label>
          Id de la entidad
          <input
            value={id}
            data-testid="audit-id"
            placeholder="TM-CBZ, un id de TR…"
            onChange={(e) => setId(e.target.value)}
          />
        </label>
        <label>
          Acción contiene
          <input
            value={accion}
            data-testid="audit-accion"
            placeholder="oferta.declinar, cola.reset…"
            onChange={(e) => setAccion(e.target.value)}
          />
        </label>
        <label>
          Máximo
          <select
            value={limite}
            data-testid="audit-limite"
            onChange={(e) => setLimite(Number(e.target.value))}
          >
            {[50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </form>
      <table className="tabla" data-testid="audit-tabla">
        <thead>
          <tr>
            <th>Cuándo</th>
            <th>Quién</th>
            <th>Acción</th>
            <th>Entidad</th>
            <th>Cambios</th>
          </tr>
        </thead>
        <tbody>
          {filtrados.length === 0 && (
            <tr>
              <td colSpan={5} className="detalle">
                Sin eventos para ese filtro.
              </td>
            </tr>
          )}
          {filtrados.map((e) => (
            <tr key={e.id} data-testid={`audit-fila-${e.accion}`}>
              <td>{formatearFechaHora(e.at)}</td>
              <td>{e.actorRol}</td>
              <td>{e.accion}</td>
              <td>
                {e.entidad}
                {e.entidadId ? ` · ${e.entidadId}` : ''}
              </td>
              <td>
                {resumenCambios(e.before, e.after).join(' · ')}
                <details>
                  <summary>JSON</summary>
                  <pre>{JSON.stringify({ before: e.before, after: e.after }, null, 2)}</pre>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
