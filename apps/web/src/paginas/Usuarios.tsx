import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { ROLES, type Rol } from '@asotracmet/shared';
import { api, codigoDeError } from '../api/cliente';
import type { UsuarioSesion, VistaVehiculo } from '../api/tipos';
import { useSesion } from '../sesion/contexto';
import { textoRol, traducirError } from '../utils/formato';

type Usuario = UsuarioSesion;

/** Usuarios y roles (spec §9.2 Superadmin, §8.2). Solo superadmin crea y modifica. */
export function Usuarios() {
  const { sesion } = useSesion();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<Rol>('member');
  const [password, setPassword] = useState('');
  const [placasNuevo, setPlacasNuevo] = useState<string[]>([]);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: () => api<Usuario[]>('/usuarios') });
  const vehiculos = useQuery({
    queryKey: ['vehiculos'],
    queryFn: () => api<VistaVehiculo[]>('/vehiculos'),
  });

  const invalidar = () => void queryClient.invalidateQueries({ queryKey: ['usuarios'] });
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
    mutationFn: () =>
      api<Usuario>('/usuarios', {
        method: 'POST',
        body: {
          email,
          nombre,
          rol,
          password: rol === 'member' || !password ? undefined : password,
          vehiculoIds: rol === 'member' ? placasNuevo : undefined,
        },
      }),
    onSuccess: (creado) => {
      exito(`Usuario ${creado.email} creado.`);
      setEmail('');
      setNombre('');
      setPassword('');
      setPlacasNuevo([]);
    },
    onError: fallo,
  });

  const cambiarRol = useMutation({
    mutationFn: ({ id, rol: nuevo }: { id: string; rol: Rol }) =>
      api<Usuario>(`/usuarios/${id}/roles`, { method: 'POST', body: { rol: nuevo } }),
    onSuccess: (u) => exito(`${u.email} ahora es ${textoRol(u.rol)}; sus sesiones se cerraron.`),
    onError: fallo,
  });

  const cambiarActivo = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      api<Usuario>(`/usuarios/${id}`, { method: 'PATCH', body: { activo } }),
    onSuccess: (u) => exito(`${u.email} ${u.activo ? 'activado' : 'desactivado'}.`),
    onError: fallo,
  });

  const asignarPlacas = useMutation({
    mutationFn: ({ id, vehiculoIds }: { id: string; vehiculoIds: string[] }) =>
      api<Usuario>(`/usuarios/${id}/vehiculos`, { method: 'POST', body: { vehiculoIds } }),
    onSuccess: (u) => exito(`Placas de ${u.email} actualizadas.`),
    onError: fallo,
  });

  if (sesion?.usuario.rol !== 'superadmin') return <Navigate to="/ops" replace />;

  const placaDe = (vehiculoId: string) =>
    vehiculos.data?.find((v) => v.id === vehiculoId)?.placa ?? vehiculoId;

  function seleccionadas(select: HTMLSelectElement): string[] {
    return Array.from(select.selectedOptions).map((o) => o.value);
  }

  function enviarNuevo(evento: FormEvent) {
    evento.preventDefault();
    crear.mutate();
  }

  return (
    <div className="admin">
      <h2>Usuarios y roles</h2>
      <p className="detalle">
        Un rol primario por usuario. Los asociados entran con enlace y ven solo sus placas; el
        equipo interno entra con contraseña y segundo factor o con código por correo.
      </p>
      {mensaje && (
        <p className="info" data-testid="usuarios-mensaje">
          {mensaje}
        </p>
      )}
      {error && (
        <p role="alert" className="error" data-testid="usuarios-error">
          {error}
        </p>
      )}

      <section className="card">
        <h3>Nuevo usuario</h3>
        <form className="formulario" onSubmit={enviarNuevo}>
          <label>
            Correo
            <input
              data-testid="usuario-nuevo-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Nombre
            <input
              data-testid="usuario-nuevo-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              minLength={2}
            />
          </label>
          <label>
            Rol
            <select
              data-testid="usuario-nuevo-rol"
              value={rol}
              onChange={(e) => setRol(e.target.value as Rol)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {textoRol(r)}
                </option>
              ))}
            </select>
          </label>
          {rol === 'member' ? (
            <label>
              Placas del asociado
              <select
                data-testid="usuario-nuevo-placas"
                multiple
                size={6}
                value={placasNuevo}
                onChange={(e) => setPlacasNuevo(seleccionadas(e.target))}
              >
                {vehiculos.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.placa} · {v.asociado?.nombre ?? ''}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Contraseña inicial (opcional: sin ella entra con código por correo)
              <input
                data-testid="usuario-nuevo-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
              />
            </label>
          )}
          <button type="submit" data-testid="usuario-nuevo-enviar" disabled={crear.isPending}>
            Crear usuario
          </button>
        </form>
      </section>

      <section className="card">
        <h3>Usuarios</h3>
        <table className="tabla" data-testid="usuarios-tabla">
          <thead>
            <tr>
              <th>Correo</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>2FA</th>
              <th>Placas</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.data?.map((u) => {
              const esYo = u.id === sesion.usuario.id;
              return (
                <tr key={u.id} data-testid={`usuario-fila-${u.email}`}>
                  <td>{u.email}</td>
                  <td>{u.nombre}</td>
                  <td>
                    <select
                      aria-label={`Rol de ${u.email}`}
                      value={u.rol}
                      disabled={esYo || cambiarRol.isPending}
                      onChange={(e) => {
                        const nuevo = e.target.value as Rol;
                        if (
                          window.confirm(
                            `Cambiar el rol de ${u.email} a ${textoRol(nuevo)} cierra sus sesiones. ¿Continuar?`,
                          )
                        ) {
                          cambiarRol.mutate({ id: u.id, rol: nuevo });
                        }
                      }}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {textoRol(r)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{u.rol === 'member' ? '—' : u.totpConfigurado ? 'Sí' : 'Pendiente'}</td>
                  <td>
                    {u.rol === 'member' ? (
                      <select
                        aria-label={`Placas de ${u.email}`}
                        multiple
                        size={3}
                        value={u.vehiculoIds}
                        disabled={asignarPlacas.isPending}
                        onChange={(e) =>
                          asignarPlacas.mutate({ id: u.id, vehiculoIds: seleccionadas(e.target) })
                        }
                      >
                        {vehiculos.data?.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.placa}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="detalle">
                        {u.vehiculoIds.map(placaDe).join(', ') || '—'}
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secundario"
                      disabled={esYo || cambiarActivo.isPending}
                      onClick={() => cambiarActivo.mutate({ id: u.id, activo: !u.activo })}
                    >
                      {u.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
