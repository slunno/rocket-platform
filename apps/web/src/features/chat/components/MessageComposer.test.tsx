// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageComposer } from './MessageComposer';

afterEach(cleanup);

function ComposerHarness({
  isChannel = false,
  onSend = vi.fn(async () => undefined),
  onToast = vi.fn(),
}: {
  isChannel?: boolean;
  onSend?: (files: File[], onProgress: (file: File, percentage: number) => void) => Promise<void>;
  onToast?: (message: string) => void;
}) {
  const [text, setText] = useState('');
  return (
    <MessageComposer
      activeName="produto"
      isChannel={isChannel}
      text={text}
      setText={setText}
      onSend={onSend}
      onToast={onToast}
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

  it('anexa arquivos permitidos pelo seletor e os envia com a mensagem', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => undefined);
    render(<ComposerHarness onSend={onSend} />);
    const file = new File(['%PDF-1.7'], 'colecao.pdf', { type: 'application/pdf' });

    await user.upload(screen.getByLabelText('Selecionar arquivos para anexar'), file);
    expect(screen.getByText('colecao.pdf')).toBeVisible();
    const sendButton = screen.getByRole('button', { name: 'Enviar mensagem' });
    expect(sendButton).toBeEnabled();
    await user.click(sendButton);

    expect(onSend).toHaveBeenCalledWith([file], expect.any(Function));
  });

  it('não aceita arquivos SVG', async () => {
    const user = userEvent.setup();
    const onToast = vi.fn();
    render(<ComposerHarness onToast={onToast} />);
    const file = new File(['<svg/>'], 'icone.svg', { type: 'image/svg+xml' });

    await user.upload(screen.getByLabelText('Selecionar arquivos para anexar'), file);

    expect(screen.queryByText('icone.svg')).not.toBeInTheDocument();
    expect(onToast).not.toHaveBeenCalled();
  });
});
