import type { Message, MessageAttachment } from '../../types';

export type MessageState = Record<string, Message[]>;

export type MessageAction =
  | { type: 'page-loaded'; conversationId: string; messages: Message[] }
  | { type: 'older-page-loaded'; conversationId: string; messages: Message[] }
  | { type: 'optimistic-added'; conversationId: string; message: Message }
  | { type: 'message-created'; conversationId: string; message: Message }
  | { type: 'message-updated'; conversationId: string; message: Message }
  | {
      type: 'attachment-ready';
      conversationId: string;
      messageId: string;
      attachment: MessageAttachment;
    }
  | { type: 'message-deleted'; conversationId: string; messageId: string }
  | { type: 'send-failed'; conversationId: string; temporaryId: string };

function hasMessage(messages: Message[], candidate: Message) {
  return messages.some(
    (message) =>
      message.id === candidate.id ||
      Boolean(candidate.clientMessageId && message.clientMessageId === candidate.clientMessageId),
  );
}

export function mergeMessage(messages: Message[], candidate: Message): Message[] {
  const existingIndex = messages.findIndex(
    (message) =>
      message.id === candidate.id ||
      Boolean(candidate.clientMessageId && message.clientMessageId === candidate.clientMessageId),
  );
  if (existingIndex < 0) return [...messages, candidate];
  return messages.map((message, index) => (index === existingIndex ? candidate : message));
}

export function messagesReducer(state: MessageState, action: MessageAction): MessageState {
  const current = state[action.conversationId] ?? [];

  switch (action.type) {
    case 'page-loaded': {
      const pending = current.filter((message) => !hasMessage(action.messages, message));
      return { ...state, [action.conversationId]: [...action.messages, ...pending] };
    }
    case 'older-page-loaded': {
      const older = action.messages.filter((message) => !hasMessage(current, message));
      return { ...state, [action.conversationId]: [...older, ...current] };
    }
    case 'optimistic-added':
      return { ...state, [action.conversationId]: [...current, action.message] };
    case 'message-created': {
      const optimisticIndex = current.findIndex(
        (message) =>
          action.message.clientMessageId &&
          message.clientMessageId === action.message.clientMessageId,
      );
      if (optimisticIndex >= 0) {
        const updated = [...current];
        updated[optimisticIndex] = action.message;
        return { ...state, [action.conversationId]: updated };
      }
      if (hasMessage(current, action.message)) return state;
      return { ...state, [action.conversationId]: [...current, action.message] };
    }
    case 'message-updated': {
      if (!current.some((message) => message.id === action.message.id)) return state;
      return {
        ...state,
        [action.conversationId]: current.map((message) =>
          message.id === action.message.id ? action.message : message,
        ),
      };
    }
    case 'attachment-ready':
      return {
        ...state,
        [action.conversationId]: current.map((message) =>
          message.id === action.messageId
            ? {
                ...message,
                attachments: [
                  ...(message.attachments ?? []).filter(({ id }) => id !== action.attachment.id),
                  action.attachment,
                ],
              }
            : message,
        ),
      };
    case 'message-deleted':
      return {
        ...state,
        [action.conversationId]: current.map((message) =>
          message.id === action.messageId ? { ...message, deleted: true } : message,
        ),
      };
    case 'send-failed':
      return {
        ...state,
        [action.conversationId]: current.filter((message) => message.id !== action.temporaryId),
      };
  }
}
