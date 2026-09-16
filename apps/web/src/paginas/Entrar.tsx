import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { canjearEnlace } from '../api/auth';
import { codigoDeError } from '../api/cliente';
import { useSesion } from '../sesion/contexto';
import { rutaInicialPorRol, traducirError } from '../utils/formato';

/** Destino del enlace mágico (`/entrar?token=`): lo canjea una sola vez y entra a "Mi turno". */
export function Entrar() {
  const [parametros] = useSearchParams();
  const token = parametros.get('token');
  const { sesion, establecer } = useSesion();
  const navigate = useNavigate();
  const [errorCanje, setErrorCanje] = useState<string | null>(null);
  // El enlace es de un solo uso: el doble efecto de StrictMode no debe canjearlo dos veces.
  const canjeado = useRef<string | null>(null);

  useEffect(() => {
    if (!token || canjeado.current === token) return;
    canjeado.current = token;
    canjearEnlace(token)
      .then((nueva) => {
        establecer(nueva);
        navigate(rutaInicialPorRol(nueva.usuario.rol), { replace: true });
      })
      .catch((e: unknown) => setErrorCanje(traducirError(codigoDeError(e))));
  }, [token, establecer, navigate]);

  const error = token ? errorCanje : 'El enlace no trae token.';

  if (sesion && !error) return <Navigate to={rutaInicialPorRol(sesion.usuario.rol)} replace />;

  return (
    <div className="login">
      <div className="card">
        <h1>ASOTRACMET</h1>
        {error ? (
          <>
            <p role="alert" className="error" data-testid="entrar-error">
              {error}
            </p>
            <Link to="/login">Pedir un enlace nuevo</Link>
          </>
        ) : (
          <p className="detalle" data-testid="entrar-cargando">
            Entrando…
          </p>
        )}
      </div>
    </div>
  );
}
