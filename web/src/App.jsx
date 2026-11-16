import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import Login from './pages/Login.jsx';
import Agenda from './pages/Agenda.jsx';
import MisReservas from './pages/MisReservas.jsx';

// Rutas del spec §9. Todas salvo /login requieren sesión. /admin/salas llega en T5.
function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <p className="loading">Cargando…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <>
      <Header />
      <main className="content">
        <Outlet />
      </main>
    </>
  );
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="loading">Cargando…</p>;
  if (user) return <Navigate to="/agenda" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="app">
          <Routes>
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route element={<RequireAuth />}>
              <Route path="/" element={<Navigate to="/agenda" replace />} />
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/mis-reservas" element={<MisReservas />} />
              <Route path="*" element={<Navigate to="/agenda" replace />} />
            </Route>
          </Routes>
          <Footer />
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
