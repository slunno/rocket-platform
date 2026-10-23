import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import { PRESENCE_HEARTBEAT_INTERVAL_MS, socketEvents } from '@rocket/shared';
import { Check } from 'lucide-react';
import { me as demoMe } from '../../demoData';
import {
  addChannelMember,
  addMessageReaction,
  addTeamMember,
  archiveChannel,
  archiveTeam,
  addConversationMember,
  authUserToPerson,
  createDirectConversation,
  createGroupConversation,
  createChannel,
  createTeam,
  createWorkspace,
  createWorkspaceInvite,
  deleteMessage,
  completeAttachmentUpload,
  editMessage,
  getChannelMembers,
  getChannelMessages,
  getConversations,
  getMessageReplies,
  getMessages,
  getTeamMembers,
  getWorkspace,
  getWorkspaceMembers,
  getWorkspaces,
  mapRemoteConversation,
  joinTeam,
  markChannelRead,
  markConversationRead,
  mapRemoteMessage,
  removeChannelMember,
  removeMessageReaction,
  removeWorkspaceMember,
  removeConversationMember,
  removeTeamMember,
  sendChannelMessage,
  uploadMessageAttachment,
  sendMessage,
  sendMessageReply,
  updateChannel,
  updateChannelPreference,
  updateConversation,
  updateConversationPreference,
  updateTeam,
  updateWorkspaceMemberRole,
  type CreatedInvite,
  type RemoteChannel,
  type RemoteTeam,
  type RemoteWorkspace,
  type RemoteWorkspaceDetail,
  type RemoteWorkspaceMember,
  type WorkspaceRole,
} from '../../api';
import type { Conversation, Message, Person } from '../../types';
import { mergeMessage, messagesReducer } from './message-state';
import { useAuth } from '../../auth/AuthContext';
import { ChatSidebar } from './components/ChatSidebar';
import { ConversationDetails } from './components/ConversationDetails';
import { ConversationHeader } from './components/ConversationHeader';
import { MessageComposer } from './components/MessageComposer';
import { MessageFeed } from './components/MessageFeed';
import { MessageSearchDialog } from './components/MessageSearchDialog';
import { ThreadPanel } from './components/ThreadPanel';
import { OrganizationDialog, type OrganizationDialogState } from './components/OrganizationDialog';
import { NewConversationDialog } from './components/NewConversationDialog';
import type { MessageMentionOption } from './components/MessageContent';
import { FilesBrowser } from '../files/FilesBrowser';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function normalizeAttachmentName(fileName: string) {
  const baseName = fileName.split(/[\\/]/).at(-1) ?? '';
  const normalized = baseName
    .normalize('NFC')
    // Strip control characters before they reach metadata and download headers.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return Array.from(normalized).slice(0, 180).join('') || 'arquivo';
}

function sortConversationList(conversations: Conversation[]) {
  return [...conversations].sort((left, right) => {
    const pinOrder = Number(Boolean(right.pinned)) - Number(Boolean(left.pinned));
    if (pinOrder) return pinOrder;
    return (Date.parse(right.lastAt ?? '') || 0) - (Date.parse(left.lastAt ?? '') || 0);
  });
}

export function ChatPage() {
  const { user, accessToken: token } = useAuth();
  const me = useMemo(() => (user ? authUserToPerson(user) : demoMe), [user]);
  const navigate = useNavigate();
  const location = useLocation();
  const route = useParams<{ id?: string; teamId?: string; channelId?: string }>();
  const routeId = route.id ?? route.channelId;
  const [workspaces, setWorkspaces] = useState<RemoteWorkspace[]>([]);
  const [workspaceListLoaded, setWorkspaceListLoaded] = useState(false);
  const [workspaceId, setWorkspaceId] = useState('');
  const [workspace, setWorkspace] = useState<RemoteWorkspaceDetail | null>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<RemoteWorkspaceMember[]>([]);
  const [teamMembers, setTeamMembers] = useState<RemoteWorkspaceMember[]>([]);
  const [channelMembers, setChannelMembers] = useState<RemoteWorkspaceMember[]>([]);
  const [channelMentionMembers, setChannelMentionMembers] = useState<RemoteWorkspaceMember[]>([]);
  const [organizationDialog, setOrganizationDialog] = useState<OrganizationDialogState | null>(
    null,
  );
  const [directConversations, setDirectConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState('');
  const [messageMap, dispatchMessage] = useReducer(messagesReducer, {});
  const [loadedConversationIds, setLoadedConversationIds] = useState<Set<string>>(new Set());
  const [messagePages, setMessagePages] = useState<
    Record<
      string,
      {
        nextCursor: string | null;
        loadingOlder: boolean;
        lastReadAt?: string | null;
        unreadCount?: number;
      }
    >
  >({});
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [online, setOnline] = useState(false);
  const [typingUsers, setTypingUsers] = useState<
    Record<string, { userId: string; displayName: string }[]>
  >({});
  const [threadRoot, setThreadRoot] = useState<Message | null>(null);
  const [threadReplies, setThreadReplies] = useState<Message[]>([]);
  const [threadPage, setThreadPage] = useState<{
    nextCursor: string | null;
    loading: boolean;
    loadingOlder: boolean;
  }>({ nextCursor: null, loading: false, loadingOlder: false });
  const [showDetails, setShowDetails] = useState(false);
  const [showChannelFiles, setShowChannelFiles] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem('rocket.sidebar-width'));
      return Number.isFinite(stored) && stored >= 240 && stored <= 420 ? stored : 320;
    } catch {
      return 320;
    }
  });
  const [toast, setToast] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const skipNextAutoScrollRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const typingTargetRef = useRef<{
    targetType: 'CHANNEL' | 'CONVERSATION';
    targetId: string;
  } | null>(null);
  const remoteTypingTimeoutsRef = useRef(new Map<string, number>());
  const threadRootIdRef = useRef<string | null>(null);
  const latestTokenRef = useRef(token);
  const myIdRef = useRef(me.id);
  const activeIdRef = useRef(activeId);
  const loadedConversationIdsRef = useRef(loadedConversationIds);
  const conversationsRef = useRef<Conversation[]>([]);
  const workspaceIdRef = useRef(workspaceId);
  const resizeOrigin = useRef<{ x: number; width: number } | null>(null);
  const messageSendAttempt = useRef<{ signature: string; clientMessageId: string }>({
    signature: '',
    clientMessageId: '',
  });
  latestTokenRef.current = token;
  myIdRef.current = me.id;
  activeIdRef.current = activeId;
  loadedConversationIdsRef.current = loadedConversationIds;
  workspaceIdRef.current = workspaceId;
  threadRootIdRef.current = threadRoot?.id ?? null;

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3000);
  }, []);

  const reloadConversations = useCallback(async () => {
    if (!token || !user) return [];
    const remote = await getConversations(token);
    const mapped = remote.map((conversation) => mapRemoteConversation(conversation, user.id));
    setDirectConversations(mapped);
    return mapped;
  }, [token, user]);

  useEffect(() => {
    if (!token) return;
    void getWorkspaces(token)
      .then((items) => {
        setWorkspaces(items);
        setWorkspaceListLoaded(true);
        setWorkspaceId((current) => {
          const requestedWorkspace = (location.state as { workspaceId?: string } | null)
            ?.workspaceId;
          if (
            requestedWorkspace &&
            items.some((workspaceItem) => workspaceItem.id === requestedWorkspace)
          )
            return requestedWorkspace;
          if (current && items.some((workspaceItem) => workspaceItem.id === current))
            return current;
          return items[0]?.id ?? '';
        });
      })
      .catch(() => {
        setWorkspaceListLoaded(true);
        showToast('Não foi possível carregar seus espaços de trabalho.');
      });
  }, [location.state, showToast, token]);

  useEffect(() => {
    if (!token || !workspaceId) {
      setWorkspace(null);
      setWorkspaceMembers([]);
      return;
    }
    let active = true;
    void getWorkspace(token, workspaceId)
      .then(async (detail) => {
        const members =
          detail.role === 'GUEST' ? [] : await getWorkspaceMembers(token, workspaceId);
        if (!active) return;
        setWorkspace(detail);
        setWorkspaceMembers(members);
      })
      .catch(() => {
        if (active) showToast('Não foi possível abrir o espaço de trabalho.');
      });
    return () => {
      active = false;
    };
  }, [showToast, token, workspaceId]);

  useEffect(() => {
    void reloadConversations().catch(() => undefined);
  }, [reloadConversations]);

  const teams = workspace?.teams ?? [];
  const channelConversations = useMemo(
    () =>
      teams.flatMap((team) =>
        team.channels
          .filter((channel) => channel.joined)
          .map((channel) => toChannelConversation(team, channel)),
      ),
    [teams],
  );
  const conversations = useMemo(
    () => [...channelConversations, ...directConversations],
    [channelConversations, directConversations],
  );
  conversationsRef.current = conversations;
  const active = conversations.find((conversation) => conversation.id === activeId);
  const activeConversationId = active?.id;
  const activeConversationKind = active?.kind;
  const activeMessages = messageMap[activeId] ?? [];
  const isChannel = active?.kind === 'CHANNEL';
  const mentionOptions = useMemo<MessageMentionOption[]>(() => {
    const people =
      isChannel && token
        ? channelMentionMembers
        : (active?.members ?? []).map((person) => ({
            id: person.id,
            username: person.username,
            displayName: person.name,
          }));
    const options: MessageMentionOption[] = people
      .filter((person) => person.id !== me.id && person.username)
      .map((person) => ({
        username: person.username!,
        displayName: person.displayName,
        type: 'USER' as const,
      }));
    if (isChannel && active) {
      options.unshift({ username: 'canal', displayName: active.name, type: 'CHANNEL' as const });
    }
    return options;
  }, [active, channelMentionMembers, isChannel, me.id, token]);
  const visibleDms = useMemo(
    () =>
      directConversations.filter((conversation) =>
        conversation.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [directConversations, query],
  );
  const workspaceRole: WorkspaceRole = workspace?.role ?? 'MEMBER';
  const workspaceName =
    workspace?.name ?? workspaces.find((item) => item.id === workspaceId)?.name ?? 'Rocket';

  const updateUnreadCount = useCallback(
    (conversationId: string, update: number | ((current: number) => number)) => {
      const nextCount = (current: number) =>
        Math.max(0, typeof update === 'function' ? update(current) : update);
      setDirectConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, unread: nextCount(conversation.unread ?? 0) }
            : conversation,
        ),
      );
      setWorkspace((current) =>
        current
          ? {
              ...current,
              teams: current.teams.map((team) => ({
                ...team,
                channels: team.channels.map((channel) =>
                  channel.id === conversationId
                    ? { ...channel, unread: nextCount(channel.unread ?? 0) }
                    : channel,
                ),
              })),
            }
          : current,
      );
      setMessagePages((current) => {
        const page = current[conversationId];
        return page
          ? {
              ...current,
              [conversationId]: { ...page, unreadCount: nextCount(page.unreadCount ?? 0) },
            }
          : current;
      });
    },
    [],
  );

  const resyncAfterReconnect = useCallback(async () => {
    const currentToken = latestTokenRef.current;
    if (!currentToken) return;

    const sidebarRefreshes = [
      getConversations(currentToken)
        .then((remote) =>
          setDirectConversations(
            remote.map((item) => mapRemoteConversation(item, myIdRef.current)),
          ),
        )
        .catch(() => undefined),
    ];
    const currentWorkspaceId = workspaceIdRef.current;
    if (currentWorkspaceId) {
      sidebarRefreshes.push(
        getWorkspace(currentToken, currentWorkspaceId)
          .then((detail) => {
            if (workspaceIdRef.current === currentWorkspaceId) setWorkspace(detail);
          })
          .catch(() => undefined),
      );
    }

    const loadedIds = [...loadedConversationIdsRef.current];
    const messageRefreshes = loadedIds.map(async (conversationId) => {
      const conversation = conversationsRef.current.find(({ id }) => id === conversationId);
      if (!conversation) return;
      try {
        const load = conversation.kind === 'CHANNEL' ? getChannelMessages : getMessages;
        const page = await load(currentToken, conversationId);
        dispatchMessage({
          type: 'page-loaded',
          conversationId,
          messages: page.items.map((message) => mapRemoteMessage(message, myIdRef.current)),
        });
        setMessagePages((current) => ({
          ...current,
          [conversationId]: {
            ...current[conversationId],
            nextCursor: page.nextCursor,
            loadingOlder: false,
            lastReadAt: page.lastReadAt ?? current[conversationId]?.lastReadAt ?? null,
            unreadCount: page.unreadCount ?? current[conversationId]?.unreadCount ?? 0,
          },
        }));
        if (activeIdRef.current === conversationId && document.visibilityState === 'visible') {
          const markRead = conversation.kind === 'CHANNEL' ? markChannelRead : markConversationRead;
          await markRead(currentToken, conversationId);
          updateUnreadCount(conversationId, 0);
        } else {
          updateUnreadCount(conversationId, page.unreadCount ?? 0);
        }
      } catch {
        // A conversa continua usando o estado em cache até a próxima sincronização.
      }
    });

    await Promise.all([...sidebarRefreshes, ...messageRefreshes]);
  }, [updateUnreadCount]);

  useEffect(() => {
    if (!active || active.kind !== 'CHANNEL' || !token) {
      setChannelMentionMembers([]);
      return;
    }
    let current = true;
    setChannelMentionMembers([]);
    void getChannelMembers(token, active.id)
      .then((members) => {
        if (current) setChannelMentionMembers(members);
      })
      .catch(() => {
        if (current) setChannelMentionMembers([]);
      });
    return () => {
      current = false;
    };
  }, [active?.id, active?.kind, token]);

  useEffect(() => {
    if (routeId && conversations.some((conversation) => conversation.id === routeId)) {
      setActiveId(routeId);
      return;
    }
    if (conversations.length && !conversations.some(({ id }) => id === activeId)) {
      setActiveId(conversations[0].id);
    }
  }, [activeId, conversations, routeId]);

  useEffect(() => {
    const handleOpenSearch = () => setShowSearch(true);
    window.addEventListener('rocket:open-search', handleOpenSearch);
    return () => window.removeEventListener('rocket:open-search', handleOpenSearch);
  }, []);

  useEffect(() => {
    if (showSearch) window.setTimeout(() => document.getElementById('global-search')?.focus(), 0);
  }, [showSearch]);

  useEffect(() => {
    if (!user) return;
    const socket = io(API_URL, {
      auth: { token: latestTokenRef.current },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;
    const sendPresenceHeartbeat = () => {
      if (socket.connected) socket.emit(socketEvents.presenceHeartbeat);
    };
    const presenceHeartbeatTimer = window.setInterval(
      sendPresenceHeartbeat,
      PRESENCE_HEARTBEAT_INTERVAL_MS,
    );
    socket.on('connect', () => {
      setOnline(true);
      sendPresenceHeartbeat();
      void resyncAfterReconnect();
    });
    socket.on('disconnect', () => {
      setOnline(false);
      setTypingUsers({});
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
      typingTargetRef.current = null;
      for (const timeout of remoteTypingTimeoutsRef.current.values()) window.clearTimeout(timeout);
      remoteTypingTimeoutsRef.current.clear();
    });
    const applyPresence = (event: { userId: string; online: boolean }) => {
      const statusFor = (status: Person['status']): Person['status'] => {
        if (!event.online) return 'offline';
        return status === 'busy' || status === 'do-not-disturb' || status === 'away'
          ? status
          : 'online';
      };
      setDirectConversations((current) =>
        current.map((conversation) => ({
          ...conversation,
          members: conversation.members.map((person) =>
            person.id === event.userId ? { ...person, status: statusFor(person.status) } : person,
          ),
        })),
      );
    };
    socket.on(socketEvents.presenceUpdated, applyPresence);
    socket.on(
      socketEvents.presenceSnapshot,
      (snapshot: { users: { userId: string; online: boolean }[]; updatedAt: string }) => {
        snapshot.users.forEach(applyPresence);
      },
    );
    socket.on('conversation:updated', (event: { conversationId: string }) => {
      const currentToken = latestTokenRef.current;
      if (!currentToken) return;
      void getConversations(currentToken)
        .then((remote) => {
          const mapped = remote.map((item) => mapRemoteConversation(item, myIdRef.current));
          setDirectConversations(mapped);
          const selected = conversationsRef.current.find(({ id }) => id === event.conversationId);
          if (
            selected &&
            selected.kind !== 'CHANNEL' &&
            activeIdRef.current === event.conversationId &&
            !mapped.some(({ id }) => id === event.conversationId)
          ) {
            setActiveId('');
            setShowDetails(false);
            navigate('/chat');
          }
        })
        .catch(() => undefined);
    });
    socket.on(
      'typing',
      (event: {
        targetType: 'CHANNEL' | 'CONVERSATION';
        targetId: string;
        userId: string;
        displayName: string;
        isTyping: boolean;
      }) => {
        const key = `${event.targetType}:${event.targetId}:${event.userId}`;
        const targetKey = `${event.targetType}:${event.targetId}`;
        const currentTimeout = remoteTypingTimeoutsRef.current.get(key);
        if (currentTimeout) window.clearTimeout(currentTimeout);
        setTypingUsers((current) => {
          const users = current[targetKey] ?? [];
          const nextUsers = event.isTyping
            ? users.some(({ userId }) => userId === event.userId)
              ? users
              : [...users, { userId: event.userId, displayName: event.displayName }]
            : users.filter(({ userId }) => userId !== event.userId);
          return { ...current, [targetKey]: nextUsers };
        });
        if (event.isTyping) {
          remoteTypingTimeoutsRef.current.set(
            key,
            window.setTimeout(() => {
              setTypingUsers((current) => ({
                ...current,
                [targetKey]: (current[targetKey] ?? []).filter(
                  ({ userId }) => userId !== event.userId,
                ),
              }));
              remoteTypingTimeoutsRef.current.delete(key);
            }, 3000),
          );
        } else {
          remoteTypingTimeoutsRef.current.delete(key);
        }
      },
    );
    socket.on('message:created', (message: Parameters<typeof mapRemoteMessage>[0]) => {
      const normalized = mapRemoteMessage(message, myIdRef.current);
      if (message.replyToId) {
        if (threadRootIdRef.current === message.replyToId) {
          setThreadReplies((current) => mergeMessage(current, normalized));
        }
        return;
      }
      const parentId = message.conversationId ?? message.channelId ?? '';
      if (!parentId) return;
      if (message.conversationId) {
        setDirectConversations((current) =>
          sortConversationList(
            current.map((conversation) =>
              conversation.id === parentId
                ? {
                    ...conversation,
                    lastMessage: normalized.text || (message.attachments?.length ? 'Anexo' : ''),
                    lastAt: normalized.createdAt ?? new Date().toISOString(),
                  }
                : conversation,
            ),
          ),
        );
      }
      if (message.author.id !== myIdRef.current) {
        const isActiveAndVisible =
          activeIdRef.current === parentId && document.visibilityState === 'visible';
        if (isActiveAndVisible) {
          const conversation = conversationsRef.current.find(({ id }) => id === parentId);
          if (conversation) {
            const markRead =
              conversation.kind === 'CHANNEL' ? markChannelRead : markConversationRead;
            const currentToken = latestTokenRef.current;
            if (currentToken) {
              void markRead(currentToken, parentId)
                .then(() => updateUnreadCount(parentId, 0))
                .catch(() => undefined);
            }
          }
        } else {
          updateUnreadCount(parentId, (current) => current + 1);
        }
      }
      dispatchMessage({
        type: 'message-created',
        conversationId: parentId,
        message: normalized,
      });
    });
    socket.on(
      'attachment:ready',
      (event: {
        messageId: string;
        conversationId: string | null;
        channelId: string | null;
        attachment: {
          id: string;
          fileName: string;
          mimeType: string;
          sizeBytes: number;
          createdAt: string;
          uploadedAt: string | null;
        };
      }) => {
        const parentId = event.conversationId ?? event.channelId;
        if (!parentId) return;
        dispatchMessage({
          type: 'attachment-ready',
          conversationId: parentId,
          messageId: event.messageId,
          attachment: event.attachment,
        });
      },
    );
    socket.on(
      'read:updated',
      (event: { targetType: 'CHANNEL' | 'CONVERSATION'; targetId: string; lastReadAt: string }) => {
        updateUnreadCount(event.targetId, 0);
      },
    );
    socket.on('message:updated', (message: Parameters<typeof mapRemoteMessage>[0]) => {
      const normalized = mapRemoteMessage(message, myIdRef.current);
      if (message.replyToId) {
        if (threadRootIdRef.current === message.replyToId) {
          setThreadReplies((current) => mergeMessage(current, normalized));
        }
        return;
      }
      if (threadRootIdRef.current === message.id) setThreadRoot(normalized);
      const parentId = message.conversationId ?? message.channelId ?? '';
      if (!parentId) return;
      dispatchMessage({
        type: 'message-updated',
        conversationId: parentId,
        message: normalized,
      });
    });
    socket.on(
      'message:deleted',
      (message: {
        id: string;
        conversationId?: string;
        channelId?: string;
        replyToId?: string | null;
      }) => {
        if (message.replyToId) {
          if (threadRootIdRef.current === message.replyToId) {
            setThreadReplies((current) =>
              current.map((reply) =>
                reply.id === message.id ? { ...reply, deleted: true } : reply,
              ),
            );
          }
          return;
        }
        setThreadRoot((current) =>
          current?.id === message.id ? { ...current, deleted: true } : current,
        );
        const parentId = message.conversationId ?? message.channelId ?? '';
        if (!parentId) return;
        dispatchMessage({
          type: 'message-deleted',
          conversationId: parentId,
          messageId: message.id,
        });
      },
    );
    const handleReactionChanged = (message: Parameters<typeof mapRemoteMessage>[0]) => {
      const normalized = mapRemoteMessage(message, myIdRef.current);
      if (message.replyToId) {
        if (threadRootIdRef.current === message.replyToId) {
          setThreadReplies((current) => mergeMessage(current, normalized));
        }
        return;
      }
      if (threadRootIdRef.current === message.id) setThreadRoot(normalized);
      const parentId = message.conversationId ?? message.channelId ?? '';
      if (!parentId) return;
      dispatchMessage({
        type: 'message-updated',
        conversationId: parentId,
        message: normalized,
      });
    };
    socket.on('reaction:added', handleReactionChanged);
    socket.on('reaction:removed', handleReactionChanged);
    return () => {
      window.clearInterval(presenceHeartbeatTimer);
      socket.disconnect();
      socketRef.current = null;
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
      typingTargetRef.current = null;
      for (const timeout of remoteTypingTimeoutsRef.current.values()) window.clearTimeout(timeout);
      remoteTypingTimeoutsRef.current.clear();
    };
  }, [resyncAfterReconnect, updateUnreadCount, user?.id]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !token) return;
    socket.auth = { token };
    if (socket.connected) {
      socket.emit('auth:reauth', token, (result: { ok: boolean }) => {
        if (!result.ok) socket.disconnect();
      });
    }
  }, [token]);

  useEffect(() => {
    if (!token || !activeConversationId || !activeConversationKind) return;
    if (loadedConversationIds.has(activeConversationId)) return;
    const conversationId = activeConversationId;
    const load = activeConversationKind === 'CHANNEL' ? getChannelMessages : getMessages;
    void load(token, conversationId)
      .then((page) => {
        const messages = page.items.map((message) => mapRemoteMessage(message, me.id));
        dispatchMessage({ type: 'page-loaded', conversationId, messages });
        setMessagePages((current) => ({
          ...current,
          [conversationId]: {
            ...current[conversationId],
            nextCursor: page.nextCursor,
            loadingOlder: false,
            lastReadAt: page.lastReadAt ?? null,
            unreadCount: page.unreadCount ?? 0,
          },
        }));
        updateUnreadCount(conversationId, page.unreadCount ?? 0);
        setLoadedConversationIds((current) => new Set(current).add(conversationId));
      })
      .catch(() => undefined);
  }, [
    activeConversationId,
    activeConversationKind,
    loadedConversationIds,
    me.id,
    token,
    updateUnreadCount,
  ]);

  useEffect(() => {
    if (
      !activeConversationId ||
      !activeConversationKind ||
      !token ||
      !loadedConversationIds.has(activeConversationId)
    )
      return;
    const conversationId = activeConversationId;
    const markRead = activeConversationKind === 'CHANNEL' ? markChannelRead : markConversationRead;
    const markVisibleConversationRead = () => {
      if (document.visibilityState !== 'visible') return;
      void markRead(token, conversationId)
        .then(() => updateUnreadCount(conversationId, 0))
        .catch(() => undefined);
    };
    markVisibleConversationRead();
    document.addEventListener('visibilitychange', markVisibleConversationRead);
    return () => document.removeEventListener('visibilitychange', markVisibleConversationRead);
  }, [
    activeConversationId,
    activeConversationKind,
    loadedConversationIds,
    token,
    updateUnreadCount,
  ]);

  useEffect(() => {
    if (!threadRoot || !token) {
      setThreadReplies([]);
      setThreadPage({ nextCursor: null, loading: false, loadingOlder: false });
      return;
    }
    let current = true;
    setThreadReplies([]);
    setThreadPage({ nextCursor: null, loading: true, loadingOlder: false });
    void getMessageReplies(token, threadRoot.id)
      .then((page) => {
        if (!current) return;
        const pageMessages = page.items.map((message) => mapRemoteMessage(message, me.id));
        setThreadReplies((replies) => replies.reduce(mergeMessage, pageMessages));
        setThreadPage({ nextCursor: page.nextCursor, loading: false, loadingOlder: false });
      })
      .catch(() => {
        if (current) {
          setThreadPage({ nextCursor: null, loading: false, loadingOlder: false });
          showToast('Não foi possível carregar as respostas do tópico.');
        }
      });
    return () => {
      current = false;
    };
  }, [me.id, showToast, threadRoot?.id, token]);

  useEffect(() => {
    setThreadRoot(null);
    setShowChannelFiles(false);
  }, [activeId]);

  useEffect(() => {
    if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false;
      return;
    }
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [activeId, activeMessages.length]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowSearch(false);
        setShowDetails(false);
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('rocket.sidebar-width', String(sidebarWidth));
    } catch {
      // A largura escolhida continua aplicada enquanto a página estiver aberta.
    }
  }, [sidebarWidth]);

  const openConversation = (conversation: Conversation) => {
    setActiveId(conversation.id);
    if (conversation.kind === 'CHANNEL') {
      navigate(
        `/equipes/${encodeURIComponent(conversation.teamId ?? '')}/${encodeURIComponent(conversation.id)}`,
      );
    } else {
      navigate(`/chat/${encodeURIComponent(conversation.id)}`);
    }
    setSidebarOpen(false);
  };

  const startDirectConversation = async (targetUserId: string) => {
    if (!token || !workspaceId) throw new Error('Selecione um espaço de trabalho.');
    const remote = await createDirectConversation(token, workspaceId, targetUserId);
    const conversation = mapRemoteConversation(remote, me.id);
    setDirectConversations((current) => {
      const existing = current.find((item) => item.id === conversation.id);
      return sortConversationList(
        existing
          ? current.map((item) =>
              item.id === conversation.id ? { ...existing, ...conversation } : item,
            )
          : [conversation, ...current],
      );
    });
    setShowNewConversation(false);
    openConversation(conversation);
  };

  const createGroup = async (name: string, userIds: string[], avatarUrl: string | null) => {
    if (!token || !workspaceId) throw new Error('Selecione um espaço de trabalho.');
    const remote = await createGroupConversation(token, workspaceId, { name, userIds, avatarUrl });
    const conversation = mapRemoteConversation(remote, me.id);
    setDirectConversations((current) =>
      sortConversationList([
        conversation,
        ...current.filter((item) => item.id !== conversation.id),
      ]),
    );
    setShowNewConversation(false);
    openConversation(conversation);
    showToast('Grupo criado.');
  };

  const toggleConversationPreference = async (
    conversation: Conversation,
    preference: 'muted' | 'pinned',
  ) => {
    if (!token) return;
    const value = !conversation[preference];
    try {
      const updated = await updateConversationPreference(token, conversation.id, {
        [preference]: value,
      });
      setDirectConversations((current) =>
        sortConversationList(
          current.map((item) => (item.id === conversation.id ? { ...item, ...updated } : item)),
        ),
      );
      showToast(
        value
          ? preference === 'muted'
            ? 'Conversa silenciada.'
            : 'Conversa fixada.'
          : preference === 'muted'
            ? 'Silêncio removido.'
            : 'Conversa desafixada.',
      );
    } catch {
      showToast('Não foi possível atualizar as preferências da conversa.');
    }
  };

  const updateGroupDetails = async (
    conversationId: string,
    name: string,
    description: string,
    avatarUrl: string | null,
  ) => {
    if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
    const updated = await updateConversation(token, conversationId, {
      name,
      description: description.trim() || null,
      avatarUrl,
    });
    setDirectConversations((current) =>
      current.map((item) =>
        item.id === conversationId
          ? {
              ...item,
              name: updated.name,
              description: updated.description ?? undefined,
              avatarUrl: updated.avatarUrl ?? undefined,
            }
          : item,
      ),
    );
    showToast('Dados do grupo atualizados.');
  };

  const addGroupMember = async (conversationId: string, userId: string) => {
    if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
    await addConversationMember(token, conversationId, userId);
    await reloadConversations();
    showToast('Pessoa adicionada ao grupo.');
  };

  const removeGroupMember = async (conversationId: string, userId: string) => {
    if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
    await removeConversationMember(token, conversationId, userId);
    if (userId === me.id) {
      setDirectConversations((current) => current.filter((item) => item.id !== conversationId));
      setActiveId('');
      navigate('/chat');
      setShowDetails(false);
      showToast('Você saiu do grupo.');
      return;
    }
    await reloadConversations();
    showToast('Pessoa removida do grupo.');
  };

  const refreshOrganization = async () => {
    if (!token || !workspaceId) return null;
    const detail = await getWorkspace(token, workspaceId);
    const members = detail.role === 'GUEST' ? [] : await getWorkspaceMembers(token, workspaceId);
    setWorkspace(detail);
    setWorkspaceMembers(members);
    return detail;
  };

  const loadOlderMessages = async () => {
    const conversationId = active?.id;
    const pageState = conversationId ? messagePages[conversationId] : undefined;
    if (!active || !token || !pageState?.nextCursor || pageState.loadingOlder) return;
    const cursor = pageState.nextCursor;
    const load = active.kind === 'CHANNEL' ? getChannelMessages : getMessages;
    setMessagePages((current) => ({
      ...current,
      [active.id]: { ...pageState, loadingOlder: true },
    }));
    try {
      const page = await load(token, active.id, cursor);
      const olderMessages = page.items.map((message) => mapRemoteMessage(message, me.id));
      if (olderMessages.length) skipNextAutoScrollRef.current = true;
      dispatchMessage({
        type: 'older-page-loaded',
        conversationId: active.id,
        messages: olderMessages,
      });
      setMessagePages((current) => ({
        ...current,
        [active.id]: {
          ...current[active.id],
          nextCursor: page.nextCursor,
          loadingOlder: false,
        },
      }));
    } catch {
      setMessagePages((current) => ({
        ...current,
        [active.id]: { ...current[active.id], loadingOlder: false },
      }));
      showToast('Não foi possível carregar as mensagens anteriores.');
    }
  };

  const loadOlderThreadReplies = async () => {
    if (!token || !threadRoot || !threadPage.nextCursor || threadPage.loadingOlder) return;
    const cursor = threadPage.nextCursor;
    setThreadPage((current) => ({ ...current, loadingOlder: true }));
    try {
      const page = await getMessageReplies(token, threadRoot.id, cursor);
      const olderReplies = page.items.map((message) => mapRemoteMessage(message, me.id));
      setThreadReplies((replies) => replies.reduce(mergeMessage, olderReplies));
      setThreadPage({ nextCursor: page.nextCursor, loading: false, loadingOlder: false });
    } catch {
      setThreadPage((current) => ({ ...current, loadingOlder: false }));
      showToast('Não foi possível carregar as respostas anteriores.');
    }
  };

  const handleSend = async (
    files: File[] = [],
    onProgress: (file: File, percentage: number) => void = () => undefined,
  ) => {
    const cleanText = text.trim();
    if ((!cleanText && files.length === 0) || !active) return;
    if (!token && files.length) {
      showToast('Entre na sua conta para enviar arquivos.');
      throw new Error('É necessário entrar na conta para anexar arquivos.');
    }
    handleTyping(false);
    const attachmentInputs = files.map((file) => ({
      fileName: normalizeAttachmentName(file.name),
      mimeType: file.type,
      sizeBytes: file.size,
    }));
    const signature = JSON.stringify({
      conversationId: active.id,
      text: cleanText,
      files: files.map((file) => [file.name, file.type, file.size, file.lastModified]),
    });
    if (messageSendAttempt.current.signature !== signature) {
      messageSendAttempt.current = { signature, clientMessageId: crypto.randomUUID() };
    }
    const clientMessageId = messageSendAttempt.current.clientMessageId;
    const temporaryId = `local-${clientMessageId}`;
    if (cleanText) {
      const now = new Date();
      const optimistic: Message = {
        id: temporaryId,
        clientMessageId,
        author: me,
        text: cleanText,
        createdAt: now.toISOString(),
        time: new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(now),
        date: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(now),
        mine: true,
      };
      dispatchMessage({ type: 'optimistic-added', conversationId: active.id, message: optimistic });
    }
    if (!token) {
      messageSendAttempt.current = { signature: '', clientMessageId: '' };
      return;
    }

    let createdOnServer = false;
    try {
      const created =
        active.kind === 'CHANNEL'
          ? await sendChannelMessage(token, active.id, cleanText, clientMessageId, attachmentInputs)
          : await sendMessage(token, active.id, cleanText, clientMessageId, attachmentInputs);
      createdOnServer = true;
      dispatchMessage({
        type: 'message-created',
        conversationId: active.id,
        message: mapRemoteMessage(created, me.id),
      });

      const uploads = new Map(
        (created.uploads ?? []).map((upload) => [upload.attachmentId, upload]),
      );
      const usedAttachmentIds = new Set<string>();
      const completedAttachments = new Map<
        string,
        Awaited<ReturnType<typeof completeAttachmentUpload>>
      >();
      for (const file of files) {
        const attachment = (created.attachments ?? []).find(
          (candidate) =>
            !usedAttachmentIds.has(candidate.id) &&
            candidate.fileName === normalizeAttachmentName(file.name) &&
            candidate.mimeType === file.type &&
            candidate.sizeBytes === file.size,
        );
        if (!attachment) throw new Error('O arquivo anexado não foi reconhecido pelo servidor.');
        usedAttachmentIds.add(attachment.id);
        if (attachment.uploadedAt) continue;
        const upload = uploads.get(attachment.id);
        if (!upload)
          throw new Error('O link temporário do arquivo expirou. Tente enviar novamente.');
        await uploadMessageAttachment(upload, file, (percentage) => onProgress(file, percentage));
        completedAttachments.set(
          attachment.id,
          await completeAttachmentUpload(token, attachment.id),
        );
      }
      if (completedAttachments.size) {
        dispatchMessage({
          type: 'message-updated',
          conversationId: active.id,
          message: mapRemoteMessage(
            {
              ...created,
              attachments: (created.attachments ?? []).map(
                (attachment) => completedAttachments.get(attachment.id) ?? attachment,
              ),
            },
            me.id,
          ),
        });
      }
      messageSendAttempt.current = { signature: '', clientMessageId: '' };
    } catch (error) {
      if (!createdOnServer && cleanText)
        dispatchMessage({
          type: 'send-failed',
          conversationId: active.id,
          temporaryId,
        });
      showToast(
        createdOnServer
          ? 'A mensagem foi criada, mas um arquivo não terminou de enviar. Tente novamente.'
          : 'Não foi possível enviar a mensagem. Confira sua conexão e tente novamente.',
      );
      throw error;
    }
  };

  const handleThreadSend = async (cleanText: string) => {
    if (!threadRoot) return;
    const clientMessageId = crypto.randomUUID();
    const temporaryId = `local-${clientMessageId}`;
    const now = new Date();
    const optimistic: Message = {
      id: temporaryId,
      clientMessageId,
      replyToId: threadRoot.id,
      author: me,
      text: cleanText,
      time: new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(now),
      date: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(now),
      mine: true,
    };
    setThreadReplies((current) => mergeMessage(current, optimistic));
    if (!token) {
      setThreadRoot((current) =>
        current ? { ...current, replyCount: (current.replyCount ?? 0) + 1 } : current,
      );
      return;
    }
    try {
      const created = await sendMessageReply(token, threadRoot.id, cleanText, clientMessageId);
      setThreadReplies((current) => mergeMessage(current, mapRemoteMessage(created, me.id)));
    } catch {
      setThreadReplies((current) => current.filter((reply) => reply.id !== temporaryId));
      showToast('Não foi possível enviar a resposta. Confira sua conexão e tente novamente.');
    }
  };

  const handleEditThreadMessage = async (messageId: string, nextText: string) => {
    const current = threadReplies.find((reply) => reply.id === messageId);
    if (!current) return false;
    if (!token) {
      setThreadReplies((replies) =>
        replies.map((reply) =>
          reply.id === messageId ? { ...reply, text: nextText.trim(), edited: true } : reply,
        ),
      );
      return true;
    }
    try {
      const updated = await editMessage(token, messageId, nextText);
      setThreadReplies((replies) => mergeMessage(replies, mapRemoteMessage(updated, me.id)));
      return true;
    } catch {
      showToast('Não foi possível editar a resposta.');
      return false;
    }
  };

  const handleDeleteThreadMessage = async (messageId: string) => {
    if (token) {
      try {
        await deleteMessage(token, messageId);
      } catch {
        showToast('Não foi possível excluir a resposta.');
        return;
      }
    } else {
      setThreadRoot((current) =>
        current ? { ...current, replyCount: Math.max(0, (current.replyCount ?? 0) - 1) } : current,
      );
    }
    setThreadReplies((replies) =>
      replies.map((reply) => (reply.id === messageId ? { ...reply, deleted: true } : reply)),
    );
  };

  const handleToggleThreadReaction = async (
    messageId: string,
    emoji: string,
    isActive: boolean,
  ) => {
    if (!token) {
      showToast('Entre na sua conta para reagir à resposta.');
      return;
    }
    try {
      const updated = isActive
        ? await removeMessageReaction(token, messageId, emoji)
        : await addMessageReaction(token, messageId, emoji);
      setThreadReplies((replies) => mergeMessage(replies, mapRemoteMessage(updated, me.id)));
    } catch {
      showToast('Não foi possível atualizar a reação.');
    }
  };

  const handleTyping = (isTyping: boolean) => {
    const socket = socketRef.current;
    const target = active
      ? {
          targetType: active.kind === 'CHANNEL' ? ('CHANNEL' as const) : ('CONVERSATION' as const),
          targetId: active.id,
        }
      : null;
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = null;
    if (!socket?.connected || !target) {
      typingTargetRef.current = null;
      return;
    }
    if (isTyping) {
      typingTargetRef.current = target;
      socket.emit('typing', { ...target, isTyping: true });
      typingTimeoutRef.current = window.setTimeout(() => {
        socket.emit('typing', { ...target, isTyping: false });
        typingTargetRef.current = null;
        typingTimeoutRef.current = null;
      }, 1800);
      return;
    }
    const previousTarget = typingTargetRef.current ?? target;
    socket.emit('typing', { ...previousTarget, isTyping: false });
    typingTargetRef.current = null;
  };

  const handleEditMessage = async (messageId: string, nextText: string) => {
    const currentMessage = activeMessages.find((message) => message.id === messageId);
    if (!currentMessage || !active) return false;
    if (!token) {
      dispatchMessage({
        type: 'message-updated',
        conversationId: active.id,
        message: { ...currentMessage, text: nextText.trim(), edited: true },
      });
      return true;
    }
    try {
      const updated = await editMessage(token, messageId, nextText);
      const parentId = updated.conversationId ?? updated.channelId ?? active.id;
      dispatchMessage({
        type: 'message-updated',
        conversationId: parentId,
        message: mapRemoteMessage(updated, me.id),
      });
      return true;
    } catch {
      showToast('Não foi possível editar a mensagem.');
      return false;
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!active) return;
    try {
      if (token) await deleteMessage(token, messageId);
      dispatchMessage({
        type: 'message-deleted',
        conversationId: active.id,
        messageId,
      });
    } catch {
      showToast('Não foi possível excluir a mensagem.');
    }
  };

  const handleToggleReaction = async (messageId: string, emoji: string, isActive: boolean) => {
    if (!token) {
      showToast('Entre na sua conta para reagir à mensagem.');
      return;
    }
    try {
      const updated = isActive
        ? await removeMessageReaction(token, messageId, emoji)
        : await addMessageReaction(token, messageId, emoji);
      const parentId = updated.conversationId ?? updated.channelId ?? activeId;
      dispatchMessage({
        type: 'message-updated',
        conversationId: parentId,
        message: mapRemoteMessage(updated, me.id),
      });
    } catch {
      showToast('Não foi possível atualizar a reação.');
    }
  };

  const beginManageTeam = async (team: RemoteTeam) => {
    if (!token) return;
    setTeamMembers(await getTeamMembers(token, team.id));
    setOrganizationDialog({
      mode: 'manage-team',
      teamId: team.id,
      teamName: team.name,
      description: team.description,
    });
  };

  const beginManageChannel = async (channel: RemoteChannel) => {
    if (!token) return;
    setChannelMembers(await getChannelMembers(token, channel.id));
    setOrganizationDialog({
      mode: 'manage-channel',
      channelId: channel.id,
      channelName: channel.name,
      description: channel.description,
      channelVisibility: channel.visibility,
    });
  };
  const excludedMemberIds =
    organizationDialog?.mode === 'manage-team'
      ? new Set(teamMembers.map((member) => member.id))
      : organizationDialog?.mode === 'manage-channel'
        ? new Set(channelMembers.map((member) => member.id))
        : new Set<string>();
  const availableMembers = workspaceMembers.filter((member) => !excludedMemberIds.has(member.id));

  const dateGroups = activeMessages.reduce<{ date: string; messages: Message[] }[]>(
    (groups, message) => {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup?.date === message.date) lastGroup.messages.push(message);
      else groups.push({ date: message.date, messages: [message] });
      return groups;
    },
    [],
  );

  if (!workspaceListLoaded) {
    return (
      <section className="chat-empty-state" role="status" aria-live="polite">
        Carregando espaços de trabalho…
      </section>
    );
  }

  if (!workspaceId && !workspaces.length) {
    return (
      <section
        className="chat-empty-state organization-onboarding"
        aria-labelledby="empty-chat-title"
      >
        <div className="chat-empty-icon" aria-hidden="true">
          ✦
        </div>
        <h1 id="empty-chat-title">Crie seu espaço de trabalho</h1>
        <p>Organize sua comunicação em equipes, canais e conversas seguras.</p>
        <button
          className="button button-primary"
          type="button"
          onClick={() => setOrganizationDialog({ mode: 'workspace' })}
        >
          Criar espaço de trabalho
        </button>
        <OrganizationDialog
          dialog={organizationDialog}
          workspaceName="Rocket"
          workspaceMembers={[]}
          teamMembers={[]}
          channelMembers={[]}
          availableMembers={[]}
          onClose={() => setOrganizationDialog(null)}
          onCreateWorkspace={async (name) => {
            if (!token) return;
            const created = await createWorkspace(token, name);
            setWorkspaces((items) => [...items, created]);
            setWorkspaceId(created.id);
            setOrganizationDialog(null);
          }}
          onCreateTeam={async () => undefined}
          onCreateChannel={async () => undefined}
          onCreateInvite={async () => {
            throw new Error('Crie um espaço antes de convidar pessoas.');
          }}
          onAddTeamMember={async () => undefined}
          onRemoveTeamMember={async () => undefined}
          onRemoveWorkspaceMember={async () => undefined}
          onUpdateWorkspaceMember={async () => undefined}
          onAddChannelMember={async () => undefined}
          onRemoveChannelMember={async () => undefined}
          onUpdateTeam={async () => undefined}
          onArchiveTeam={async () => undefined}
          onUpdateChannel={async () => undefined}
          onArchiveChannel={async () => undefined}
          onInviteToTeam={() => undefined}
        />
      </section>
    );
  }

  return (
    <div className="chat-page" style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}>
      <ChatSidebar
        activeId={activeId}
        visibleDms={visibleDms}
        teams={teams}
        workspaces={workspaces}
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        workspaceRole={workspaceRole}
        sidebarOpen={sidebarOpen}
        online={online}
        getOtherPerson={(conversation) =>
          conversation.members.find((person) => person.id !== me.id) ??
          conversation.members[0] ??
          me
        }
        onSearch={() => setShowSearch(true)}
        onCreateTeam={() => setOrganizationDialog({ mode: 'team' })}
        onCreateChannel={(teamId) => {
          const team = teams.find((item) => item.id === teamId);
          if (team) setOrganizationDialog({ mode: 'channel', teamId, teamName: team.name });
        }}
        onInvite={(teamId) => {
          const team = teams.find((item) => item.id === teamId);
          setOrganizationDialog({ mode: 'invite', teamId, teamName: team?.name });
        }}
        onManageTeam={(team) => void beginManageTeam(team)}
        onManageWorkspace={() => setOrganizationDialog({ mode: 'manage-workspace' })}
        onManageChannel={(channel) => void beginManageChannel(channel)}
        onWorkspaceChange={(id) => {
          setWorkspaceId(id);
          setWorkspace(null);
          setWorkspaceMembers([]);
          setActiveId('');
          setLoadedConversationIds(new Set());
        }}
        onOpenConversation={openConversation}
        onJoinTeam={(teamId, channelId) => {
          if (!token) return;
          void joinTeam(token, teamId)
            .then(async () => {
              await refreshOrganization();
              showToast('Você entrou na equipe.');
              const joinedTeam = teams.find((team) => team.id === teamId);
              const requestedChannel = joinedTeam?.channels.find(
                (channel) => channel.id === channelId,
              );
              if (joinedTeam && requestedChannel)
                openConversation(
                  toChannelConversation(joinedTeam, { ...requestedChannel, joined: true }),
                );
            })
            .catch(() => showToast('Não foi possível entrar nesta equipe.'));
        }}
        onToggleFavorite={(channelId, favorite) => {
          if (!token) return;
          void updateChannelPreference(token, channelId, { favorite })
            .then(refreshOrganization)
            .catch(() => showToast('Não foi possível atualizar o canal.'));
        }}
        onToggleHidden={(channelId, hidden) => {
          if (!token) return;
          void updateChannelPreference(token, channelId, { hidden })
            .then(refreshOrganization)
            .catch(() => showToast('Não foi possível atualizar o canal.'));
        }}
        onNewChat={() => setShowNewConversation(true)}
        canStartConversation={Boolean(workspaceId) && workspaceRole !== 'GUEST'}
        onToggleConversationPin={(conversation) =>
          void toggleConversationPreference(conversation, 'pinned')
        }
        onToast={showToast}
      />
      <button
        className="sidebar-resizer"
        type="button"
        role="separator"
        aria-label="Redimensionar lista de conversas"
        aria-orientation="vertical"
        aria-valuemin={240}
        aria-valuemax={420}
        aria-valuenow={sidebarWidth}
        tabIndex={0}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          resizeOrigin.current = { x: event.clientX, width: sidebarWidth };
        }}
        onPointerMove={(event) => {
          if (!resizeOrigin.current || event.buttons !== 1) return;
          setSidebarWidth(
            Math.max(
              240,
              Math.min(420, resizeOrigin.current.width + event.clientX - resizeOrigin.current.x),
            ),
          );
        }}
        onPointerUp={() => {
          resizeOrigin.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') setSidebarWidth((width) => Math.max(240, width - 16));
          if (event.key === 'ArrowRight') setSidebarWidth((width) => Math.min(420, width + 16));
        }}
      />
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Fechar navegação"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {active ? (
        <section className="main-panel" aria-label="Conversa atual">
          <ConversationHeader
            active={active}
            isChannel={isChannel}
            showDetails={showDetails}
            showFiles={showChannelFiles}
            getOtherPerson={(conversation) =>
              conversation.members.find((person) => person.id !== me.id) ??
              conversation.members[0] ??
              me
            }
            onMobileMenu={() => setSidebarOpen(true)}
            onSearch={() => setShowSearch(true)}
            onCall={() => showToast('Chamadas de áudio e vídeo em breve.')}
            onToggleDetails={() => setShowDetails((value) => !value)}
            onShowMessages={() => setShowChannelFiles(false)}
            onShowFiles={() => setShowChannelFiles(true)}
            onMore={() => showToast('Mais opções de conversa em breve.')}
          />
          <div className="conversation-layout">
            <section
              className="chat-column"
              id={isChannel ? 'channel-content' : undefined}
              role={isChannel ? 'tabpanel' : undefined}
              aria-label={
                isChannel
                  ? showChannelFiles
                    ? 'Arquivos do canal'
                    : 'Publicações do canal'
                  : undefined
              }
            >
              {showChannelFiles && isChannel ? (
                <FilesBrowser channelId={active.id} channelName={active.name} />
              ) : (
                <>
                  <MessageFeed
                    active={active}
                    isChannel={isChannel}
                    activeMessages={activeMessages}
                    dateGroups={dateGroups}
                    messagesEndRef={messagesEndRef}
                    nextCursor={messagePages[activeId]?.nextCursor ?? null}
                    lastReadAt={messagePages[activeId]?.lastReadAt}
                    isLoadingOlder={messagePages[activeId]?.loadingOlder ?? false}
                    onLoadOlder={loadOlderMessages}
                    me={me}
                    token={token}
                    onShowDetails={() => setShowDetails(true)}
                    onToggleReaction={handleToggleReaction}
                    onEditMessage={handleEditMessage}
                    onDeleteMessage={handleDeleteMessage}
                    mentionOptions={mentionOptions}
                    onOpenThread={(message) => {
                      setThreadRoot(message);
                      setShowDetails(false);
                    }}
                  />
                  <MessageComposer
                    activeName={active.name}
                    isChannel={isChannel}
                    text={text}
                    setText={setText}
                    onSend={handleSend}
                    onToast={showToast}
                    onTyping={handleTyping}
                    typingNames={(
                      typingUsers[
                        `${active.kind === 'CHANNEL' ? 'CHANNEL' : 'CONVERSATION'}:${active.id}`
                      ] ?? []
                    ).map(({ displayName }) => displayName)}
                    mentionOptions={mentionOptions}
                  />
                </>
              )}
            </section>
            {showChannelFiles && isChannel ? null : threadRoot ? (
              <ThreadPanel
                root={threadRoot}
                replies={threadReplies}
                nextCursor={threadPage.nextCursor}
                isLoading={threadPage.loading}
                isLoadingOlder={threadPage.loadingOlder}
                onLoadOlder={() => void loadOlderThreadReplies()}
                onClose={() => setThreadRoot(null)}
                onSend={handleThreadSend}
                onEditMessage={handleEditThreadMessage}
                onDeleteMessage={handleDeleteThreadMessage}
                onToggleReaction={handleToggleThreadReaction}
                mentionOptions={mentionOptions}
                activeName={active.name}
                isChannel={isChannel}
              />
            ) : (
              <ConversationDetails
                active={active}
                isChannel={isChannel}
                open={showDetails}
                onClose={() => setShowDetails(false)}
                meId={me.id}
                availableMembers={workspaceMembers.filter(
                  (member) =>
                    member.id !== me.id &&
                    member.role !== 'GUEST' &&
                    !active.members.some(
                      (conversationMember) => conversationMember.id === member.id,
                    ),
                )}
                onTogglePreference={(preference) =>
                  toggleConversationPreference(active, preference)
                }
                onUpdateGroup={updateGroupDetails}
                onAddMember={addGroupMember}
                onRemoveMember={removeGroupMember}
              />
            )}
          </div>
        </section>
      ) : (
        <section
          className="chat-empty-state chat-no-conversation"
          aria-label="Nenhuma conversa selecionada"
        >
          <h1>Escolha um canal</h1>
          <p>Selecione uma equipe ou canal no painel para começar.</p>
        </section>
      )}
      <MessageSearchDialog
        open={showSearch}
        query={query}
        setQuery={setQuery}
        conversations={conversations}
        getOtherPerson={(conversation) =>
          conversation.members.find((person) => person.id !== me.id) ??
          conversation.members[0] ??
          me
        }
        onOpenConversation={openConversation}
        onClose={() => {
          setShowSearch(false);
          setQuery('');
        }}
      />
      <NewConversationDialog
        open={showNewConversation}
        people={workspaceMembers}
        selfId={me.id}
        onClose={() => setShowNewConversation(false)}
        onStartDirect={startDirectConversation}
        onCreateGroup={createGroup}
      />
      <OrganizationDialog
        dialog={organizationDialog}
        workspaceName={workspaceName}
        workspaceMembers={workspaceMembers}
        teamMembers={teamMembers}
        channelMembers={channelMembers}
        availableMembers={availableMembers}
        onClose={() => setOrganizationDialog(null)}
        onCreateWorkspace={async (name) => {
          if (!token) return;
          const created = await createWorkspace(token, name);
          setWorkspaces((items) => [...items, created]);
          setWorkspaceId(created.id);
          setOrganizationDialog(null);
        }}
        onCreateTeam={async (name, description) => {
          if (!token || !workspaceId) return;
          await createTeam(token, workspaceId, { name, description });
          await refreshOrganization();
          setOrganizationDialog(null);
        }}
        onCreateChannel={async (teamId, name, description, visibility) => {
          if (!token) return;
          const created = await createChannel(token, teamId, { name, description, visibility });
          const refreshed = await refreshOrganization();
          setOrganizationDialog(null);
          if (created.joined) {
            const team = refreshed?.teams.find((item) => item.id === teamId);
            const channel = team?.channels.find((item) => item.id === created.id);
            if (team && channel) openConversation(toChannelConversation(team, channel));
          }
        }}
        onCreateInvite={async (email, role, teamId): Promise<CreatedInvite> => {
          if (!token || !workspaceId) throw new Error('Selecione um espaço de trabalho.');
          return createWorkspaceInvite(token, workspaceId, { email, role, teamId });
        }}
        onAddTeamMember={async (teamId, userId) => {
          if (!token) return;
          await addTeamMember(token, teamId, userId);
          setTeamMembers(await getTeamMembers(token, teamId));
          await refreshOrganization();
        }}
        onRemoveTeamMember={async (teamId, userId) => {
          if (!token) return;
          await removeTeamMember(token, teamId, userId);
          setTeamMembers(await getTeamMembers(token, teamId));
          await refreshOrganization();
        }}
        onRemoveWorkspaceMember={async (userId) => {
          if (!token || !workspaceId) return;
          await removeWorkspaceMember(token, workspaceId, userId);
          await refreshOrganization();
        }}
        onUpdateWorkspaceMember={async (userId, role) => {
          if (!token || !workspaceId) return;
          await updateWorkspaceMemberRole(token, workspaceId, userId, role);
          await refreshOrganization();
        }}
        onAddChannelMember={async (channelId, userId) => {
          if (!token) return;
          await addChannelMember(token, channelId, userId);
          setChannelMembers(await getChannelMembers(token, channelId));
          await refreshOrganization();
        }}
        onRemoveChannelMember={async (channelId, userId) => {
          if (!token) return;
          await removeChannelMember(token, channelId, userId);
          setChannelMembers(await getChannelMembers(token, channelId));
          await refreshOrganization();
        }}
        onUpdateTeam={async (teamId, name, description) => {
          if (!token) return;
          await updateTeam(token, teamId, { name, description });
          await refreshOrganization();
          setOrganizationDialog((current) =>
            current?.mode === 'manage-team' && current.teamId === teamId
              ? { ...current, teamName: name, description }
              : current,
          );
        }}
        onArchiveTeam={async (teamId) => {
          if (!token) return;
          await archiveTeam(token, teamId);
          await refreshOrganization();
          setOrganizationDialog(null);
          setActiveId('');
        }}
        onUpdateChannel={async (channelId, name, description, visibility) => {
          if (!token) return;
          await updateChannel(token, channelId, { name, description, visibility });
          await refreshOrganization();
          setOrganizationDialog((current) =>
            current?.mode === 'manage-channel' && current.channelId === channelId
              ? { ...current, channelName: name, description, channelVisibility: visibility }
              : current,
          );
        }}
        onArchiveChannel={async (channelId) => {
          if (!token) return;
          await archiveChannel(token, channelId);
          await refreshOrganization();
          setOrganizationDialog(null);
          setActiveId('');
        }}
        onInviteToTeam={(teamId) => {
          const team = teams.find((item) => item.id === teamId);
          setOrganizationDialog({ mode: 'invite', teamId, teamName: team?.name });
        }}
      />
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <Check size={16} aria-hidden="true" />
          {toast}
        </div>
      )}
    </div>
  );
}

function toChannelConversation(team: RemoteTeam, channel: RemoteChannel): Conversation {
  return {
    id: channel.id,
    kind: 'CHANNEL',
    name: channel.name,
    description: channel.description ?? undefined,
    members: [],
    teamId: team.id,
    teamName: team.name,
    visibility: channel.visibility,
    joined: channel.joined,
    isFavorite: channel.isFavorite,
    isHidden: channel.isHidden,
    memberCount: channel.memberCount,
    unread: channel.unread,
  };
}
