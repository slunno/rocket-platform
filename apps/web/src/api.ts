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

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';
export type ChannelVisibility = 'PUBLIC' | 'PRIVATE';
export type RemoteChannel = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: ChannelVisibility;
  joined: boolean;
  isFavorite: boolean;
  isHidden: boolean;
  memberCount: number;
};
export type RemoteTeam = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  joined: boolean;
  memberCount: number;
  channels: RemoteChannel[];
};
export type RemoteWorkspace = {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
};
export type RemoteWorkspaceDetail = RemoteWorkspace & { teams: RemoteTeam[] };
export type RemoteWorkspaceMember = {
  id: string;
  email: string | null;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role?: WorkspaceRole;
};
export type RemoteInvite = {
  id: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
  acceptedAt: string | null;
  team: { id: string; name: string } | null;
  invitedBy: { displayName: string };
};
export type CreatedInvite = {
  inviteUrl: string;
  email: string;
  role: 'MEMBER' | 'GUEST';
  expiresAt: string;
};

export const getWorkspaces = (token: string) =>
  request<RemoteWorkspace[]>('/api/workspaces', token);
export const createWorkspace = (token: string, name: string) =>
  request<RemoteWorkspace>('/api/workspaces', token, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
export const getWorkspace = (token: string, workspaceId: string) =>
  request<RemoteWorkspaceDetail>(`/api/workspaces/${encodeURIComponent(workspaceId)}`, token);
export const getWorkspaceMembers = (token: string, workspaceId: string) =>
  request<RemoteWorkspaceMember[]>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/members`,
    token,
  );
export const removeWorkspaceMember = (token: string, workspaceId: string, userId: string) =>
  request<void>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}`,
    token,
    { method: 'DELETE' },
  );
export const updateWorkspaceMemberRole = (
  token: string,
  workspaceId: string,
  userId: string,
  role: 'ADMIN' | 'MEMBER' | 'GUEST',
) =>
  request<RemoteWorkspaceMember>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}`,
    token,
    { method: 'PATCH', body: JSON.stringify({ role }) },
  );
export const createTeam = (
  token: string,
  workspaceId: string,
  input: { name: string; description?: string },
) =>
  request<RemoteTeam>(`/api/workspaces/${encodeURIComponent(workspaceId)}/teams`, token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
export const updateTeam = (
  token: string,
  teamId: string,
  input: { name?: string; description?: string | null },
) =>
  request<Pick<RemoteTeam, 'id' | 'name' | 'slug' | 'description'>>(
    `/api/teams/${encodeURIComponent(teamId)}`,
    token,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
export const archiveTeam = (token: string, teamId: string) =>
  request<void>(`/api/teams/${encodeURIComponent(teamId)}`, token, { method: 'DELETE' });
export const joinTeam = (token: string, teamId: string) =>
  request<void>(`/api/teams/${encodeURIComponent(teamId)}/join`, token, { method: 'POST' });
export const addTeamMember = (token: string, teamId: string, userId: string) =>
  request<void>(`/api/teams/${encodeURIComponent(teamId)}/members`, token, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
export const removeTeamMember = (token: string, teamId: string, userId: string) =>
  request<void>(
    `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
    token,
    { method: 'DELETE' },
  );
export const getTeamMembers = (token: string, teamId: string) =>
  request<RemoteWorkspaceMember[]>(`/api/teams/${encodeURIComponent(teamId)}/members`, token);
export const createChannel = (
  token: string,
  teamId: string,
  input: { name: string; description?: string; visibility: ChannelVisibility },
) =>
  request<Omit<RemoteChannel, 'isFavorite' | 'isHidden' | 'memberCount'>>(
    `/api/teams/${encodeURIComponent(teamId)}/channels`,
    token,
    { method: 'POST', body: JSON.stringify(input) },
  );
export const updateChannel = (
  token: string,
  channelId: string,
  input: { name?: string; description?: string | null; visibility?: ChannelVisibility },
) =>
  request<Pick<RemoteChannel, 'id' | 'name' | 'slug' | 'description' | 'visibility'>>(
    `/api/channels/${encodeURIComponent(channelId)}`,
    token,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
export const archiveChannel = (token: string, channelId: string) =>
  request<void>(`/api/channels/${encodeURIComponent(channelId)}`, token, { method: 'DELETE' });
export const addChannelMember = (token: string, channelId: string, userId: string) =>
  request<void>(`/api/channels/${encodeURIComponent(channelId)}/members`, token, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
export const removeChannelMember = (token: string, channelId: string, userId: string) =>
  request<void>(
    `/api/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(userId)}`,
    token,
    { method: 'DELETE' },
  );
export const getChannelMembers = (token: string, channelId: string) =>
  request<RemoteWorkspaceMember[]>(`/api/channels/${encodeURIComponent(channelId)}/members`, token);
export const updateChannelPreference = (
  token: string,
  channelId: string,
  input: { favorite?: boolean; hidden?: boolean },
) =>
  request<{ favorite: boolean; hidden: boolean }>(
    `/api/channels/${encodeURIComponent(channelId)}/preference`,
    token,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
export const createWorkspaceInvite = (
  token: string,
  workspaceId: string,
  input: { email: string; role: 'MEMBER' | 'GUEST'; teamId?: string },
) =>
  request<CreatedInvite>(`/api/workspaces/${encodeURIComponent(workspaceId)}/invites`, token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
export const getWorkspaceInvites = (token: string, workspaceId: string) =>
  request<RemoteInvite[]>(`/api/workspaces/${encodeURIComponent(workspaceId)}/invites`, token);
export const cancelWorkspaceInvite = (token: string, workspaceId: string, inviteId: string) =>
  request<void>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/invites/${encodeURIComponent(inviteId)}`,
    token,
    { method: 'DELETE' },
  );
export const acceptWorkspaceInvite = (token: string, invite: string) =>
  request<RemoteWorkspace & { teamId?: string | null }>('/api/invites/accept', token, {
    method: 'POST',
    body: JSON.stringify({ token: invite }),
  });

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
  type: 'DIRECT' | 'GROUP';
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
  channelId?: string;
  clientMessageId?: string | null;
  replyToId?: string | null;
  replyCount?: number;
  editedAt?: string | null;
  deletedAt?: string | null;
  text: string;
  createdAt: string;
  author: {
    id: string;
    displayName: string;
    username: string;
    avatarUrl?: string | null;
    status: AuthUser['status'];
  };
  reactions: {
    emoji: string;
    users: { id: string; displayName: string }[];
    _count: { userId: number };
  }[];
};

export type RemoteMessagePage = {
  items: RemoteMessage[];
  nextCursor: string | null;
};

export const getConversations = (token: string) =>
  request<RemoteConversation[]>('/api/conversations', token);
function messagePagePath(path: string, cursor?: string) {
  const query = new URLSearchParams({ limit: '50' });
  if (cursor) query.set('cursor', cursor);
  return `${path}?${query.toString()}`;
}

export const getMessages = (token: string, id: string, cursor?: string) =>
  request<RemoteMessagePage>(
    messagePagePath(`/api/conversations/${encodeURIComponent(id)}/messages`, cursor),
    token,
  );
export const getChannelMessages = (token: string, id: string, cursor?: string) =>
  request<RemoteMessagePage>(
    messagePagePath(`/api/channels/${encodeURIComponent(id)}/messages`, cursor),
    token,
  );
export const getOrganizationChannelMessages = getChannelMessages;
export const sendMessage = (token: string, id: string, text: string, clientMessageId: string) =>
  request<RemoteMessage>(`/api/conversations/${id}/messages`, token, {
    method: 'POST',
    body: JSON.stringify({ text, clientMessageId }),
  });
export const sendChannelMessage = (
  token: string,
  id: string,
  text: string,
  clientMessageId: string,
) =>
  request<RemoteMessage>(`/api/channels/${encodeURIComponent(id)}/messages`, token, {
    method: 'POST',
    body: JSON.stringify({ text, clientMessageId }),
  });

export const getMessageReplies = (token: string, messageId: string, cursor?: string) =>
  request<RemoteMessagePage>(
    messagePagePath(`/api/messages/${encodeURIComponent(messageId)}/replies`, cursor),
    token,
  );
export const sendMessageReply = (
  token: string,
  messageId: string,
  text: string,
  clientMessageId: string,
) =>
  request<RemoteMessage>(`/api/messages/${encodeURIComponent(messageId)}/replies`, token, {
    method: 'POST',
    body: JSON.stringify({ text, clientMessageId }),
  });

export const editMessage = (token: string, id: string, text: string) =>
  request<RemoteMessage>(`/api/messages/${encodeURIComponent(id)}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ text }),
  });
export const deleteMessage = (token: string, id: string) =>
  request<void>(`/api/messages/${encodeURIComponent(id)}`, token, { method: 'DELETE' });
export const addMessageReaction = (token: string, id: string, emoji: string) =>
  request<RemoteMessage>(`/api/messages/${encodeURIComponent(id)}/reactions`, token, {
    method: 'PUT',
    body: JSON.stringify({ emoji }),
  });
export const removeMessageReaction = (token: string, id: string, emoji: string) =>
  request<RemoteMessage>(
    `/api/messages/${encodeURIComponent(id)}/reactions/${encodeURIComponent(emoji)}`,
    token,
    { method: 'DELETE' },
  );

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
    username: person.username,
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
    clientMessageId: message.clientMessageId ?? undefined,
    replyToId: message.replyToId ?? undefined,
    replyCount: message.replyCount ?? 0,
    author,
    text: message.text,
    edited: Boolean(message.editedAt),
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
      active: reaction.users.some(({ id }) => id === myId),
      users: reaction.users.map(({ displayName }) => displayName),
    })),
  };
}
