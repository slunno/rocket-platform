import { CircleHelp, Search, SunMoon } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { IconButton } from '../components/ui/IconButton';
import { me } from '../demoData';

const brandName = import.meta.env.VITE_BRAND_NAME?.trim() || 'Rocket';
const logoUrl = import.meta.env.VITE_BRAND_LOGO_URL?.trim();

export function TopBar() {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);
  const openSearch = () => {
    const needsChatRoute =
      !location.pathname.startsWith('/chat/') && !location.pathname.startsWith('/equipes/');
    if (needsChatRoute) {
      navigate('/chat/produto');
    }
    window.setTimeout(
      () => window.dispatchEvent(new Event('rocket:open-search')),
      needsChatRoute ? 50 : 0,
    );
  };

  return (
    <header className="top-bar">
      <div className="top-bar-brand">
        {logoUrl ? (
          <img src={logoUrl} alt={brandName} />
        ) : (
          <span className="brand-wordmark">{brandName}</span>
        )}
      </div>
      <button
        className="global-search"
        type="button"
        onClick={openSearch}
        aria-label="Buscar em tudo"
      >
        <Search size={17} aria-hidden="true" />
        <span>Buscar em tudo</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div className="top-bar-actions">
        <label className="theme-control">
          <SunMoon size={17} aria-hidden="true" />
          <span className="sr-only">Tema da interface</span>
          <select
            aria-label="Tema da interface"
            value={theme}
            onChange={(event) => setTheme(event.target.value as typeof theme)}
          >
            <option value="light">Claro</option>
            <option value="dark">Escuro</option>
            <option value="contrast">Alto contraste</option>
          </select>
        </label>
        <IconButton label="Ajuda" onClick={() => setHelpOpen(true)}>
          <CircleHelp size={18} aria-hidden="true" />
        </IconButton>
        <div className="top-bar-profile" role="group" aria-label={`Perfil de ${me.name}`}>
          <Avatar person={me} size="small" />
          <span>{me.name}</span>
          <Badge tone="success">Disponível</Badge>
        </div>
      </div>
      <Dialog open={helpOpen} title="Ajuda do Rocket" onClose={() => setHelpOpen(false)}>
        <p>Use Ctrl + K ou ⌘ + K para buscar conversas e pessoas em qualquer área.</p>
        <button className="button button-primary" type="button" onClick={() => setHelpOpen(false)}>
          Entendi
        </button>
      </Dialog>
    </header>
  );
}
