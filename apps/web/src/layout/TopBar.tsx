import { CircleHelp, Search, SunMoon } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { IconButton } from '../components/ui/IconButton';
import { authUserToPerson, type AuthUser } from '../api';
import { useAuth } from '../auth/AuthContext';

const brandName = import.meta.env.VITE_BRAND_NAME?.trim() || 'Rocket';
const logoUrl = import.meta.env.VITE_BRAND_LOGO_URL?.trim();

export function TopBar() {
  const { theme, setTheme } = useTheme();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [timeZone, setTimeZone] = useState('America/Sao_Paulo');
  const [locale, setLocale] = useState<AuthUser['locale']>('pt-BR');
  const [status, setStatus] = useState<AuthUser['status']>('ONLINE');
  const [statusMessage, setStatusMessage] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState('');

  const user = auth.user;
  const person = user ? authUserToPerson(user) : null;
  useEffect(() => {
    if (!profileOpen || !user) return;
    setDisplayName(user.displayName);
    setAvatarUrl(user.avatarUrl ?? '');
    setJobTitle(user.jobTitle ?? '');
    setTimeZone(user.timeZone);
    setLocale(user.locale);
    setStatus(user.status);
    setStatusMessage(user.statusMessage ?? '');
    setProfileError('');
  }, [profileOpen, user]);

  useEffect(() => {
    const handleOpenProfile = () => setProfileOpen(true);
    window.addEventListener('rocket:open-profile', handleOpenProfile);
    return () => window.removeEventListener('rocket:open-profile', handleOpenProfile);
  }, []);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileBusy(true);
    setProfileError('');
    try {
      await auth.updateProfile({
        displayName,
        avatarUrl: avatarUrl.trim() || null,
        jobTitle: jobTitle.trim() || null,
        timeZone,
        locale,
        status,
        statusMessage: statusMessage.trim() || null,
      });
      setProfileOpen(false);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Não foi possível salvar o perfil.');
    } finally {
      setProfileBusy(false);
    }
  };

  const signOut = async (allDevices: boolean) => {
    setProfileBusy(true);
    try {
      if (allDevices) await auth.logoutAll();
      else await auth.logout();
      navigate('/entrar', { replace: true });
    } finally {
      setProfileBusy(false);
      setProfileOpen(false);
    }
  };
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
        {person && user && (
          <button
            className="top-bar-profile"
            type="button"
            aria-haspopup="dialog"
            aria-label={`Perfil de ${user.displayName}`}
            onClick={() => setProfileOpen(true)}
          >
            <Avatar person={person} size="small" />
            <span>{user.displayName}</span>
            <Badge tone={statusTone(user.status)}>{statusLabel(user.status)}</Badge>
          </button>
        )}
      </div>
      <Dialog open={helpOpen} title="Ajuda do Rocket" onClose={() => setHelpOpen(false)}>
        <p>Use Ctrl + K ou ⌘ + K para buscar conversas e pessoas em qualquer área.</p>
        <button className="button button-primary" type="button" onClick={() => setHelpOpen(false)}>
          Entendi
        </button>
      </Dialog>
      <Dialog open={profileOpen} title="Seu perfil" onClose={() => setProfileOpen(false)}>
        <form className="profile-form" onSubmit={(event) => void saveProfile(event)}>
          <label>
            Nome
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              maxLength={80}
            />
          </label>
          <label>
            Foto de perfil (URL)
            <input
              type="url"
              value={avatarUrl}
              onChange={(event) => setAvatarUrl(event.target.value)}
              placeholder="https://…"
            />
          </label>
          <label>
            Cargo
            <input
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
              maxLength={100}
            />
          </label>
          <label>
            Fuso horário
            <input
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
              required
              maxLength={100}
            />
          </label>
          <label>
            Idioma
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value as AuthUser['locale'])}
            >
              <option value="pt-BR">Português (Brasil)</option>
              <option value="en-US">English (United States)</option>
              <option value="es-ES">Español</option>
            </select>
          </label>
          <label>
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as AuthUser['status'])}
            >
              <option value="ONLINE">Disponível</option>
              <option value="BUSY">Ocupado</option>
              <option value="DO_NOT_DISTURB">Não incomodar</option>
              <option value="AWAY">Ausente</option>
              <option value="OFFLINE">Offline</option>
            </select>
          </label>
          <label>
            Mensagem de status
            <input
              value={statusMessage}
              onChange={(event) => setStatusMessage(event.target.value)}
              maxLength={140}
              placeholder="O que você está fazendo?"
            />
          </label>
          {profileError && (
            <p className="auth-feedback auth-error" role="alert">
              {profileError}
            </p>
          )}
          <div className="profile-actions">
            <button className="button button-primary" type="submit" disabled={profileBusy}>
              Salvar perfil
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={profileBusy}
              onClick={() => void signOut(false)}
            >
              Sair
            </button>
          </div>
          <button
            className="profile-logout-all"
            type="button"
            disabled={profileBusy}
            onClick={() => void signOut(true)}
          >
            Sair de todos os dispositivos
          </button>
        </form>
      </Dialog>
    </header>
  );
}

function statusLabel(status: AuthUser['status']) {
  if (status === 'ONLINE') return 'Disponível';
  if (status === 'BUSY') return 'Ocupado';
  if (status === 'DO_NOT_DISTURB') return 'Não incomodar';
  if (status === 'AWAY') return 'Ausente';
  return 'Offline';
}

function statusTone(status: AuthUser['status']): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'ONLINE') return 'success';
  if (status === 'BUSY') return 'warning';
  if (status === 'DO_NOT_DISTURB') return 'danger';
  return 'neutral';
}
