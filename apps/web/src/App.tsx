import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeProvider } from './hooks/useTheme';
import { AppShell } from './layout/AppShell';
import { ChatPage } from './features/chat/ChatPage';
import { EmptyRoutePage } from './features/activity/EmptyRoutePage';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AuthPage } from './auth/AuthPage';
import { InviteAcceptPage } from './auth/InviteAcceptPage';

function LoadingSession() {
  return (
    <main className="auth-loading" role="status" aria-live="polite">
      <span className="brand-mark-small">r</span>
      <p>Verificando sua sessão…</p>
    </main>
  );
}

function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();
  if (state === 'loading') return <LoadingSession />;
  if (state === 'anonymous') {
    return (
      <Navigate to="/entrar" replace state={{ from: `${location.pathname}${location.search}` }} />
    );
  }
  return <Outlet />;
}

function GuestOnly() {
  const { state } = useAuth();
  const location = useLocation();
  if (state === 'loading') return <LoadingSession />;
  if (state === 'authenticated') {
    const requestedPath = (location.state as { from?: string } | null)?.from;
    return (
      <Navigate to={requestedPath?.startsWith('/') ? requestedPath : '/chat/produto'} replace />
    );
  }
  return <Outlet />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="entrar" element={<AuthPage mode="login" />} />
        <Route path="cadastro" element={<AuthPage mode="register" />} />
        <Route path="recuperar-senha" element={<AuthPage mode="forgot" />} />
        <Route path="redefinir-senha" element={<AuthPage mode="reset" />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="convites/aceitar" element={<InviteAcceptPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/chat/produto" replace />} />
          <Route path="chat/:id" element={<ChatPage />} />
          <Route path="equipes/:teamId/:channelId" element={<ChatPage />} />
          <Route
            path="atividade"
            element={
              <EmptyRoutePage
                title="Atividade"
                description="Menções, respostas e atualizações importantes da sua equipe aparecerão aqui."
              />
            }
          />
          <Route
            path="calendario"
            element={
              <EmptyRoutePage
                title="Calendário"
                description="Seus eventos e reuniões de trabalho serão mostrados nesta área."
              />
            }
          />
          <Route
            path="arquivos"
            element={
              <EmptyRoutePage
                title="Arquivos"
                description="Arquivos compartilhados nas conversas ficarão reunidos aqui."
              />
            }
          />
          <Route
            path="chamadas"
            element={
              <EmptyRoutePage
                title="Chamadas"
                description="Seu histórico de chamadas e reuniões será mostrado aqui."
              />
            }
          />
          <Route path="*" element={<Navigate to="/chat/produto" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/chat/produto" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  );
}
