import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AppRail } from './AppRail';
import { TopBar } from './TopBar';

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (!location.pathname.startsWith('/chat/') && !location.pathname.startsWith('/equipes/')) {
          navigate('/chat/produto');
        }
        window.setTimeout(() => window.dispatchEvent(new Event('rocket:open-search')), 50);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [location.pathname, navigate]);

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo
      </a>
      <AppRail />
      <div className="app-content">
        <TopBar />
        <main id="main-content" className="app-view" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
