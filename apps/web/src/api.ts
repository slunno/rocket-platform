import type { Message, Person } from './types';

const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export async function startDemoSession(): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/demo`, { method: 'POST' });
  if (!response.ok) throw new Error('Demo session unavailable');
  const data = await response.json();
  return data.token as string;
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  return response.json() as Promise<T>;
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
  members: { id: string; name: string; username: string; avatarUrl?: string | null; status: 'ONLINE' | 'AWAY' | 'OFFLINE' }[];
};

export type RemoteMessage = {
  id: string;
  conversationId?: string;
  text: string;
  createdAt: string;
  author: { id: string; displayName: string; username: string; avatarUrl?: string | null; status: 'ONLINE' | 'AWAY' | 'OFFLINE' };
  reactions: { emoji: string; _count: { userId: number } }[];
};

export const getConversations = (token: string) => request<RemoteConversation[]>('/api/conversations', token);
export const getMessages = (token: string, id: string) => request<RemoteMessage[]>(`/api/conversations/${id}/messages`, token);
export const sendMessage = (token: string, id: string, text: string) => request<RemoteMessage>(`/api/conversations/${id}/messages`, token, { method: 'POST', body: JSON.stringify({ text }) });

export function mapRemotePerson(person: RemoteConversation['members'][number] | RemoteMessage['author']): Person {
  const name = 'displayName' in person ? person.displayName : person.name;
  return {
    id: person.id,
    name,
    initials: name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase(),
    color: ['#8f7de0', '#36a78d', '#e29b58', '#5597c2', '#d77d62'][person.id.length % 5],
    status: person.status.toLowerCase() as Person['status'],
  };
}

export function mapRemoteMessage(message: RemoteMessage, myId: string): Message {
  const author = mapRemotePerson(message.author);
  return {
    id: message.id,
    author,
    text: message.text,
    time: new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.createdAt)),
    date: 'Hoje, 22 de outubro',
    mine: message.author.id === myId,
    reactions: message.reactions.map((reaction) => ({ emoji: reaction.emoji, count: reaction._count.userId })),
  };
}
