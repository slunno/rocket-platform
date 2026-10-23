// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../../App';
import { TopBar } from '../../layout/TopBar';
import { Avatar } from './Avatar';
import { Tabs } from './Tabs';
import { ThemeProvider } from '../../hooks/useTheme';
import { conversations, me } from '../../demoData';
import { MessageSearchDialog } from '../../features/chat/components/MessageSearchDialog';
import { AuthProvider } from '../../auth/AuthContext';
import type { AuthSession } from '../../api';

vi.mock('socket.io-client', () => ({
  io: () => ({
    auth: {},
    connected: false,
    disconnect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(),
  }),
}));

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    getConversations: vi.fn().mockResolvedValue([]),
    getMessages: vi.fn().mockResolvedValue([]),
    refreshSession: vi.fn().mockRejectedValue(new Error('No active session')),
  };
});

const initialSession: AuthSession = {
  accessToken: 'test-access-token',
  expiresIn: 900,
  user: {
    id: me.id,
    email: 'alex@example.test',
    username: 'alex.nogueira',
    displayName: me.name,
    avatarUrl: null,
    jobTitle: 'Produto',
    timeZone: 'America/Sao_Paulo',
    locale: 'pt-BR',
    status: 'ONLINE',
    statusMessage: null,
  },
};

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

describe('componentes de interface', () => {
  it('mantém tom monocromático estável para o mesmo identificador de pessoa', () => {
    const person = { id: 'ana', name: 'Ana Souza', initials: 'AS', status: 'online' as const };
    const { container, rerender } = render(<Avatar person={person} />);
    const firstClass = container.firstElementChild?.className;
    rerender(<Avatar person={person} />);
    expect(container.firstElementChild?.className).toMatch(/avatar-tone-[0-4]/);
    expect(container.firstElementChild?.className).toBe(firstClass);
  });

  it('permite trocar as abas com as setas do teclado', async () => {
    const user = userEvent.setup();
    render(
      <Tabs
        label="Seções do canal"
        items={[
          { id: 'posts', label: 'Publicações', content: <p>Conversas do canal</p> },
          { id: 'files', label: 'Arquivos', content: <p>Arquivos do canal</p> },
        ]}
      />,
    );

    const firstTab = screen.getByRole('tab', { name: 'Publicações' });
    firstTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Arquivos' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Arquivos' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Arquivos do canal');
  });

  it('persiste o tema selecionado e aplica o atributo ao documento', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthProvider initialSession={initialSession}>
          <ThemeProvider>
            <TopBar />
          </ThemeProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.selectOptions(screen.getByRole('combobox', { name: 'Tema da interface' }), 'dark');
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'dark'));
    expect(window.localStorage.getItem('rocket.theme')).toBe('dark');
  });

  it('aplica e persiste o tema de alto contraste', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthProvider initialSession={initialSession}>
          <ThemeProvider>
            <TopBar />
          </ThemeProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Tema da interface' }),
      'contrast',
    );
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'contrast'));
    expect(window.localStorage.getItem('rocket.theme')).toBe('contrast');
  });

  it('abre a área da rota escolhida com navegação nomeada', () => {
    render(
      <MemoryRouter initialEntries={['/calendario']}>
        <AuthProvider initialSession={initialSession}>
          <ThemeProvider>
            <AppRoutes />
          </ThemeProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Calendário' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Calendário' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('abre um canal diretamente pela rota de equipe e canal', () => {
    render(
      <MemoryRouter initialEntries={['/equipes/geral/produto']}>
        <AuthProvider initialSession={initialSession}>
          <ThemeProvider>
            <AppRoutes />
          </ThemeProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'produto' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Equipes' })).toHaveAttribute('aria-current', 'page');
  });

  it('redireciona rotas privadas para entrar quando não há sessão', async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/calendario']}>
          <ThemeProvider>
            <AppRoutes />
          </ThemeProvider>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Boas-vindas de volta' }),
    ).toBeInTheDocument();
  });

  it('navega pelos resultados da busca com o teclado e abre o canal selecionado', async () => {
    const user = userEvent.setup();
    const setQuery = vi.fn();
    const onOpenConversation = vi.fn();
    const onClose = vi.fn();

    render(
      <MessageSearchDialog
        open
        query="produto"
        setQuery={setQuery}
        conversations={conversations}
        getOtherPerson={(conversation) =>
          conversation.members.find((person) => person.id !== me.id) ?? me
        }
        onOpenConversation={onOpenConversation}
        onClose={onClose}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Buscar canais e pessoas' });
    await user.click(input);
    await user.keyboard('{ArrowDown}');
    const result = screen.getByRole('button', { name: 'produto' });
    expect(result).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onOpenConversation).toHaveBeenCalledWith(conversations[0]);
    expect(setQuery).toHaveBeenCalledWith('');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
