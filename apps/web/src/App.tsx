import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  Activity,
  ArrowDown,
  AtSign,
  Bell,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Command,
  Hash,
  Info,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Send,
  Smile,
  Sparkles,
  Users,
  Video,
  X,
} from 'lucide-react';
import { conversations as demoConversations, me, messages as demoMessages } from './demoData';
import {
  getConversations,
  getMessages,
  mapRemoteMessage,
  mapRemotePerson,
  sendMessage,
  startDemoSession,
} from './api';
import type { Conversation, Message, Person } from './types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function PersonAvatar({
  person,
  size = 'normal',
}: {
  person: Person;
  size?: 'small' | 'normal' | 'large';
}) {
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ backgroundColor: person.color }}
      title={person.name}
    >
      {person.initials}
    </span>
  );
}

function App() {
  const [activeId, setActiveId] = useState('produto');
  const [convoList, setConvoList] = useState<Conversation[]>(demoConversations);
  const [messageMap, setMessageMap] = useState<Record<string, Message[]>>(demoMessages);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchAll, setSearchAll] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  const active =
    convoList.find((conversation) => conversation.id === activeId) ?? demoConversations[0];
  const activeMessages = messageMap[activeId] ?? [];
  const isChannel = active.kind === 'CHANNEL';
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
    const bootstrap = async () => {
      try {
        const session = await startDemoSession();
        setToken(session);
        const remote = await getConversations(session);
        if (remote.length) {
          const mapped = remote.map(
            (conversation) =>
              ({
                id: conversation.id,
                kind: conversation.type,
                name:
                  conversation.type === 'CHANNEL'
                    ? conversation.name
                    : (conversation.members.find((member) => member.id !== me.id)?.name ??
                      conversation.name),
                description: conversation.description ?? undefined,
                members: conversation.members.map(mapRemotePerson),
                unread: conversation.unread,
                lastMessage: conversation.preview,
                lastAt: conversation.lastAt,
              }) satisfies Conversation,
          );
          setConvoList(mapped);
          const firstChannel = mapped.find((conversation) => conversation.kind === 'CHANNEL');
          if (firstChannel) setActiveId(firstChannel.id);
        }
      } catch {
        // O protótipo continua disponível com dados locais enquanto o backend não está configurado.
      }
    };
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!token) return;
    const socket = io(API_URL, { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => setOnline(true));
    socket.on('disconnect', () => setOnline(false));
    socket.on('message:created', (message) => {
      const normalized = mapRemoteMessage(message, me.id);
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
  }, [token]);

  useEffect(() => {
    if (!token || !activeId || messageMap[activeId]?.length) return;
    void getMessages(token, activeId)
      .then((remote) => {
        setMessageMap((current) => ({
          ...current,
          [activeId]: remote.map((message) => mapRemoteMessage(message, me.id)),
        }));
      })
      .catch(() => undefined);
  }, [activeId, messageMap, token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeId, activeMessages.length]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setShowSearch(true);
        setTimeout(() => document.getElementById('global-search')?.focus(), 20);
      }
      if (event.key === 'Escape') {
        setShowSearch(false);
        setShowDetails(false);
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const openConversation = (conversation: Conversation) => {
    setActiveId(conversation.id);
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
      date: 'Hoje, 22 de outubro',
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
    <div className="app-shell">
      <aside className="rail">
        <div className="brand-mark">
          <span className="brand-orbit">r</span>
          <span className="brand-pulse" />
        </div>
        <div className="rail-separator" />
        <button className="rail-button rail-button-active" title="Mensagens">
          <MessageCircle size={20} strokeWidth={2.2} />
          <span className="rail-dot" />
        </button>
        <button
          className="rail-button"
          title="Atividade"
          onClick={() => showToast('Sua atividade está em dia.')}
        >
          <Activity size={19} />
        </button>
        <button
          className="rail-button"
          title="Salvos"
          onClick={() => showToast('Suas mensagens salvas aparecerão aqui.')}
        >
          <Bookmark size={19} />
        </button>
        <div className="rail-spacer" />
        <button
          className="rail-button"
          title="Ajuda"
          onClick={() => showToast('Central de ajuda em breve.')}
        >
          <CircleHelp size={19} />
        </button>
        <button className="rail-profile" title="Seu perfil">
          <PersonAvatar person={me} size="small" />
          <span className="online-indicator" />
        </button>
      </aside>

      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="workspace-picker">
          <div className="workspace-logo">
            <Sparkles size={17} />
          </div>
          <div className="workspace-copy">
            <strong>Rocket Labs</strong>
            <span>Espaço de trabalho</span>
          </div>
          <button
            className="icon-button light-icon"
            aria-label="Abrir menu do espaço"
            onClick={() => showToast('Configurações do espaço em breve.')}
          >
            <ChevronDown size={17} />
          </button>
        </div>

        <button className="search-trigger" onClick={() => setShowSearch(true)}>
          <Search size={16} />
          <span>Buscar em tudo</span>
          <kbd>
            <Command size={11} /> K
          </kbd>
        </button>

        <div className="sidebar-main-nav">
          <button className="nav-row nav-row-selected">
            <MessageCircle size={17} />
            <span>Mensagens</span>
            <span className="nav-count">2</span>
          </button>
          <button className="nav-row" onClick={() => showToast('Não há menções novas.')}>
            <AtSign size={17} />
            <span>Menções</span>
          </button>
          <button className="nav-row" onClick={() => showToast('Nenhuma notificação nova.')}>
            <Bell size={17} />
            <span>Notificações</span>
          </button>
        </div>

        <div className="sidebar-divider" />
        <section className="conversation-section">
          <div className="section-heading">
            <div>
              <ChevronDown size={14} />
              <span>CANAIS</span>
            </div>
            <button className="section-add" aria-label="Criar canal" onClick={addChannel}>
              <Plus size={16} />
            </button>
          </div>
          <div className="conversation-list">
            {visibleChannels.map((conversation) => (
              <button
                key={conversation.id}
                className={`conversation-row ${activeId === conversation.id ? 'conversation-row-active' : ''}`}
                onClick={() => openConversation(conversation)}
              >
                <Hash size={16} className="row-hash" />
                <span className="conversation-name">{conversation.name}</span>
                {conversation.unread ? (
                  <span className="unread-count">{conversation.unread}</span>
                ) : null}
              </button>
            ))}
            {!visibleChannels.length && <p className="empty-list">Nenhum canal encontrado.</p>}
          </div>
        </section>

        <section className="conversation-section dm-section">
          <div className="section-heading">
            <div>
              <ChevronDown size={14} />
              <span>MENSAGENS DIRETAS</span>
            </div>
            <button
              className="section-add"
              aria-label="Nova mensagem direta"
              onClick={() => showToast('Escolha alguém da equipe para iniciar uma conversa.')}
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="conversation-list">
            {visibleDms.map((conversation) => {
              const person = getOtherPerson(conversation);
              return (
                <button
                  key={conversation.id}
                  className={`conversation-row dm-row ${activeId === conversation.id ? 'conversation-row-active' : ''}`}
                  onClick={() => openConversation(conversation)}
                >
                  <span className="avatar-wrap">
                    <PersonAvatar person={person} size="small" />
                    <span className={`status-dot status-${person.status}`} />
                  </span>
                  <span className="conversation-name">{conversation.name}</span>
                  {conversation.unread ? (
                    <span className="unread-count">{conversation.unread}</span>
                  ) : null}
                </button>
              );
            })}
            {!visibleDms.length && <p className="empty-list">Nenhuma conversa encontrada.</p>}
          </div>
        </section>

        <div className="sidebar-bottom">
          <div className="workspace-status">
            <span className="status-live" />{' '}
            <span>{online ? 'Conectado' : 'Modo de demonstração'}</span>
          </div>
          <button
            className="icon-button light-icon"
            onClick={() => showToast('Preferências em breve.')}
            aria-label="Preferências"
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Fechar navegação"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="main-panel">
        <header className="conversation-header">
          <button
            className="mobile-menu icon-button"
            aria-label="Abrir navegação"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>
          <button
            className="mobile-back icon-button"
            aria-label="Voltar"
            onClick={() => setSidebarOpen(true)}
          >
            <ChevronLeft size={20} />
          </button>
          <div className="conversation-heading-icon">
            {isChannel ? (
              <Hash size={18} />
            ) : (
              <PersonAvatar person={getOtherPerson(active)} size="small" />
            )}
          </div>
          <div className="conversation-heading-copy">
            <h1>{isChannel ? active.name : active.name}</h1>
            <p>
              {isChannel ? active.description : (getOtherPerson(active).role ?? 'Conversa direta')}
            </p>
          </div>
          {isChannel && (
            <div className="header-members" title={`${active.members.length} pessoas no canal`}>
              <div className="mini-avatars">
                {active.members.slice(0, 3).map((person) => (
                  <PersonAvatar key={person.id} person={person} size="small" />
                ))}
              </div>
              <span>{active.members.length}</span>
            </div>
          )}
          <div className="header-divider" />
          <button
            className="icon-button header-action"
            aria-label="Buscar nesta conversa"
            onClick={() => {
              setSearchAll(false);
              setShowSearch(true);
            }}
          >
            <Search size={19} />
          </button>
          <button
            className="icon-button header-action"
            aria-label="Iniciar chamada"
            onClick={() => showToast('Chamadas de áudio e vídeo em breve.')}
          >
            <Video size={19} />
          </button>
          <button
            className={`icon-button header-action ${showDetails ? 'action-selected' : ''}`}
            aria-label="Ver detalhes"
            onClick={() => setShowDetails((value) => !value)}
          >
            <Info size={19} />
          </button>
          <button
            className="icon-button header-action more-action"
            aria-label="Mais opções"
            onClick={() => showToast('Mais opções de conversa em breve.')}
          >
            <MoreHorizontal size={20} />
          </button>
        </header>

        <div className="conversation-layout">
          <section className="chat-column">
            {isChannel && active.id === 'produto' && (
              <div className="channel-intro">
                <div className="intro-icon">
                  <Hash size={19} />
                </div>
                <div>
                  <h2>Bem-vindo a #{active.name}</h2>
                  <p>
                    {active.description}{' '}
                    <button onClick={() => setShowDetails(true)}>Ver detalhes</button>
                  </p>
                </div>
              </div>
            )}
            <div className="messages-scroll">
              {dateGroups.map((group) => (
                <div key={group.date} className="message-date-group">
                  <div className="date-divider">
                    <span>{group.date}</span>
                  </div>
                  {group.messages.map((message, index) => {
                    const previous = group.messages[index - 1];
                    const compact = previous?.author.id === message.author.id;
                    return (
                      <article
                        key={message.id}
                        className={`message ${compact ? 'message-compact' : ''} ${message.mine ? 'message-mine' : ''}`}
                      >
                        <div className="message-avatar">
                          {!compact && <PersonAvatar person={message.author} />}
                        </div>
                        <div className="message-body">
                          {!compact && (
                            <div className="message-meta">
                              <strong>{message.author.name}</strong>
                              {message.author.id === me.id && (
                                <span className="you-badge">você</span>
                              )}
                              <time>{message.time}</time>
                            </div>
                          )}
                          <p className="message-text">{message.text}</p>
                          {message.reactions?.length ? (
                            <div className="reaction-row">
                              {message.reactions.map((reaction) => (
                                <button
                                  key={reaction.emoji}
                                  className={`reaction ${reaction.active ? 'reaction-active' : ''}`}
                                  onClick={() => showToast('Reações em tempo real em breve.')}
                                >
                                  <span>{reaction.emoji}</span>
                                  <span>{reaction.count}</span>
                                </button>
                              ))}
                              <button
                                className="reaction-add"
                                aria-label="Adicionar reação"
                                onClick={() => showToast('Seletor de reações em breve.')}
                              >
                                <Smile size={15} />
                                <Plus size={10} />
                              </button>
                            </div>
                          ) : null}
                          {message.replyCount ? (
                            <button
                              className="thread-link"
                              onClick={() =>
                                showToast('As conversas em tópicos serão adicionadas em breve.')
                              }
                            >
                              <span className="thread-avatars">
                                <PersonAvatar person={me} size="small" />
                                <PersonAvatar person={message.author} size="small" />
                              </span>
                              {message.replyCount} respostas <span>Última resposta às 10:38</span>
                            </button>
                          ) : null}
                        </div>
                        <div className="message-hover-actions">
                          <button
                            title="Reagir"
                            onClick={() => showToast('Seletor de reações em breve.')}
                          >
                            <Smile size={15} />
                          </button>
                          <button
                            title="Responder no tópico"
                            onClick={() => showToast('Conversas em tópicos em breve.')}
                          >
                            <MessageCircle size={15} />
                          </button>
                          <button
                            title="Mais ações"
                            onClick={() => showToast('Ações da mensagem em breve.')}
                          >
                            <MoreHorizontal size={16} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ))}
              {activeMessages.length === 0 && (
                <div className="empty-chat">
                  <div className="empty-chat-icon">
                    <MessageCircle size={22} />
                  </div>
                  <strong>Essa conversa está começando</strong>
                  <span>Envie a primeira mensagem para dar o pontapé inicial.</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="composer-wrap">
              <div className="composer">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder={`Mensagem em ${isChannel ? `#${active.name}` : active.name}`}
                  aria-label="Escreva uma mensagem"
                />
                <div className="composer-toolbar">
                  <div className="composer-tools">
                    <button
                      title="Formatação"
                      onClick={() => showToast('Formatação de texto em breve.')}
                    >
                      <span className="format-icon">Aa</span>
                    </button>
                    <span className="tool-separator" />
                    <button
                      title="Anexar arquivo"
                      onClick={() => showToast('Envio de arquivos em breve.')}
                    >
                      <Paperclip size={17} />
                    </button>
                    <button title="Emoji" onClick={() => setText((current) => `${current} 😊`)}>
                      <Smile size={17} />
                    </button>
                    <button
                      title="Mencionar alguém"
                      onClick={() => setText((current) => `${current}@`)}
                    >
                      <AtSign size={16} />
                    </button>
                  </div>
                  <div className="composer-submit-area">
                    <span className="send-hint">Enter para enviar</span>
                    <button
                      className="send-button"
                      onClick={() => void handleSend()}
                      disabled={!text.trim()}
                      title="Enviar mensagem"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </div>
              </div>
              <p className="composer-note">
                Compartilhe uma ideia, uma atualização ou só diga oi.{' '}
                <span>Shift + Enter para pular linha</span>
              </p>
            </div>
          </section>

          {showDetails && (
            <aside className="details-panel">
              <div className="details-header">
                <div>
                  <span className="eyebrow">DETALHES</span>
                  <h2>{isChannel ? `# ${active.name}` : active.name}</h2>
                </div>
                <button
                  className="icon-button"
                  aria-label="Fechar detalhes"
                  onClick={() => setShowDetails(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <p className="details-description">
                {active.description ?? `Conversa direta com ${active.name}.`}
              </p>
              <button
                className="details-edit"
                onClick={() => showToast('Edição dos detalhes em breve.')}
              >
                <span>Descrição</span>
                <span>Editar</span>
              </button>
              <div className="details-divider" />
              <button
                className="details-members"
                onClick={() => showToast('Lista de pessoas em breve.')}
              >
                <span>
                  <Users size={17} /> Pessoas
                </span>
                <span>
                  {active.members.length}
                  <ChevronRight size={15} />
                </span>
              </button>
              <div className="member-list">
                {active.members.slice(0, 6).map((person) => (
                  <div className="member-row" key={person.id}>
                    <span className="avatar-wrap">
                      <PersonAvatar person={person} size="small" />
                      <span className={`status-dot status-${person.status}`} />
                    </span>
                    <span>{person.name}</span>
                    {person.id === me.id && <small>você</small>}
                  </div>
                ))}
              </div>
            </aside>
          )}
        </div>
      </main>

      {showSearch && (
        <div className="modal-backdrop" onClick={() => setShowSearch(false)}>
          <div className="search-modal" onClick={(event) => event.stopPropagation()}>
            <div className="search-modal-input">
              <Search size={19} />
              <input
                id="global-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchAll ? 'Buscar mensagens e conversas' : 'Buscar canais e pessoas'}
              />
              <kbd>ESC</kbd>
              <button
                aria-label="Fechar busca"
                onClick={() => {
                  setShowSearch(false);
                  setQuery('');
                }}
              >
                <X size={17} />
              </button>
            </div>
            <div className="search-modal-content">
              <span className="eyebrow">{query ? 'RESULTADOS' : 'ACESSO RÁPIDO'}</span>
              {query ? (
                <>
                  <div className="search-result-label">CANAIS</div>
                  {convoList
                    .filter(
                      (conversation) =>
                        conversation.kind === 'CHANNEL' &&
                        conversation.name.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((conversation) => (
                      <button
                        className="search-result"
                        key={conversation.id}
                        onClick={() => {
                          openConversation(conversation);
                          setShowSearch(false);
                          setQuery('');
                        }}
                      >
                        <Hash size={16} />
                        <span>{conversation.name}</span>
                        <ChevronRight size={15} />
                      </button>
                    ))}
                  <div className="search-result-label">PESSOAS</div>
                  {convoList
                    .filter(
                      (conversation) =>
                        conversation.kind !== 'CHANNEL' &&
                        conversation.name.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((conversation) => (
                      <button
                        className="search-result"
                        key={conversation.id}
                        onClick={() => {
                          openConversation(conversation);
                          setShowSearch(false);
                          setQuery('');
                        }}
                      >
                        <PersonAvatar person={getOtherPerson(conversation)} size="small" />
                        <span>{conversation.name}</span>
                        <ChevronRight size={15} />
                      </button>
                    ))}
                </>
              ) : (
                <div className="search-hints">
                  <span>
                    <kbd>
                      <ArrowDown size={11} />
                    </kbd>{' '}
                    navegar
                  </span>
                  <span>
                    <kbd>Enter</kbd> abrir conversa
                  </span>
                  <span>
                    <kbd>Esc</kbd> fechar
                  </span>
                </div>
              )}
            </div>
            <div className="search-modal-footer">
              <span>
                <Sparkles size={13} /> Dica rápida
              </span>
              <span>
                Use <kbd>⌘ K</kbd> para buscar de qualquer lugar
              </span>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
