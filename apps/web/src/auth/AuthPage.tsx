import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiRequestError, requestPasswordReset, resetPassword } from '../api';
import { useAuth } from './AuthContext';

type AuthPageMode = 'login' | 'register' | 'forgot' | 'reset';

const content: Record<AuthPageMode, { title: string; description: string }> = {
  login: { title: 'Boas-vindas de volta', description: 'Entre para continuar com sua equipe.' },
  register: {
    title: 'Crie sua conta',
    description: 'Comece a organizar a comunicação da sua equipe.',
  },
  forgot: {
    title: 'Recupere sua senha',
    description: 'Enviaremos um link seguro para o seu e-mail.',
  },
  reset: {
    title: 'Defina uma nova senha',
    description: 'Escolha uma senha forte com pelo menos 12 caracteres.',
  },
};
const demoAuthEnabled = import.meta.env.DEV && import.meta.env.VITE_DEMO_AUTH_ENABLED === 'true';

export function AuthPage({ mode }: { mode: AuthPageMode }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await auth.login(email, password);
        const requestedPath = (location.state as { from?: string } | null)?.from;
        navigate(requestedPath?.startsWith('/') ? requestedPath : '/chat/produto', {
          replace: true,
        });
      } else if (mode === 'register') {
        await auth.register(displayName, email, password);
        const requestedPath = (location.state as { from?: string } | null)?.from;
        navigate(requestedPath?.startsWith('/') ? requestedPath : '/chat/produto', {
          replace: true,
        });
      } else if (mode === 'forgot') {
        const result = await requestPasswordReset(email);
        setMessage(result.message);
      } else {
        const token = searchParams.get('token');
        if (!token) throw new Error('Este link não contém um token de redefinição válido.');
        await resetPassword(token, password);
        setMessage('Senha atualizada. Entre com sua nova senha.');
        window.setTimeout(() => navigate('/entrar', { replace: true }), 900);
      }
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 401) {
        setError('E-mail ou senha inválidos.');
      } else {
        setError(
          caught instanceof Error ? caught.message : 'Não foi possível concluir a solicitação.',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDemo = async () => {
    setError('');
    setBusy(true);
    try {
      await auth.demoLogin();
      navigate('/chat/produto', { replace: true });
    } catch {
      setError('A demonstração está indisponível. Verifique se o servidor está configurado.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <Link className="auth-brand" to="/entrar" aria-label="Rocket, entrar">
          <span className="brand-mark-small">r</span>
          <span>Rocket</span>
        </Link>
        <header className="auth-card-header">
          <h1 id="auth-title">{content[mode].title}</h1>
          <p>{content[mode].description}</p>
        </header>
        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          {mode === 'register' && (
            <label>
              Nome completo
              <input
                autoComplete="name"
                autoFocus
                maxLength={80}
                minLength={2}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                value={displayName}
              />
            </label>
          )}
          {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
            <label>
              E-mail
              <input
                autoComplete="email"
                autoFocus={mode !== 'register'}
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
          )}
          {(mode === 'login' || mode === 'register' || mode === 'reset') && (
            <label>
              {mode === 'login' ? 'Senha' : 'Nova senha'}
              <input
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                autoFocus={mode === 'reset'}
                minLength={mode === 'login' ? 1 : 12}
                maxLength={128}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
          )}
          {error && (
            <p className="auth-feedback auth-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="auth-feedback auth-success" role="status">
              {message}
            </p>
          )}
          <button className="button button-primary auth-submit" type="submit" disabled={busy}>
            {busy ? 'Aguarde…' : submitLabel(mode)}
          </button>
          {mode === 'login' && demoAuthEnabled && (
            <button
              className="button button-secondary auth-submit"
              type="button"
              disabled={busy}
              onClick={() => void handleDemo()}
            >
              Entrar na demonstração
            </button>
          )}
        </form>
        <nav className="auth-links" aria-label="Opções de autenticação">
          {mode === 'login' && (
            <>
              <Link to="/recuperar-senha">Esqueci minha senha</Link>
              <span>·</span>
              <Link to="/cadastro" state={location.state}>
                Criar conta
              </Link>
            </>
          )}
          {mode === 'register' && (
            <>
              <span>Já tem uma conta?</span>
              <Link to="/entrar" state={location.state}>
                Entrar
              </Link>
            </>
          )}
          {(mode === 'forgot' || mode === 'reset') && <Link to="/entrar">Voltar para entrar</Link>}
        </nav>
      </section>
    </main>
  );
}

function submitLabel(mode: AuthPageMode) {
  if (mode === 'login') return 'Entrar';
  if (mode === 'register') return 'Criar conta';
  if (mode === 'forgot') return 'Enviar instruções';
  return 'Atualizar senha';
}
