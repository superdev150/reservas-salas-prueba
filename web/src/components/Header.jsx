import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const ROLE_LABELS = { employee: 'Empleado', admin: 'Administrador' };

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="header">
      <span className="brand">Reservas de salas</span>
      <nav className="nav">
        <NavLink to="/agenda" data-testid="nav-agenda">Agenda</NavLink>
        <NavLink to="/mis-reservas" data-testid="nav-mis-reservas">Mis reservas</NavLink>
      </nav>
      <span className="user">
        {user.name} · <span className="role">{ROLE_LABELS[user.role] || user.role}</span>
      </span>
      <button type="button" className="btn btn-light" data-testid="logout" onClick={handleLogout}>
        Salir
      </button>
    </header>
  );
}
