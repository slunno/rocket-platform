import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './hooks/useTheme';
import { AppShell } from './layout/AppShell';
import { ChatPage } from './features/chat/ChatPage';
import { EmptyRoutePage } from './features/activity/EmptyRoutePage';

export function AppRoutes() {
  return (
    <Routes>
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
              description="Seus eventos e reuniões de trabalho aparecerão nesta área."
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
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ThemeProvider>
  );
}
