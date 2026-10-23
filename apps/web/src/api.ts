import type { Message, Person } from './types';

const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export type AuthUser = {
  id: string;
  email: string | null;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  timeZone: string;
  locale: 'pt-BR' | 'en-US' | 'es-ES';
  status: 'ONLINE' | 'BUSY' | 'DO_NOT_DISTURB' | 'AWAY' | 'OFFLINE';
  statusMessage: string | null;
};

export type AuthSession = { accessToken: string; expiresIn: number; user: AuthUser };

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string };
  };
  if (!response.ok) {
    throw new ApiRequestError(
      data.error?.message ?? 'Não foi possível concluir a solicitação.',
      response.status,
      data.error?.code,
    );
  }
  return data as T;
}

async function authRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}/api/auth${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseResponse<T>(response);
}

let refreshInFlight: Promise<AuthSession> | null = null;

export function refreshSession(): Promise<AuthSession> {
  if (!refreshInFlight) {
    const rotate = () => authRequest<AuthSession>('/refresh');
    const refreshRequest: Promise<AuthSession> = navigator.locks
      ? navigator.locks.request('rocket-refresh-token', rotate).then(async (result) => await result)
      : rotate();
    refreshInFlight = refreshRequest.finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}
export const login = (email: string, password: string) =>
  authRequest<AuthSession>('/login', { email, password });
export const register = (displayName: string, email: string, password: string) =>
  authRequest<AuthSession>('/register', { displayName, email, password });
export const logout = () => authRequest<void>('/logout');
export const logoutAll = (token: string) =>
  request<void>('/api/auth/logout-all', token, { method: 'POST' });
export const getProfile = (token: string) => request<AuthUser>('/api/auth/profile', token);
export const updateProfile = (
  token: string,
  updates: Partial<
    Pick<
      AuthUser,
      'displayName' | 'avatarUrl' | 'jobTitle' | 'timeZone' | 'locale' | 'status' | 'statusMessage'
    >
  >,
) =>
  request<AuthUser>('/api/auth/profile', token, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
export const requestPasswordReset = (email: string) =>
  authRequest<{ message: string }>('/forgot-password', { email });
export const resetPassword = (token: string, password: string) =>
  authRequest<void>('/reset-password', { token, password });

export const startDemoSession = () => authRequest<AuthSession>('/demo');

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  return parseResponse<T>(response);
}

export type RemoteConversation = {
  id: string;
  type: 'CHANNEL' | 'DIRECT' | 'GROUP';
  name: string;
  description?: string | null;
  memberCount: number;
  preview?: string;
  lastAt?: string;
  unread?: number;
  members: {
    id: string;
    displayName: string;
    username: string;
    avatarUrl?: string | null;
    status: AuthUser['status'];
  }[];
};

export type RemoteMessage = {
  id: string;
  conversationId?: string;
  text: string;
  createdAt: string;
  author: {
    id: string;
    displayName: string;
    username: string;
    avatarUrl?: string | null;
    status: AuthUser['status'];
  };
  reactions: { emoji: string; _count: { userId: number } }[];
};

export const getConversations = (token: string) =>
  request<RemoteConversation[]>('/api/conversations', token);
export const getMessages = (token: string, id: string) =>
  request<RemoteMessage[]>(`/api/conversations/${id}/messages`, token);
export const sendMessage = (token: string, id: string, text: string) =>
  request<RemoteMessage>(`/api/conversations/${id}/messages`, token, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });

const statusMap: Record<AuthUser['status'], Person['status']> = {
  ONLINE: 'online',
  BUSY: 'busy',
  DO_NOT_DISTURB: 'do-not-disturb',
  AWAY: 'away',
  OFFLINE: 'offline',
};

export function authUserToPerson(user: AuthUser): Person {
  return {
    id: user.id,
    name: user.displayName,
    initials: user.displayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase(),
    status: statusMap[user.status],
    role: user.jobTitle ?? undefined,
    avatarUrl: user.avatarUrl,
  };
}

export function mapRemotePerson(
  person: RemoteConversation['members'][number] | RemoteMessage['author'],
): Person {
  const name = person.displayName;
  return {
    id: person.id,
    name,
    initials: name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase(),
    status: statusMap[person.status],
    avatarUrl: person.avatarUrl,
  };
}

export function mapRemoteMessage(message: RemoteMessage, myId: string): Message {
  const author = mapRemotePerson(message.author);
  return {
    id: message.id,
    author,
    text: message.text,
    time: new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(
      new Date(message.createdAt),
    ),
    date: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(
      new Date(message.createdAt),
    ),
    mine: message.author.id === myId,
    reactions: message.reactions.map((reaction) => ({
      emoji: reaction.emoji,
      count: reaction._count.userId,
    })),
  };
}
