import { useState } from 'react';
import type { MotivoDeclinacion, VistaOferta } from '../api/tipos';
import { formatearFechaHora } from '../utils/formato';

interface Props {
  oferta: VistaOferta;
  motivos: MotivoDeclinacion[];
  ocupado: boolean;
  onAceptar: () => void;
  onDeclinar: (motivoId: string, nota: string) => void;
}

/** Card de oferta activa del asociado (spec §9.2 Member). Toda declinación pide motivo de catálogo (§9.3). */
export function OfertaCard({ oferta, motivos, ocupado, onAceptar, onDeclinar }: Props) {
  const [motivoId, setMotivoId] = useState('');
  const [nota, setNota] = useState('');
  const req = oferta.requerimiento;

  return (
    <article className="card oferta ambar" data-testid="oferta-card">
      <header>
        <span className="badge ambar">Oferta abierta</span>
        <h3>{oferta.placa}</h3>
      </header>
      <p className="detalle">
        {req?.cliente ?? '—'} · {req?.destino ?? 'Destino por confirmar'} ·{' '}
        {req?.claseCola ?? oferta.claseCola} · servicio {req?.fechaServicio ?? '—'}
      </p>
      <p className="detalle">Expira: {formatearFechaHora(oferta.expiraEn)}</p>
      <div className="acciones">
        <button type="button" data-testid="aceptar-oferta" onClick={onAceptar} disabled={ocupado}>
          Aceptar
        </button>
        <select
          data-testid="motivo-declinacion"
          value={motivoId}
          onChange={(e) => setMotivoId(e.target.value)}
          disabled={ocupado}
          aria-label="Motivo de declinación"
        >
          <option value="">Motivo de declinación…</option>
          {motivos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
        <input
          data-testid="nota-declinacion"
          placeholder="Nota (opcional)"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          disabled={ocupado}
        />
        <button
          type="button"
          className="peligro"
          data-testid="declinar-oferta"
          disabled={!motivoId || ocupado}
          onClick={() => onDeclinar(motivoId, nota)}
        >
          Declinar
        </button>
      </div>
    </article>
  );
}
