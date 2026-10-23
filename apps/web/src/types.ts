export type ConversationKind = 'CHANNEL' | 'DIRECT' | 'GROUP';

export type Person = {
  id: string;
  name: string;
  username?: string;
  initials: string;
  status: 'online' | 'busy' | 'do-not-disturb' | 'away' | 'offline';
  role?: string;
  avatarUrl?: string | null;
  statusMessage?: string | null;
};

export type Reaction = {
  emoji: string;
  count: number;
  active?: boolean;
  users?: string[];
};

export type MessageAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedAt: string | null;
};

export type Message = {
  id: string;
  clientMessageId?: string;
  author: Person;
  text: string;
  createdAt?: string;
  time: string;
  date: string;
  mine?: boolean;
  edited?: boolean;
  deleted?: boolean;
  replyToId?: string;
  reactions?: Reaction[];
  replyCount?: number;
  attachments?: MessageAttachment[];
};

export type Conversation = {
  id: string;
  kind: ConversationKind;
  name: string;
  description?: string;
  avatarUrl?: string | null;
  members: Person[];
  unread?: number;
  lastMessage?: string;
  lastAt?: string;
  teamId?: string;
  teamName?: string;
  visibility?: 'PUBLIC' | 'PRIVATE';
  joined?: boolean;
  isFavorite?: boolean;
  isHidden?: boolean;
  memberCount?: number;
  workspaceId?: string | null;
  createdById?: string | null;
  muted?: boolean;
  pinned?: boolean;
  notificationLevel?: 'ALL' | 'MENTIONS' | 'MUTED';
};

export function conversationAvatarPerson(
  conversation: Pick<Conversation, 'id' | 'name' | 'avatarUrl'>,
): Person {
  return {
    id: conversation.id,
    name: conversation.name,
    initials: conversation.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toLocaleUpperCase('pt-BR'),
    status: 'offline',
    avatarUrl: conversation.avatarUrl,
  };
}
