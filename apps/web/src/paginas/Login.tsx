import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { login as loginApi, verificarOtp, verificarTotp } from '../api/auth';
import { codigoDeError } from '../api/cliente';
import type { RespuestaLogin, Sesion } from '../api/tipos';
import { useSesion } from '../sesion/contexto';
import { rutaInicialPorRol, traducirError } from '../utils/formato';

type Paso =
  | { tipo: 'credenciales' }
  | { tipo: 'codigo_enviado' }
  | { tipo: 'totp'; challenge: string }
  | { tipo: 'totp_enrolar'; challenge: string; secret: string; otpauthUrl: string };

/**
 * Acceso en dos pasos (spec §3.3). Equipo interno: contraseña + código de la app de
 * autenticación, o código por correo si se deja la contraseña vacía. Asociados: enlace por correo.
 */
export function Login() {
  const { sesion, establecer } = useSesion();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [codigo, setCodigo] = useState('');
  const [paso, setPaso] = useState<Paso>({ tipo: 'credenciales' });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (sesion) return <Navigate to={rutaInicialPorRol(sesion.usuario.rol)} replace />;

  function entrar(nueva: Sesion) {
    establecer(nueva);
    navigate(rutaInicialPorRol(nueva.usuario.rol), { replace: true });
  }

  function aplicar(respuesta: RespuestaLogin) {
    switch (respuesta.paso) {
      case 'sesion':
        entrar(respuesta);
        return;
      case 'codigo_enviado':
        setPaso({ tipo: 'codigo_enviado' });
        return;
      case 'totp':
        setPaso({ tipo: 'totp', challenge: respuesta.challenge });
        return;
      case 'totp_enrolar':
        setPaso({
          tipo: 'totp_enrolar',
          challenge: respuesta.challenge,
          secret: respuesta.secret,
          otpauthUrl: respuesta.otpauthUrl,
        });
        return;
    }
  }

  async function ejecutar(accion: () => Promise<void>) {
    setError(null);
    setEnviando(true);
    try {
      await accion();
    } catch (e) {
      setError(traducirError(codigoDeError(e)));
    } finally {
      setEnviando(false);
    }
  }

  function enviarCredenciales(evento: FormEvent) {
    evento.preventDefault();
    void ejecutar(async () => aplicar(await loginApi(email, password)));
  }

  function enviarCodigo(evento: FormEvent) {
    evento.preventDefault();
    void ejecutar(async () => {
      if (paso.tipo === 'codigo_enviado') entrar(await verificarOtp(email, codigo));
      else if (paso.tipo === 'totp' || paso.tipo === 'totp_enrolar') {
        entrar(await verificarTotp(paso.challenge, codigo));
      }
    });
  }

  function volver() {
    setPaso({ tipo: 'credenciales' });
    setCodigo('');
    setError(null);
  }

  return (
    <div className="login">
      {paso.tipo === 'credenciales' ? (
        <form className="card" onSubmit={enviarCredenciales}>
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
              minLength={8}
            />
          </label>
          <p className="detalle">
            Asociados: deja la contraseña vacía y te enviamos un enlace de acceso. Equipo interno:
            también puedes dejarla vacía para recibir un código por correo.
          </p>
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
              Usuarios de desarrollo: ops@, viewer@, hseq@ y superadmin@asotracmet.test (contraseña
              + código); member.fst189@ y member.swi750@asotracmet.test (enlace). Sin SMTP, los
              códigos y enlaces salen en el log de la API.
            </p>
          )}
        </form>
      ) : (
        <form className="card" onSubmit={enviarCodigo}>
          <h1>ASOTRACMET</h1>
          {paso.tipo === 'codigo_enviado' && (
            <p className="detalle" data-testid="login-info">
              Si tu correo está registrado, te enviamos un mensaje. Asociados: abre el enlace de
              acceso. Equipo interno: escribe aquí el código de seis dígitos.
            </p>
          )}
          {paso.tipo === 'totp' && (
            <p className="detalle" data-testid="login-info">
              Escribe el código de tu aplicación de autenticación.
            </p>
          )}
          {paso.tipo === 'totp_enrolar' && (
            <div data-testid="login-info">
              <p className="detalle">
                Configura tu segundo factor: añade esta clave en Google Authenticator, Authy o
                similar y escribe el código que genera.
              </p>
              <p>
                <code data-testid="login-totp-secret">{paso.secret}</code>
              </p>
              <p className="detalle">
                <a href={paso.otpauthUrl}>Abrir directamente en la app de autenticación</a>
              </p>
            </div>
          )}
          <label>
            Código
            <input
              data-testid="login-codigo"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              required
            />
          </label>
          {error && (
            <p role="alert" className="error" data-testid="login-error">
              {error}
            </p>
          )}
          <div className="acciones">
            <button type="submit" data-testid="login-verificar" disabled={enviando}>
              {enviando ? 'Verificando…' : 'Verificar'}
            </button>
            <button
              type="button"
              className="secundario"
              data-testid="login-volver"
              onClick={volver}
            >
              Volver
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
