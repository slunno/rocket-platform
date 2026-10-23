// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MessageContent } from './MessageContent';

afterEach(cleanup);

describe('MessageContent', () => {
  it('renderiza Markdown simples, menções, listas e links seguros', () => {
    render(
      <MessageContent
        text={
          '**Coleção** *nova* `SKU-42`\n- Revisar cores\n- falar com @ana.souza\nhttps://example.test/colecao'
        }
        mentionOptions={[{ username: 'ana.souza', displayName: 'Ana Souza', type: 'USER' }]}
      />,
    );

    expect(screen.getByText('Coleção').tagName).toBe('STRONG');
    expect(screen.getByText('nova').tagName).toBe('EM');
    expect(screen.getByText('SKU-42').tagName).toBe('CODE');
    expect(screen.getByText('@Ana Souza')).toHaveClass('message-mention');
    expect(screen.getByRole('list').querySelectorAll('li')).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /example\.test/ })[0]).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
  });

  it('exibe conteúdo como texto e ignora protocolos que não sejam HTTP(S)', () => {
    const { container } = render(
      <MessageContent text={'<img src=x onerror=alert(1)> javascript:alert(1)'} />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(
      screen.getByText('<img src=x onerror=alert(1)> javascript:alert(1)'),
    ).toBeInTheDocument();
    expect(container.querySelector('.message-link-preview')).toBeNull();
  });
});
