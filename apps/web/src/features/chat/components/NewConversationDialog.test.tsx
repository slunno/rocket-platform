// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewConversationDialog } from './NewConversationDialog';

afterEach(cleanup);

const people = [
  {
    id: 'user-me',
    email: 'eu@example.test',
    username: 'eu',
    displayName: 'Pessoa Atual',
    avatarUrl: null,
    role: 'OWNER' as const,
  },
  {
    id: 'user-maria',
    email: 'maria@example.test',
    username: 'maria',
    displayName: 'Maria Estilista',
    avatarUrl: null,
    role: 'MEMBER' as const,
  },
  {
    id: 'user-guest',
    email: 'guest@example.test',
    username: 'convidado',
    displayName: 'Pessoa Convidada',
    avatarUrl: null,
    role: 'GUEST' as const,
  },
];

describe('NewConversationDialog', () => {
  it('busca uma pessoa e inicia a conversa direta', async () => {
    const user = userEvent.setup();
    const onStartDirect = vi.fn().mockResolvedValue(undefined);

    render(
      <NewConversationDialog
        open
        people={people}
        selfId="user-me"
        onClose={vi.fn()}
        onStartDirect={onStartDirect}
        onCreateGroup={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: 'Buscar pessoas' }), 'Maria');
    expect(screen.getByText('Maria Estilista')).toBeInTheDocument();
    expect(screen.queryByText('Pessoa Convidada')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Maria Estilista/ }));

    expect(onStartDirect).toHaveBeenCalledWith('user-maria');
  });

  it('cria um grupo com nome e pessoas selecionadas', async () => {
    const user = userEvent.setup();
    const onCreateGroup = vi.fn().mockResolvedValue(undefined);

    render(
      <NewConversationDialog
        open
        people={people}
        selfId="user-me"
        onClose={vi.fn()}
        onStartDirect={vi.fn().mockResolvedValue(undefined)}
        onCreateGroup={onCreateGroup}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Grupo' }));
    await user.type(screen.getByRole('textbox', { name: 'Nome do grupo' }), 'Produto e estilo');
    await user.click(screen.getByRole('checkbox', { name: /Maria Estilista/ }));
    await user.click(screen.getByRole('button', { name: 'Criar grupo' }));

    expect(onCreateGroup).toHaveBeenCalledWith('Produto e estilo', ['user-maria'], null);
  });
});
