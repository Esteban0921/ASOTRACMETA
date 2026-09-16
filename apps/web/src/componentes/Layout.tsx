import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { esSoloPropio, puede } from '@asotracmet/shared';
import { useSesion } from '../sesion/contexto';

export function Layout({ children }: { children: ReactNode }) {
  const { sesion, cerrar } = useSesion();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const rol = sesion?.usuario.rol;

  const veSala = rol ? puede(rol, 'cola', 'R') && !esSoloPropio(rol, 'cola') : false;
  const veMiTurno = rol === 'member';

  return (
    <div className="app">
      <header className="cabecera">
        <div className="marca">
          <strong>ASOTRACMET</strong> <span>· Enturnamiento</span>
        </div>
        <nav className="nav">
          {veSala && (
            <Link to="/ops" className={pathname === '/ops' ? 'activo' : ''}>
              Sala de turnos
            </Link>
          )}
          {veMiTurno && (
            <Link to="/me" className={pathname === '/me' ? 'activo' : ''}>
              Mi turno
            </Link>
          )}
        </nav>
        <div className="usuario" data-testid="usuario-actual">
          <span>{sesion?.usuario.nombre}</span>
          <span className="rol">{rol}</span>
          <button
            type="button"
            className="secundario"
            data-testid="logout"
            onClick={() => {
              void cerrar().then(() => navigate('/login'));
            }}
          >
            Salir
          </button>
        </div>
      </header>
      <main className="contenido">{children}</main>
    </div>
  );
}
