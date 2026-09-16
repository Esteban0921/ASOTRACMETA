import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Layout } from './componentes/Layout';
import { Login } from './paginas/Login';
import { Me } from './paginas/Me';
import { Ops } from './paginas/Ops';
import { useSesion } from './sesion/contexto';
import { rutaInicialPorRol } from './utils/formato';

function RutaProtegida() {
  const { sesion } = useSesion();
  if (!sesion) return <Navigate to="/login" replace />;
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

function Inicio() {
  const { sesion } = useSesion();
  return <Navigate to={sesion ? rutaInicialPorRol(sesion.usuario.rol) : '/login'} replace />;
}

// Router por rol (spec §9.1): /ops sala de turnos, /me Mi turno. /hseq, /finance y /admin llegan en fases 2-3.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RutaProtegida />}>
        <Route path="/ops" element={<Ops />} />
        <Route path="/me" element={<Me />} />
      </Route>
      <Route path="*" element={<Inicio />} />
    </Routes>
  );
}
