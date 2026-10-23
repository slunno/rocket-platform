import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import { Check } from 'lucide-react';
import {
  conversations as demoConversations,
  me as demoMe,
  messages as demoMessages,
} from '../../demoData';
import {
  authUserToPerson,
  getConversations,
  getMessages,
  mapRemoteMessage,
  mapRemotePerson,
  sendMessage,
} from '../../api';
import type { Conversation, Message } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { ChatSidebar } from './components/ChatSidebar';
import { ConversationDetails } from './components/ConversationDetails';
import { ConversationHeader } from './components/ConversationHeader';
import { MessageComposer } from './components/MessageComposer';
import { MessageFeed } from './components/MessageFeed';
import { MessageSearchDialog } from './components/MessageSearchDialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export function ChatPage() {
  const { user, accessToken: token } = useAuth();
  const me = useMemo(() => (user ? authUserToPerson(user) : demoMe), [user]);
  const navigate = useNavigate();
  const route = useParams<{ id?: string; teamId?: string; channelId?: string }>();
  const routeId = route.id ?? route.channelId;
  const [activeId, setActiveId] = useState('produto');
  const [convoList, setConvoList] = useState<Conversation[]>(() =>
    user?.id === demoMe.id ? demoConversations : [],
  );
  const [messageMap, setMessageMap] = useState<Record<string, Message[]>>(() =>
    user?.id === demoMe.id ? demoMessages : {},
  );
  const [loadedConversationIds, setLoadedConversationIds] = useState<Set<string>>(
    () => new Set(user?.id === demoMe.id ? Object.keys(demoMessages) : []),
  );
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [online, setOnline] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
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
  const socketRef = useRef<Socket | null>(null);
  const latestTokenRef = useRef(token);
  const myIdRef = useRef(me.id);
  const resizeOrigin = useRef<{ x: number; width: number } | null>(null);
  latestTokenRef.current = token;
  myIdRef.current = me.id;

  useEffect(() => {
    if (routeId) setActiveId(routeId);
  }, [routeId]);

  const active =
    convoList.find((conversation) => conversation.id === activeId) ??
    (user?.id === demoMe.id ? demoConversations[0] : undefined);
  const activeMessages = messageMap[activeId] ?? [];
  const isChannel = active?.kind === 'CHANNEL';
  const visibleChannels = useMemo(
    () =>
      convoList.filter(
        (conversation) =>
          conversation.kind === 'CHANNEL' &&
          conversation.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [convoList, query],
  );
  const visibleDms = useMemo(
    () =>
      convoList.filter(
        (conversation) =>
          conversation.kind !== 'CHANNEL' &&
          conversation.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [convoList, query],
  );

  useEffect(() => {
    if (!token || !user) return;
    void getConversations(token)
      .then((remote) => {
        const mapped = remote.map(
          (conversation) =>
            ({
              id: conversation.id,
              kind: conversation.type,
              name:
                conversation.type === 'CHANNEL'
                  ? conversation.name
                  : (conversation.members.find((member) => member.id !== user.id)?.displayName ??
                    conversation.name),
              description: conversation.description ?? undefined,
              members: conversation.members.map(mapRemotePerson),
              unread: conversation.unread,
              lastMessage: conversation.preview,
              lastAt: conversation.lastAt,
            }) satisfies Conversation,
        );
        setConvoList(mapped);
        setMessageMap({});
        setLoadedConversationIds(new Set());
        const firstConversation =
          mapped.find((conversation) => conversation.kind === 'CHANNEL') ?? mapped[0];
        setActiveId(firstConversation?.id ?? '');
      })
      .catch(() => undefined);
  }, [token, user]);

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
    socket.on('connect', () => setOnline(true));
    socket.on('disconnect', () => setOnline(false));
    socket.on('message:created', (message) => {
      const normalized = mapRemoteMessage(message, myIdRef.current);
      const conversationId = message.conversationId ?? '';
      setMessageMap((current) => {
        const existing = current[conversationId] ?? [];
        return existing.some((item) => item.id === normalized.id)
          ? current
          : { ...current, [conversationId]: [...existing, normalized] };
      });
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id]);

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
    if (!token || !activeId || loadedConversationIds.has(activeId)) return;
    void getMessages(token, activeId)
      .then((remote) => {
        setMessageMap((current) => ({
          ...current,
          [activeId]: remote.map((message) => mapRemoteMessage(message, me.id)),
        }));
        setLoadedConversationIds((current) => new Set(current).add(activeId));
      })
      .catch(() => undefined);
  }, [activeId, loadedConversationIds, me.id, token]);

  useEffect(() => {
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

  if (!active) {
    return (
      <section className="chat-empty-state" aria-labelledby="empty-chat-title">
        <div className="chat-empty-icon" aria-hidden="true">
          ✦
        </div>
        <h1 id="empty-chat-title">Sua conta está pronta</h1>
        <p>
          {user?.displayName}, você ainda não participa de nenhuma conversa. Quando entrar em um
          espaço de trabalho, suas mensagens aparecerão aqui.
        </p>
      </section>
    );
  }

  const openConversation = (conversation: Conversation) => {
    setActiveId(conversation.id);
    navigate(
      conversation.kind === 'CHANNEL'
        ? `/equipes/geral/${encodeURIComponent(conversation.id)}`
        : `/chat/${encodeURIComponent(conversation.id)}`,
    );
    setConvoList((items) =>
      items.map((item) => (item.id === conversation.id ? { ...item, unread: 0 } : item)),
    );
    setSidebarOpen(false);
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
  };

  const handleSend = async () => {
    const cleanText = text.trim();
    if (!cleanText) return;
    setText('');
    const temporaryId = `local-${Date.now()}`;
    const optimistic: Message = {
      id: temporaryId,
      author: me,
      text: cleanText,
      time: new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(
        new Date(),
      ),
      date: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date()),
      mine: true,
    };
    setMessageMap((current) => ({
      ...current,
      [activeId]: [...(current[activeId] ?? []), optimistic],
    }));
    setConvoList((items) =>
      items.map((item) =>
        item.id === activeId ? { ...item, lastMessage: cleanText, lastAt: 'Agora' } : item,
      ),
    );
    if (token) {
      try {
        const created = await sendMessage(token, activeId, cleanText);
        setMessageMap((current) => {
          const existing = current[activeId] ?? [];
          if (existing.some((message) => message.id === created.id)) {
            return {
              ...current,
              [activeId]: existing.filter((message) => message.id !== temporaryId),
            };
          }
          return {
            ...current,
            [activeId]: existing.map((message) =>
              message.id === temporaryId ? mapRemoteMessage(created, me.id) : message,
            ),
          };
        });
      } catch {
        showToast('Mensagem salva nesta sessão. Conecte o backend para sincronizar com a equipe.');
      }
    }
  };

  const addChannel = () => {
    const name = window.prompt('Nome do novo canal');
    if (!name?.trim()) return;
    const normalized = name.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-');
    if (
      convoList.some(
        (conversation) => conversation.kind === 'CHANNEL' && conversation.name === normalized,
      )
    ) {
      showToast('Esse canal já está na sua lista.');
      return;
    }
    const newConversation: Conversation = {
      id: `local-${Date.now()}`,
      kind: 'CHANNEL',
      name: normalized,
      description: 'Um novo espaço para sua equipe.',
      members: [me],
    };
    setConvoList((items) => [...items, newConversation]);
    setMessageMap((current) => ({ ...current, [newConversation.id]: [] }));
    openConversation(newConversation);
    showToast('Canal criado para esta sessão.');
  };

  const getOtherPerson = (conversation: Conversation) =>
    conversation.members.find((person) => person.id !== me.id) ?? conversation.members[0] ?? me;
  const dateGroups = activeMessages.reduce<{ date: string; messages: Message[] }[]>(
    (groups, message) => {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup?.date === message.date) lastGroup.messages.push(message);
      else groups.push({ date: message.date, messages: [message] });
      return groups;
    },
    [],
  );

  return (
    <div className="chat-page" style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}>
      <ChatSidebar
        activeId={activeId}
        visibleChannels={visibleChannels}
        visibleDms={visibleDms}
        sidebarOpen={sidebarOpen}
        online={online}
        getOtherPerson={getOtherPerson}
        onSearch={() => setShowSearch(true)}
        onAddChannel={addChannel}
        onOpenConversation={openConversation}
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
          const nextWidth = resizeOrigin.current.width + event.clientX - resizeOrigin.current.x;
          setSidebarWidth(Math.max(240, Math.min(420, nextWidth)));
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
      <section className="main-panel" aria-label="Conversa atual">
        <ConversationHeader
          active={active}
          isChannel={isChannel}
          showDetails={showDetails}
          getOtherPerson={getOtherPerson}
          onMobileMenu={() => setSidebarOpen(true)}
          onSearch={() => setShowSearch(true)}
          onCall={() => showToast('Chamadas de áudio e vídeo em breve.')}
          onToggleDetails={() => setShowDetails((value) => !value)}
          onMore={() => showToast('Mais opções de conversa em breve.')}
        />
        <div className="conversation-layout">
          <section className="chat-column">
            <MessageFeed
              active={active}
              isChannel={isChannel}
              activeMessages={activeMessages}
              dateGroups={dateGroups}
              messagesEndRef={messagesEndRef}
              me={me}
              onShowDetails={() => setShowDetails(true)}
              onToast={showToast}
            />
            <MessageComposer
              activeName={active.name}
              isChannel={isChannel}
              text={text}
              setText={setText}
              onSend={handleSend}
              onToast={showToast}
            />
          </section>
          <ConversationDetails
            active={active}
            isChannel={isChannel}
            open={showDetails}
            onClose={() => setShowDetails(false)}
            onToast={showToast}
            meId={me.id}
          />
        </div>
      </section>
      <MessageSearchDialog
        open={showSearch}
        query={query}
        setQuery={setQuery}
        conversations={convoList}
        getOtherPerson={getOtherPerson}
        onOpenConversation={openConversation}
        onClose={() => {
          setShowSearch(false);
          setQuery('');
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
