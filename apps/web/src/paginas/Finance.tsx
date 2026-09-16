import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { ESTADOS_TR_VIGENTES, puede, type Rol } from '@asotracmet/shared';
import { api, codigoDeError, descargar } from '../api/cliente';
import type { DetalleViaje, ResumenMes, Transportadora, VistaTr, VistaViaje } from '../api/tipos';
import { useSesion } from '../sesion/contexto';
import {
  formatearPesos,
  mesActual,
  textoEstadoRecaudo,
  textoEstadoViaje,
  tonoEstado,
  tonoViaje,
  traducirError,
} from '../utils/formato';

const REFRESCO_MS = 8_000;

/**
 * Finance (spec §9.2): alta de viaje desde el TR, flete acordado vs tarifa sugerida, liquidación con
 * el porcentaje vigente (queda como snapshot) y estado de cobro. "El 3 % del mes sale del sistema".
 */
export function Finance() {
  const { sesion } = useSesion();
  const rol: Rol = sesion?.usuario.rol ?? 'viewer';
  const queryClient = useQueryClient();
  const [mes, setMes] = useState(mesActual());
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const puedeCrear = puede(rol, 'viajes', 'C');
  const puedeExportar = puede(rol, 'export', 'A');

  const viajesMes = useQuery({
    queryKey: ['viajes', mes],
    queryFn: () => api<VistaViaje[]>(`/viajes?mes=${mes}`),
    refetchInterval: REFRESCO_MS,
  });
  const todosViajes = useQuery({
    queryKey: ['viajes', 'todos'],
    queryFn: () => api<VistaViaje[]>('/viajes'),
    enabled: puedeCrear,
  });
  const trs = useQuery({
    queryKey: ['trs'],
    queryFn: () => api<VistaTr[]>('/trs'),
    enabled: puedeCrear,
    refetchInterval: REFRESCO_MS,
  });
  const resumen = useQuery({
    queryKey: ['viajes', 'resumen', mes],
    queryFn: () => api<ResumenMes>(`/viajes/resumen?mes=${mes}`),
    refetchInterval: REFRESCO_MS,
  });
  const transportadoras = useQuery({
    queryKey: ['transportadoras'],
    queryFn: () => api<Transportadora[]>('/transportadoras'),
  });
  const detalle = useQuery({
    queryKey: ['viajes', 'detalle', seleccionado],
    queryFn: () => api<DetalleViaje>(`/viajes/${seleccionado}`),
    enabled: seleccionado !== null,
  });

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ['viajes'] });
    void queryClient.invalidateQueries({ queryKey: ['trs'] });
  };
  const fallo = (e: unknown) => {
    setMensaje(null);
    setError(traducirError(codigoDeError(e)));
  };
  const exito = (texto: string) => {
    setError(null);
    setMensaje(texto);
    invalidar();
  };

  const crear = useMutation({
    mutationFn: (trId: string) => api<DetalleViaje>('/viajes', { method: 'POST', body: { trId } }),
    onSuccess: (v) => {
      exito(`Viaje creado para ${v.trCodigo}. Fija el flete y liquida.`);
      setSeleccionado(v.id);
    },
    onError: fallo,
  });

  if (rol === 'member') return <Navigate to="/me" replace />;

  const conViaje = new Set((todosViajes.data ?? []).map((v) => v.trId));
  const trsSinViaje = (trs.data ?? []).filter(
    (t) => ESTADOS_TR_VIGENTES.includes(t.estado) && !conViaje.has(t.id),
  );
  const r = resumen.data;

  return (
    <div className="sala finance">
      {mensaje && (
        <p className="info" data-testid="finance-mensaje">
          {mensaje}
        </p>
      )}
      {error && (
        <p role="alert" className="error" data-testid="finance-error">
          {error}
        </p>
      )}

      <section className="columna" aria-labelledby="titulo-viajes">
        <div className="pestanas">
          <h2 id="titulo-viajes">Viajes</h2>
          {puedeExportar && (
            <button
              type="button"
              className="secundario"
              data-testid="finance-exportar"
              onClick={() => {
                descargar(`/export/viajes.csv?mes=${mes}`, `viajes-${mes}.csv`).then(
                  () => exito(`CSV de ${mes} descargado (con marca de agua).`),
                  fallo,
                );
              }}
            >
              Exportar CSV
            </button>
          )}
          <label>
            Mes
            <input
              type="month"
              value={mes}
              data-testid="finance-mes"
              onChange={(e) => setMes(e.target.value || mesActual())}
            />
          </label>
        </div>
        {puedeCrear && (
          <div className="card">
            <h3>TR sin viaje</h3>
            {trsSinViaje.length === 0 && (
              <p className="detalle">Todos los TR vigentes tienen viaje.</p>
            )}
            {trsSinViaje.map((t) => (
              <div key={t.id} className="item" data-testid={`finance-tr-${t.codigo}`}>
                <span>
                  <strong>{t.codigo}</strong> · {t.etiqueta ?? t.placa} · {t.cliente}
                  {t.destino ? ` · ${t.destino}` : ''}
                </span>
                <button
                  type="button"
                  data-testid={`finance-crear-${t.codigo}`}
                  onClick={() => crear.mutate(t.id)}
                >
                  Crear viaje
                </button>
              </div>
            ))}
          </div>
        )}
        <table className="tabla">
          <thead>
            <tr>
              <th>TR</th>
              <th>Placa</th>
              <th>Cliente</th>
              <th>Flete</th>
              <th>Recaudo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {viajesMes.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="detalle">
                  Sin viajes en {mes}.
                </td>
              </tr>
            )}
            {viajesMes.data?.map((v) => (
              <tr
                key={v.id}
                data-testid={`finance-viaje-${v.trCodigo}`}
                className={v.id === seleccionado ? 'activo' : ''}
                onClick={() => setSeleccionado(v.id)}
              >
                <td>{v.trCodigo}</td>
                <td>{v.etiqueta}</td>
                <td>
                  {v.cliente ?? '—'}
                  {v.lugarDescargue ? ` · ${v.lugarDescargue}` : v.destino ? ` · ${v.destino}` : ''}
                </td>
                <td>{formatearPesos(v.flete)}</td>
                <td>{formatearPesos(v.valorRecaudo)}</td>
                <td>
                  <span className={`badge ${tonoViaje(v.estado)}`}>
                    {textoEstadoViaje(v.estado)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="columna" aria-labelledby="titulo-ficha">
        <h2 id="titulo-ficha">Ficha del viaje</h2>
        {!seleccionado && (
          <p className="detalle">Elige un viaje de la lista o crea uno desde un TR.</p>
        )}
        {detalle.data && (
          <FichaViaje
            key={`${detalle.data.id}:${detalle.data.estado}:${detalle.data.valorPagado}`}
            viaje={detalle.data}
            rol={rol}
            transportadoras={transportadoras.data ?? []}
            porcentaje={r?.porcentajeVigente ?? null}
            onExito={exito}
            onError={fallo}
          />
        )}
      </section>

      <section className="columna" aria-labelledby="titulo-resumen">
        <h2 id="titulo-resumen">Resumen {mes}</h2>
        {r && (
          <div className="card" data-testid="finance-resumen">
            <p>
              Viajes: <strong>{r.viajes}</strong> · liquidados <strong>{r.liquidados}</strong>
            </p>
            <p>
              Flete: <strong>{formatearPesos(r.flete)}</strong>
            </p>
            <p>
              Recaudo ({Math.round(r.porcentajeVigente * 10_000) / 100} % vigente):{' '}
              <strong data-testid="finance-resumen-recaudo">{formatearPesos(r.recaudo)}</strong>
            </p>
            <p>
              Pagado: <strong>{formatearPesos(r.pagado)}</strong> · pendiente{' '}
              <strong data-testid="finance-resumen-pendiente">{formatearPesos(r.pendiente)}</strong>
            </p>
            {r.porCliente.length > 0 && (
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Viajes</th>
                    <th>Recaudo</th>
                  </tr>
                </thead>
                <tbody>
                  {r.porCliente.map((c) => (
                    <tr key={c.cliente}>
                      <td>{c.cliente}</td>
                      <td>{c.viajes}</td>
                      <td>{formatearPesos(c.recaudo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {r.porPlaca.length > 0 && (
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Placa</th>
                    <th>Viajes</th>
                    <th>Recaudo</th>
                    <th>Pagado</th>
                  </tr>
                </thead>
                <tbody>
                  {r.porPlaca.map((p) => (
                    <tr key={p.placa}>
                      <td>
                        {p.placa}
                        {p.asociado ? ` · ${p.asociado}` : ''}
                      </td>
                      <td>{p.viajes}</td>
                      <td>{formatearPesos(p.recaudo)}</td>
                      <td>{formatearPesos(p.pagado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

interface PropsFicha {
  viaje: DetalleViaje;
  rol: Rol;
  transportadoras: Transportadora[];
  porcentaje: number | null;
  onExito: (texto: string) => void;
  onError: (e: unknown) => void;
}

/** Se monta con `key` por viaje y estado: el formulario arranca con los datos del servidor. */
function FichaViaje({ viaje, rol, transportadoras, porcentaje, onExito, onError }: PropsFicha) {
  const puedeEditar = puede(rol, 'viajes', 'U');
  const puedeLiquidar = puede(rol, 'recaudos', 'C');
  const puedePagar = puede(rol, 'recaudos', 'U');
  const puedeAnular = puede(rol, 'viajes', 'D');
  const liquidado = viaje.estado === 'liquidado';
  const anulado = viaje.estado === 'anulado';

  const [flete, setFlete] = useState(viaje.flete === null ? '' : String(viaje.flete));
  const [fechaCargue, setFechaCargue] = useState(viaje.fechaCargue ?? '');
  const [fechaDescargue, setFechaDescargue] = useState(viaje.fechaDescargue ?? '');
  const [lugar, setLugar] = useState(viaje.lugarDescargue ?? '');
  const [transportadoraId, setTransportadoraId] = useState(viaje.transportadoraId ?? '');
  const [pagoValor, setPagoValor] = useState('');
  const [pagoFecha, setPagoFecha] = useState('');
  const [pagoReferencia, setPagoReferencia] = useState('');
  const [motivoAnular, setMotivoAnular] = useState('');

  const guardar = useMutation({
    mutationFn: () =>
      api<DetalleViaje>(`/viajes/${viaje.id}`, {
        method: 'PATCH',
        body: {
          flete: flete === '' ? null : Number(flete),
          fechaCargue: fechaCargue || null,
          fechaDescargue: fechaDescargue || null,
          lugarDescargue: lugar || null,
          transportadoraId: transportadoraId || null,
        },
      }),
    onSuccess: (v) => onExito(`Viaje ${v.trCodigo} guardado: ${textoEstadoViaje(v.estado)}.`),
    onError,
  });

  const liquidar = useMutation({
    mutationFn: () =>
      api<DetalleViaje>(`/viajes/${viaje.id}/liquidar`, {
        method: 'POST',
        body: flete === '' ? {} : { flete: Number(flete) },
      }),
    onSuccess: (v) =>
      onExito(`Viaje ${v.trCodigo} liquidado: recaudo ${formatearPesos(v.valorRecaudo)}.`),
    onError,
  });

  const pagar = useMutation({
    mutationFn: () =>
      api(`/recaudos/${viaje.recaudo?.id}/pagos`, {
        method: 'POST',
        body: {
          valor: Number(pagoValor),
          fechaPago: pagoFecha,
          referencia: pagoReferencia || undefined,
        },
      }),
    onSuccess: () => onExito('Pago registrado.'),
    onError,
  });

  const anular = useMutation({
    mutationFn: () =>
      api<DetalleViaje>(`/viajes/${viaje.id}/anular`, {
        method: 'POST',
        body: { motivo: motivoAnular },
      }),
    onSuccess: (v) => onExito(`Viaje ${v.trCodigo} anulado.`),
    onError,
  });

  const fleteNumero = flete === '' ? null : Number(flete);
  const recaudoEstimado =
    fleteNumero !== null && porcentaje !== null ? Math.round(fleteNumero * porcentaje) : null;

  function enviarGuardar(e: FormEvent) {
    e.preventDefault();
    guardar.mutate();
  }
  function enviarPago(e: FormEvent) {
    e.preventDefault();
    pagar.mutate();
  }
  function enviarAnular(e: FormEvent) {
    e.preventDefault();
    anular.mutate();
  }

  return (
    <div className="card" data-testid="finance-ficha">
      <h3 data-testid="finance-ficha-titulo">
        {viaje.trCodigo} · {viaje.etiqueta}{' '}
        <span className={`badge ${tonoViaje(viaje.estado)}`} data-testid="finance-ficha-estado">
          {textoEstadoViaje(viaje.estado)}
        </span>
      </h3>
      <p className="detalle">
        {viaje.cliente ?? '—'}
        {viaje.destino ? ` · ${viaje.destino}` : ''} · TR{' '}
        <span className={`badge ${tonoEstado(viaje.trEstado)}`}>{viaje.trEstado}</span> · asignado{' '}
        {viaje.fechaAsignacion}
      </p>

      {viaje.tarifasSugeridas.length > 0 && (
        <p className="detalle" data-testid="finance-tarifas">
          Tarifa sugerida:{' '}
          {viaje.tarifasSugeridas.map((t) => (
            <button
              key={t.id}
              type="button"
              className="secundario"
              disabled={!puedeEditar || liquidado || anulado}
              onClick={() => setFlete(String(t.valor))}
            >
              {t.modalidad} {formatearPesos(t.valor)}
            </button>
          ))}
        </p>
      )}

      <form className="formulario" onSubmit={enviarGuardar}>
        <label>
          Flete acordado
          <input
            type="number"
            min={0}
            step={1}
            value={flete}
            data-testid="finance-flete"
            disabled={!puedeEditar || liquidado || anulado}
            onChange={(e) => setFlete(e.target.value)}
          />
        </label>
        <label>
          Cargue
          <input
            type="date"
            value={fechaCargue}
            data-testid="finance-cargue"
            disabled={!puedeEditar || anulado}
            onChange={(e) => setFechaCargue(e.target.value)}
          />
        </label>
        <label>
          Descargue
          <input
            type="date"
            value={fechaDescargue}
            data-testid="finance-descargue"
            disabled={!puedeEditar || anulado}
            onChange={(e) => setFechaDescargue(e.target.value)}
          />
        </label>
        <label>
          Lugar de descargue
          <input
            value={lugar}
            data-testid="finance-lugar"
            disabled={!puedeEditar || anulado}
            onChange={(e) => setLugar(e.target.value)}
          />
        </label>
        <label>
          Transportadora
          <select
            value={transportadoraId}
            data-testid="finance-transportadora"
            disabled={!puedeEditar || anulado}
            onChange={(e) => setTransportadoraId(e.target.value)}
          >
            <option value="">—</option>
            {transportadoras.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>
        {puedeEditar && !anulado && (
          <div className="acciones">
            <button type="submit" data-testid="finance-guardar" disabled={guardar.isPending}>
              Guardar
            </button>
            {puedeLiquidar && !liquidado && (
              <button
                type="button"
                data-testid="finance-liquidar"
                disabled={liquidar.isPending || fleteNumero === null || fleteNumero <= 0}
                onClick={() => liquidar.mutate()}
              >
                Liquidar
                {recaudoEstimado !== null ? ` (recaudo ${formatearPesos(recaudoEstimado)})` : ''}
              </button>
            )}
          </div>
        )}
      </form>

      {liquidado && (
        <p data-testid="finance-recaudo">
          Recaudo {Math.round((viaje.porcentajeAplicado ?? 0) * 10_000) / 100} %:{' '}
          <strong>{formatearPesos(viaje.valorRecaudo)}</strong> · pagado{' '}
          {formatearPesos(viaje.valorPagado)}
          {viaje.recaudo && (
            <>
              {' '}
              <span
                className={`badge ${tonoViaje(viaje.recaudo.estado)}`}
                data-testid="finance-estado-recaudo"
              >
                {textoEstadoRecaudo(viaje.recaudo.estado)}
              </span>
            </>
          )}
        </p>
      )}

      {puedePagar &&
        viaje.recaudo &&
        (viaje.recaudo.estado === 'pendiente' || viaje.recaudo.estado === 'parcial') && (
          <form className="formulario" onSubmit={enviarPago}>
            <h4>Registrar pago</h4>
            <label>
              Valor
              <input
                type="number"
                min={1}
                step={1}
                required
                value={pagoValor}
                data-testid="finance-pago-valor"
                onChange={(e) => setPagoValor(e.target.value)}
              />
            </label>
            <label>
              Fecha
              <input
                type="date"
                required
                value={pagoFecha}
                data-testid="finance-pago-fecha"
                onChange={(e) => setPagoFecha(e.target.value)}
              />
            </label>
            <label>
              Comprobante
              <input
                value={pagoReferencia}
                data-testid="finance-pago-referencia"
                onChange={(e) => setPagoReferencia(e.target.value)}
              />
            </label>
            <button type="submit" data-testid="finance-pago-enviar" disabled={pagar.isPending}>
              Registrar pago
            </button>
          </form>
        )}

      {puedeAnular && !anulado && viaje.valorPagado === 0 && (
        <form className="formulario" onSubmit={enviarAnular}>
          <label>
            Anular con motivo
            <input
              value={motivoAnular}
              minLength={3}
              required
              data-testid="finance-anular-motivo"
              onChange={(e) => setMotivoAnular(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="secundario"
            data-testid="finance-anular"
            disabled={anular.isPending}
          >
            Anular viaje
          </button>
        </form>
      )}
    </div>
  );
}
