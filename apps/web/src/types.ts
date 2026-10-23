export type ConversationKind = 'CHANNEL' | 'DIRECT' | 'GROUP';

export type Person = {
  id: string;
  name: string;
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

export type Message = {
  id: string;
  clientMessageId?: string;
  author: Person;
  text: string;
  time: string;
  date: string;
  mine?: boolean;
  edited?: boolean;
  deleted?: boolean;
  reactions?: Reaction[];
  replyCount?: number;
};

export type Conversation = {
  id: string;
  kind: ConversationKind;
  name: string;
  description?: string;
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
};
