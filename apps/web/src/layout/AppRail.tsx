import { Activity, CalendarDays, FolderOpen, MessageCircle, Phone, Users } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { Avatar } from '../components/ui/Avatar';
import { authUserToPerson } from '../api';
import { useAuth } from '../auth/AuthContext';

const navigation = [
  { label: 'Atividade', to: '/atividade', icon: Activity },
  { label: 'Chat', to: '/chat/produto', icon: MessageCircle },
  { label: 'Equipes', to: '/equipes/geral/produto', icon: Users },
  { label: 'Calendário', to: '/calendario', icon: CalendarDays },
  { label: 'Chamadas', to: '/chamadas', icon: Phone },
  { label: 'Arquivos', to: '/arquivos', icon: FolderOpen },
];

export function AppRail() {
  const location = useLocation();
  const { user } = useAuth();
  const person = user ? authUserToPerson(user) : null;
  return (
    <aside className="app-rail" aria-label="Aplicativos">
      <NavLink className="brand-mark" to="/chat/produto" aria-label="Rocket, página inicial">
        <span className="brand-orbit">r</span>
        <span className="brand-pulse" aria-hidden="true" />
      </NavLink>
      <span className="rail-separator" aria-hidden="true" />
      <nav className="rail-navigation" aria-label="Navegação principal">
        {navigation.map(({ label, to, icon: Icon }) => {
          const active =
            location.pathname === to ||
            (label === 'Chat' && location.pathname.startsWith('/chat/')) ||
            (label === 'Equipes' && location.pathname.startsWith('/equipes/'));
          return (
            <NavLink
              key={label}
              className={`rail-link ${active ? 'rail-link-active' : ''}`}
              to={to}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              title={label}
            >
              <Icon size={20} aria-hidden="true" />
              <span className="sr-only">{label}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="rail-spacer" />
      {person && user && (
        <button
          className="rail-profile"
          type="button"
          aria-label={`Perfil de ${user.displayName}`}
          title={user.displayName}
          onClick={() => window.dispatchEvent(new Event('rocket:open-profile'))}
        >
          <Avatar person={person} size="small" />
          <span
            className={`online-indicator status-indicator-${person.status}`}
            aria-label={user.status}
          />
        </button>
      )}
    </aside>
  );
}
