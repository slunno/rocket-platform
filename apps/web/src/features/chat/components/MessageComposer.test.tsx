// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageComposer } from './MessageComposer';

afterEach(cleanup);

function ComposerHarness({ isChannel = false }: { isChannel?: boolean }) {
  const [text, setText] = useState('');
  return (
    <MessageComposer
      activeName="produto"
      isChannel={isChannel}
      text={text}
      setText={setText}
      onSend={vi.fn(async () => undefined)}
      onToast={vi.fn()}
      onTyping={vi.fn()}
      typingNames={[]}
      mentionOptions={[
        { username: 'ana.souza', displayName: 'Ana Souza', type: 'USER' },
        ...(isChannel
          ? [{ username: 'canal', displayName: 'Produto', type: 'CHANNEL' as const }]
          : []),
      ]}
    />
  );
}

describe('MessageComposer', () => {
  it('sugere e insere menções por teclado sem enviar a mensagem', async () => {
    const user = userEvent.setup();
    render(<ComposerHarness />);
    const textarea = screen.getByRole('textbox', { name: 'Escreva uma mensagem' });

    await user.type(textarea, 'Olá @ana');
    expect(screen.getByRole('option', { name: /Ana Souza/ })).toBeVisible();
    await user.keyboard('{Enter}');

    expect(textarea).toHaveValue('Olá @ana.souza ');
  });

  it('oferece a menção ao canal somente em canais', async () => {
    const user = userEvent.setup();
    render(<ComposerHarness isChannel />);
    const textarea = screen.getByRole('textbox', { name: 'Escreva uma mensagem' });

    await user.type(textarea, '@can');
    expect(screen.getByRole('option', { name: /Canal atual/ })).toBeVisible();
    await user.keyboard('{Enter}');

    expect(textarea).toHaveValue('@canal ');
  });
});
