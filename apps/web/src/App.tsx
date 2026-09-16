import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Layout } from './componentes/Layout';
import { Admin } from './paginas/Admin';
import { Entrar } from './paginas/Entrar';
import { Finance } from './paginas/Finance';
import { Hseq } from './paginas/Hseq';
import { Login } from './paginas/Login';
import { Me } from './paginas/Me';
import { Ops } from './paginas/Ops';
import { Usuarios } from './paginas/Usuarios';
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

// Router por rol (spec §9.1): /ops sala de turnos, /me Mi turno, /hseq flota, /finance viajes y recaudo, /admin.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/entrar" element={<Entrar />} />
      <Route element={<RutaProtegida />}>
        <Route path="/ops" element={<Ops />} />
        <Route path="/me" element={<Me />} />
        <Route path="/hseq" element={<Hseq />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/usuarios" element={<Usuarios />} />
      </Route>
      <Route path="*" element={<Inicio />} />
    </Routes>
  );
}
