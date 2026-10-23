import { describe, expect, it } from 'vitest';
import type { Message } from '../../types';
import { messagesReducer, type MessageState } from './message-state';

function message(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    author: {
      id: 'person-1',
      name: 'Ana Souza',
      initials: 'AS',
      status: 'online',
    },
    text: id,
    time: '10:00',
    date: '23 de outubro de 2026',
    ...overrides,
  };
}

describe('reducer de mensagens', () => {
  it('reconcilia o envio otimista com a mensagem confirmada pelo socket', () => {
    const optimistic = message('local-1', { clientMessageId: 'client-1' });
    const created = message('server-1', { clientMessageId: 'client-1' });
    const initial: MessageState = { channel: [optimistic] };

    const result = messagesReducer(initial, {
      type: 'message-created',
      conversationId: 'channel',
      message: created,
    });

    expect(result.channel).toEqual([created]);
  });

  it('prepara mensagens antigas sem duplicar eventos recebidos enquanto a página carregava', () => {
    const existing = [message('message-3'), message('message-4')];
    const initial: MessageState = { conversation: existing };

    const result = messagesReducer(initial, {
      type: 'older-page-loaded',
      conversationId: 'conversation',
      messages: [message('message-1'), message('message-2'), message('message-3')],
    });

    expect(result.conversation.map(({ id }) => id)).toEqual([
      'message-1',
      'message-2',
      'message-3',
      'message-4',
    ]);
  });

  it('preserva mensagens ao vivo que chegaram durante o carregamento inicial', () => {
    const pending = message('local-1', { clientMessageId: 'client-1' });
    const initial: MessageState = { conversation: [pending] };

    const result = messagesReducer(initial, {
      type: 'page-loaded',
      conversationId: 'conversation',
      messages: [message('server-1', { clientMessageId: 'client-1' }), message('server-2')],
    });

    expect(result.conversation.map(({ id }) => id)).toEqual(['server-1', 'server-2']);
  });
});
