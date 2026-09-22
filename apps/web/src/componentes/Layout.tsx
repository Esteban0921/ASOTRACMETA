import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { esSoloPropio, puede, veEnmascarado } from '@asotracmet/shared';
import { api } from '../api/cliente';
import type { Notificacion } from '../api/tipos';
import { useSesion } from '../sesion/contexto';
import { EstadoConexion } from './EstadoConexion';

export function Layout({ children }: { children: ReactNode }) {
  const { sesion, cerrar } = useSesion();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const rol = sesion?.usuario.rol;

  const veSala = rol ? puede(rol, 'cola', 'R') && !esSoloPropio(rol, 'cola') : false;
  const veMiTurno = rol === 'member';
  const veHseq = rol ? puede(rol, 'vehiculos', 'R') && rol !== 'member' : false;
  const veFinance = rol ? puede(rol, 'viajes', 'R') && rol !== 'member' : false;
  const veTablero = rol ? puede(rol, 'trs', 'R') && rol !== 'member' : false;
  // El mapa solo para quien recibe coordenadas: al veedor la API se las manda en nulo (§20.11).
  const veMapa = rol ? puede(rol, 'vehiculos', 'R') && !veEnmascarado(rol, 'vehiculos') : false;
  // Bandeja de avisos (spec §11): el contador se refresca solo; la página marca leídas.
  const noLeidas = useQuery({
    queryKey: ['me', 'notificaciones', 'no-leidas'],
    queryFn: () => api<Notificacion[]>('/me/notificaciones?noLeidas=true&limite=50'),
    enabled: Boolean(sesion),
    refetchInterval: 15_000,
  });
  const sinLeer = noLeidas.data?.length ?? 0;

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
          <Link
            to="/notificaciones"
            className={pathname === '/notificaciones' ? 'activo' : ''}
            data-testid="nav-avisos"
          >
            Avisos{sinLeer > 0 ? ` (${sinLeer})` : ''}
          </Link>
          {veHseq && (
            <Link
              to="/hseq"
              className={pathname === '/hseq' ? 'activo' : ''}
              data-testid="nav-hseq"
            >
              HSEQ
            </Link>
          )}
          {veTablero && (
            <Link
              to="/tablero"
              className={pathname === '/tablero' ? 'activo' : ''}
              data-testid="nav-tablero"
            >
              Tablero
            </Link>
          )}
          {veMapa && (
            <Link
              to="/mapa"
              className={pathname === '/mapa' ? 'activo' : ''}
              data-testid="nav-mapa"
            >
              Mapa
            </Link>
          )}
          {veFinance && (
            <Link
              to="/finance"
              className={pathname === '/finance' ? 'activo' : ''}
              data-testid="nav-finance"
            >
              Finanzas
            </Link>
          )}
          {rol === 'superadmin' && (
            <Link
              to="/admin"
              className={pathname === '/admin' ? 'activo' : ''}
              data-testid="nav-admin"
            >
              Administración
            </Link>
          )}
          {rol === 'superadmin' && (
            <Link
              to="/admin/usuarios"
              className={pathname === '/admin/usuarios' ? 'activo' : ''}
              data-testid="nav-usuarios"
            >
              Usuarios
            </Link>
          )}
          {rol === 'superadmin' && (
            <Link
              to="/admin/parametros"
              className={pathname === '/admin/parametros' ? 'activo' : ''}
              data-testid="nav-parametros"
            >
              Parámetros
            </Link>
          )}
          {rol === 'superadmin' && (
            <Link
              to="/admin/auditoria"
              className={pathname === '/admin/auditoria' ? 'activo' : ''}
              data-testid="nav-auditoria"
            >
              Auditoría
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
      <EstadoConexion />
      <main className="contenido">{children}</main>
    </div>
  );
}
