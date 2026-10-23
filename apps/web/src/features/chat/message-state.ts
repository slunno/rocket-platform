import type { Message } from '../../types';

export type MessageState = Record<string, Message[]>;

export type MessageAction =
  | { type: 'page-loaded'; conversationId: string; messages: Message[] }
  | { type: 'older-page-loaded'; conversationId: string; messages: Message[] }
  | { type: 'optimistic-added'; conversationId: string; message: Message }
  | { type: 'message-created'; conversationId: string; message: Message }
  | { type: 'send-failed'; conversationId: string; temporaryId: string };

function hasMessage(messages: Message[], candidate: Message) {
  return messages.some(
    (message) =>
      message.id === candidate.id ||
      Boolean(candidate.clientMessageId && message.clientMessageId === candidate.clientMessageId),
  );
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
    case 'send-failed':
      return {
        ...state,
        [action.conversationId]: current.filter((message) => message.id !== action.temporaryId),
      };
  }
}
