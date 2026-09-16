import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { codigoDeError } from '../api/cliente';
import { useSesion } from '../sesion/contexto';
import { rutaInicialPorRol, traducirError } from '../utils/formato';

export function Login() {
  const { sesion, iniciar } = useSesion();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (sesion) return <Navigate to={rutaInicialPorRol(sesion.usuario.rol)} replace />;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const nueva = await iniciar(email, password);
      navigate(rutaInicialPorRol(nueva.usuario.rol), { replace: true });
    } catch (e) {
      setError(traducirError(codigoDeError(e)));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={enviar}>
        <h1>ASOTRACMET</h1>
        <p className="detalle">Sistema de enturnamiento y operación gremial</p>
        <label>
          Correo
          <input
            data-testid="login-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Contraseña
          <input
            data-testid="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        {error && (
          <p role="alert" className="error" data-testid="login-error">
            {error}
          </p>
        )}
        <button type="submit" data-testid="login-submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
        {import.meta.env.DEV && (
          <p className="detalle ayuda">
            Usuarios de desarrollo: ops@, viewer@, member.fst189@, member.swi750@ y
            superadmin@asotracmet.test.
          </p>
        )}
      </form>
    </div>
  );
}
