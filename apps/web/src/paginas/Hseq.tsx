import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import {
  CLASES_VEHICULO,
  ESTADOS_VEHICULO,
  puede,
  type ClaseVehiculo,
  type EstadoVehiculo,
} from '@asotracmet/shared';
import { api, codigoDeError } from '../api/cliente';
import { descargarSoporte, subirSoporte } from '../api/soportes';
import type {
  VistaUbicacion,
  AlertaDocumento,
  Cliente,
  SemaforoPlaca,
  TipoDocumento,
  VistaAsociado,
  VistaDocumento,
  VistaFicha,
} from '../api/tipos';
import { UltimaUbicacion } from '../componentes/UltimaUbicacion';
import { useSesion } from '../sesion/contexto';
import {
  textoEstadoDocumento,
  textoEstadoVehiculo,
  textoPosicion,
  tonoSemaforo,
  traducirError,
} from '../utils/formato';

/**
 * HSEQ (spec §9.2): ficha de placa con documentos y semáforo 30/7/vencido, habilitaciones por
 * cliente con motivo, conductores y estado. La cola reacciona sola a lo que se guarde aquí.
 */
// La ubicación cambia cada `gps_intervalo_minutos` (20 por defecto): no necesita el refresco
// corto del resto de la pantalla.
const REFRESCO_UBICACIONES_MS = 60_000;
export function Hseq() {
  const { sesion } = useSesion();
  const rol = sesion?.usuario.rol ?? 'viewer';
  const queryClient = useQueryClient();
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Nueva placa
  const [placa, setPlaca] = useState('');
  const [clase, setClase] = useState<ClaseVehiculo>('TM');
  const [asociadoId, setAsociadoId] = useState('');
  // Nuevo documento
  const [tipoId, setTipoId] = useState('');
  const [numero, setNumero] = useState('');
  const [venceEn, setVenceEn] = useState('');
  // Estado de la placa
  const [estadoNuevo, setEstadoNuevo] = useState<EstadoVehiculo>('activo');
  const [motivoEstado, setMotivoEstado] = useState('');

  const puedeCrearPlaca = puede(rol, 'vehiculos', 'C');
  const puedeEditar = puede(rol, 'documentos', 'C');
  const puedeHabilitar = puede(rol, 'habilitaciones', 'U');

  const placas = useQuery({
    queryKey: ['hseq', 'semaforo'],
    queryFn: () => api<SemaforoPlaca[]>('/vehiculos/semaforo'),
  });
  const ubicaciones = useQuery({
    queryKey: ['hseq', 'ubicaciones'],
    queryFn: () => api<VistaUbicacion[]>('/vehiculos/ubicaciones'),
    refetchInterval: REFRESCO_UBICACIONES_MS,
  });
  const ficha = useQuery({
    queryKey: ['hseq', 'ficha', seleccionada],
    queryFn: () => api<VistaFicha>(`/vehiculos/${seleccionada}/ficha`),
    enabled: seleccionada !== null,
  });
  const tipos = useQuery({
    queryKey: ['tipos-documento'],
    queryFn: () => api<TipoDocumento[]>('/tipos-documento'),
  });
  const asociados = useQuery({
    queryKey: ['asociados'],
    queryFn: () => api<VistaAsociado[]>('/asociados'),
    enabled: puedeCrearPlaca,
  });
  const clientes = useQuery({ queryKey: ['clientes'], queryFn: () => api<Cliente[]>('/clientes') });
  const alertas = useQuery({
    queryKey: ['hseq', 'alertas'],
    queryFn: () => api<AlertaDocumento[]>('/documentos/alertas'),
  });

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ['hseq'] });
    void queryClient.invalidateQueries({ queryKey: ['cola'] });
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

  const crearPlaca = useMutation({
    mutationFn: () =>
      api<{ id: string; placa: string }>('/vehiculos', {
        method: 'POST',
        body: { placa, clase, asociadoId },
      }),
    onSuccess: (creado) => {
      exito(`Placa ${creado.placa} creada y añadida al final de su cola.`);
      setPlaca('');
      setSeleccionada(creado.id);
    },
    onError: fallo,
  });

  const crearDocumento = useMutation({
    mutationFn: () =>
      api<VistaDocumento>('/documentos', {
        method: 'POST',
        body: {
          sujetoTipo: 'vehiculo',
          sujetoId: seleccionada,
          tipoId,
          numero: numero || undefined,
          venceEn: venceEn || undefined,
        },
      }),
    onSuccess: (doc) => {
      exito(`Documento ${doc.tipo?.codigo ?? ''} guardado: ${textoEstadoDocumento(doc.estado)}.`);
      setNumero('');
      setVenceEn('');
    },
    onError: fallo,
  });

  const renovar = useMutation({
    mutationFn: ({ id, vence }: { id: string; vence: string }) =>
      api<VistaDocumento>(`/documentos/${id}`, { method: 'PATCH', body: { venceEn: vence } }),
    onSuccess: (doc) => exito(`Vencimiento actualizado: ${textoEstadoDocumento(doc.estado)}.`),
    onError: fallo,
  });

  // Soporte del documento (TASK-0043): sube directo al almacén y confirma; la ficha se refresca.
  const subir = useMutation({
    mutationFn: ({ id, archivo }: { id: string; archivo: File }) => subirSoporte(id, archivo),
    onSuccess: (doc) => exito(`Soporte de ${doc.tipo?.codigo ?? 'documento'} guardado.`),
    onError: fallo,
  });

  const habilitar = useMutation({
    mutationFn: ({
      clienteId,
      apto,
      motivo,
    }: {
      clienteId: string;
      apto: boolean;
      motivo: string;
    }) =>
      api(`/vehiculos/${seleccionada}/habilitaciones/${clienteId}`, {
        method: 'PUT',
        body: { apto, motivoBloqueo: apto ? undefined : motivo },
      }),
    onSuccess: () => exito('Habilitación guardada.'),
    onError: fallo,
  });

  const cambiarEstado = useMutation({
    mutationFn: () =>
      api(`/vehiculos/${seleccionada}`, {
        method: 'PATCH',
        body: { estado: estadoNuevo, motivo: motivoEstado },
      }),
    onSuccess: () => {
      exito(`Estado de la placa: ${textoEstadoVehiculo(estadoNuevo)}.`);
      setMotivoEstado('');
    },
    onError: fallo,
  });

  if (rol === 'member') return <Navigate to="/me" replace />;

  function enviarPlaca(evento: FormEvent) {
    evento.preventDefault();
    crearPlaca.mutate();
  }

  function enviarDocumento(evento: FormEvent) {
    evento.preventDefault();
    crearDocumento.mutate();
  }

  function enviarEstado(evento: FormEvent) {
    evento.preventDefault();
    cambiarEstado.mutate();
  }

  const tiposVehiculo = tipos.data?.filter((t) => t.aplicaA === 'vehiculo') ?? [];
  // Última ubicación por placa, para que la lista de la flota diga de un vistazo quién reporta.
  const ubicacionPorVehiculo = new Map((ubicaciones.data ?? []).map((u) => [u.vehiculoId, u]));
  const datos = ficha.data;

  return (
    <div className="hseq">
      {mensaje && (
        <p className="info" data-testid="hseq-mensaje">
          {mensaje}
        </p>
      )}
      {error && (
        <p role="alert" className="error" data-testid="hseq-error">
          {error}
        </p>
      )}
      <section className="columna">
        <h2>Placas</h2>
        <div className="card" data-testid="hseq-alertas">
          <h3>Alertas de vencimiento</h3>
          {alertas.data?.length === 0 && <p className="detalle">Sin documentos por vencer.</p>}
          <ul className="lista">
            {alertas.data?.map((a) => (
              <li key={a.id} className="item" data-testid={`hseq-alerta-${a.sujeto}`}>
                <span>
                  <strong>{a.sujeto}</strong> · {a.tipo?.nombre ?? 'Documento'}
                  {a.venceEn ? ` · vence ${a.venceEn}` : ''}
                </span>
                <span className={`badge ${tonoSemaforo(a.estado)}`}>
                  {a.estado === 'vencido'
                    ? `Vencido hace ${Math.abs(a.diasParaVencer ?? 0)} d`
                    : `Vence en ${a.diasParaVencer ?? 0} d`}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {puedeCrearPlaca && (
          <form className="card formulario" onSubmit={enviarPlaca}>
            <h3>Nueva placa</h3>
            <label>
              Placa
              <input
                data-testid="hseq-nueva-placa"
                value={placa}
                onChange={(e) => setPlaca(e.target.value)}
                placeholder="AAA123"
                required
              />
            </label>
            <label>
              Clase
              <select
                data-testid="hseq-nueva-clase"
                value={clase}
                onChange={(e) => setClase(e.target.value as ClaseVehiculo)}
              >
                {CLASES_VEHICULO.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Asociado
              <select
                data-testid="hseq-nueva-asociado"
                value={asociadoId}
                onChange={(e) => setAsociadoId(e.target.value)}
                required
              >
                <option value="">Elige…</option>
                {asociados.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre} · {a.documento ?? ''}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" data-testid="hseq-nueva-enviar" disabled={crearPlaca.isPending}>
              Crear placa
            </button>
          </form>
        )}
        <ul className="lista">
          {placas.data?.map((p) => (
            <li key={p.id} className="item">
              <button
                type="button"
                className="enlace"
                data-testid={`hseq-placa-${p.placa}`}
                onClick={() => setSeleccionada(p.id)}
              >
                {p.placa}
              </button>{' '}
              <span className="detalle">
                {p.clase} · {p.asociadoNombre ?? ''} · {textoEstadoVehiculo(p.estado)}
              </span>
              <UltimaUbicacion
                ubicacion={ubicacionPorVehiculo.get(p.id) ?? null}
                placa={p.placa}
                variante="chip"
              />{' '}
              <span
                className={`badge ${tonoSemaforo(p.semaforo)}`}
                data-testid={`hseq-semaforo-${p.placa}`}
              >
                {textoEstadoDocumento(p.semaforo)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="columna ancha">
        {!datos && <p className="detalle">Elige una placa para ver su ficha.</p>}
        {datos && (
          <>
            <div className="card">
              <h2 data-testid="ficha-titulo">
                {datos.vehiculo.placa} · {datos.vehiculo.clase}
                <span
                  className={`badge ${tonoSemaforo(datos.semaforo)}`}
                  data-testid="ficha-semaforo"
                >
                  {textoEstadoDocumento(datos.semaforo)}
                </span>
              </h2>
              <p className="detalle">
                {datos.asociado?.nombre ?? 'Sin asociado'} · {datos.asociado?.documento ?? ''} ·{' '}
                {textoEstadoVehiculo(datos.vehiculo.estado)}
              </p>
              <UltimaUbicacion ubicacion={datos.ubicacion} placa={datos.vehiculo.placa} />
              <p className="detalle" data-testid="ficha-cola">
                {datos.enCola
                  ? textoPosicion(datos.enCola.claseCola, datos.enCola.posicion, datos.enCola.total)
                  : 'Fuera de la cola'}
              </p>
              {puedeEditar && (
                <form className="acciones" onSubmit={enviarEstado}>
                  <select
                    data-testid="ficha-estado"
                    value={estadoNuevo}
                    onChange={(e) => setEstadoNuevo(e.target.value as EstadoVehiculo)}
                    aria-label="Nuevo estado"
                  >
                    {ESTADOS_VEHICULO.map((e) => (
                      <option key={e} value={e}>
                        {textoEstadoVehiculo(e)}
                      </option>
                    ))}
                  </select>
                  <input
                    data-testid="ficha-estado-motivo"
                    placeholder="Motivo del cambio"
                    value={motivoEstado}
                    onChange={(e) => setMotivoEstado(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="secundario"
                    data-testid="ficha-estado-enviar"
                    disabled={motivoEstado.trim().length < 3 || cambiarEstado.isPending}
                  >
                    Cambiar estado
                  </button>
                </form>
              )}
            </div>

            <div className="card">
              <h3>Documentos</h3>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Número</th>
                    <th>Vence</th>
                    <th>Estado</th>
                    <th>Soporte</th>
                    {puedeEditar && <th>Renovar</th>}
                  </tr>
                </thead>
                <tbody>
                  {datos.documentos.map((d) => (
                    <tr key={d.id} data-testid={`ficha-doc-${d.tipo?.codigo ?? d.id}`}>
                      <td>{d.tipo?.nombre ?? '—'}</td>
                      <td>{d.numero ?? '—'}</td>
                      <td>
                        {d.venceEn ?? 'No vence'}
                        {d.diasParaVencer !== null && (
                          <span className="detalle"> ({d.diasParaVencer} días)</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge ${tonoSemaforo(d.estado)}`}
                          data-testid={`ficha-doc-estado-${d.tipo?.codigo ?? d.id}`}
                        >
                          {textoEstadoDocumento(d.estado)}
                        </span>
                      </td>
                      <td>
                        {d.archivoUrl && (
                          <button
                            type="button"
                            className="secundario"
                            data-testid={`doc-descargar-${d.tipo?.codigo ?? d.id}`}
                            onClick={() =>
                              void descargarSoporte(
                                d.id,
                                `${d.tipo?.codigo ?? 'soporte'}-${datos.vehiculo.placa}`,
                              ).catch(fallo)
                            }
                          >
                            Descargar
                          </button>
                        )}
                        {puedeEditar && (
                          <input
                            type="file"
                            accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                            aria-label={`Soporte de ${d.tipo?.codigo ?? ''}`}
                            data-testid={`doc-archivo-${d.tipo?.codigo ?? d.id}`}
                            disabled={subir.isPending}
                            onChange={(e) => {
                              const archivo = e.target.files?.[0];
                              if (archivo) subir.mutate({ id: d.id, archivo });
                              e.target.value = '';
                            }}
                          />
                        )}
                      </td>
                      {puedeEditar && (
                        <td>
                          <input
                            type="date"
                            aria-label={`Nuevo vencimiento de ${d.tipo?.codigo ?? ''}`}
                            onChange={(e) => {
                              if (e.target.value)
                                renovar.mutate({ id: d.id, vence: e.target.value });
                            }}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {puedeEditar && (
                <form className="acciones" onSubmit={enviarDocumento}>
                  <select
                    data-testid="doc-tipo"
                    value={tipoId}
                    onChange={(e) => setTipoId(e.target.value)}
                    aria-label="Tipo de documento"
                    required
                  >
                    <option value="">Tipo…</option>
                    {tiposVehiculo.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.codigo} · {t.nombre}
                      </option>
                    ))}
                  </select>
                  <input
                    data-testid="doc-numero"
                    placeholder="Número"
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                  />
                  <input
                    data-testid="doc-vence"
                    type="date"
                    aria-label="Vence"
                    value={venceEn}
                    onChange={(e) => setVenceEn(e.target.value)}
                  />
                  <button
                    type="submit"
                    data-testid="doc-enviar"
                    disabled={!tipoId || crearDocumento.isPending}
                  >
                    Añadir documento
                  </button>
                </form>
              )}
            </div>

            <div className="card">
              <h3>Habilitaciones por cliente</h3>
              <ul className="lista">
                {clientes.data?.map((c) => {
                  const h = datos.habilitaciones.find((x) => x.clienteId === c.id);
                  const apto = h?.apto === true;
                  return (
                    <li key={c.id} className="item">
                      <label className="fila">
                        <input
                          type="checkbox"
                          data-testid={`hab-${c.codigo}`}
                          checked={apto}
                          disabled={!puedeHabilitar || habilitar.isPending}
                          onChange={(e) => {
                            if (e.target.checked) {
                              habilitar.mutate({ clienteId: c.id, apto: true, motivo: '' });
                              return;
                            }
                            const motivo = window.prompt(
                              `Motivo por el que ${datos.vehiculo.placa} no es apta para ${c.codigo}`,
                            );
                            if (motivo && motivo.trim().length >= 3) {
                              habilitar.mutate({
                                clienteId: c.id,
                                apto: false,
                                motivo: motivo.trim(),
                              });
                            }
                          }}
                        />{' '}
                        <strong>{c.codigo}</strong> <span className="detalle">{c.nombre}</span>
                        {h && !h.apto && (
                          <span className="badge gris" data-testid={`hab-motivo-${c.codigo}`}>
                            {h.motivoBloqueo}
                          </span>
                        )}
                        {!h && <span className="badge gris">sin registro</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="card">
              <h3>Conductores</h3>
              {datos.conductores.length === 0 && (
                <p className="detalle">Sin conductores asignados.</p>
              )}
              <ul className="lista">
                {datos.conductores.map((c) => (
                  <li key={c.id} className="item">
                    <strong>{c.nombres}</strong>{' '}
                    <span className="detalle">
                      {c.documento} · licencia {c.licenciaCategoria ?? '—'} vence{' '}
                      {c.licenciaVence ?? '—'}
                    </span>
                    {c.esPrincipal && <span className="badge verde">Principal</span>}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
