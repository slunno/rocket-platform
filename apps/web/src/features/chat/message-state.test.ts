import { describe, expect, it } from 'vitest';
import type { Message } from '../../types';
import { mergeMessage, messagesReducer, type MessageState } from './message-state';

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

  it('substitui uma mensagem editada e mantém a exclusão como estado visível', () => {
    const original = message('message-1');
    const edited = message('message-1', { text: 'Atualizada.', edited: true });
    const initial: MessageState = { conversation: [original] };
    const afterEdit = messagesReducer(initial, {
      type: 'message-updated',
      conversationId: 'conversation',
      message: edited,
    });
    const afterDelete = messagesReducer(afterEdit, {
      type: 'message-deleted',
      conversationId: 'conversation',
      messageId: 'message-1',
    });

    expect(afterEdit.conversation[0]).toMatchObject({ text: 'Atualizada.', edited: true });
    expect(afterDelete.conversation[0]).toMatchObject({ text: 'Atualizada.', deleted: true });
  });

  it('marca um anexo como pronto quando chega a confirmação pelo socket', () => {
    const pending = message('message-1', {
      attachments: [
        {
          id: 'attachment-1',
          fileName: 'colecao.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 128,
          createdAt: '2026-10-23T10:00:00.000Z',
          uploadedAt: null,
        },
      ],
    });
    const ready = {
      ...pending.attachments![0]!,
      uploadedAt: '2026-10-23T10:01:00.000Z',
    };

    const result = messagesReducer(
      { conversation: [pending] },
      {
        type: 'attachment-ready',
        conversationId: 'conversation',
        messageId: pending.id,
        attachment: ready,
      },
    );

    expect(result.conversation[0]?.attachments).toEqual([ready]);
  });

  it('reconcilia uma resposta otimista com a confirmação do servidor sem duplicar', () => {
    const optimistic = message('local-reply', { clientMessageId: 'client-reply' });
    const confirmed = message('server-reply', { clientMessageId: 'client-reply' });

    expect(mergeMessage([optimistic], confirmed)).toEqual([confirmed]);
  });
});
