import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { Hash, MessageCircle, MoreHorizontal, Plus, Smile } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import type { Conversation, Message, Person } from '../../../types';

type MessageGroup = { date: string; messages: Message[] };

export function MessageFeed({
  active,
  isChannel,
  activeMessages,
  dateGroups,
  messagesEndRef,
  nextCursor,
  isLoadingOlder,
  onLoadOlder,
  me,
  onShowDetails,
  onToast,
}: {
  active: Conversation;
  isChannel: boolean;
  activeMessages: Message[];
  dateGroups: MessageGroup[];
  messagesEndRef: RefObject<HTMLDivElement | null>;
  nextCursor: string | null;
  isLoadingOlder: boolean;
  onLoadOlder: () => Promise<void>;
  me: Person;
  onShowDetails: () => void;
  onToast: (message: string) => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);
  const pendingScrollRef = useRef<{ conversationId: string; height: number; top: number } | null>(
    null,
  );
  useEffect(() => {
    isLoadingRef.current = isLoadingOlder;
  }, [isLoadingOlder]);
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const pending = pendingScrollRef.current;
    if (!container || !pending || isLoadingOlder) return;
    if (pending.conversationId === active.id) {
      container.scrollTop = pending.top + container.scrollHeight - pending.height;
    }
    pendingScrollRef.current = null;
  }, [active.id, activeMessages.length, isLoadingOlder]);
  const requestOlder = () => {
    const container = scrollContainerRef.current;
    if (!container || !nextCursor || isLoadingRef.current) return;
    pendingScrollRef.current = {
      conversationId: active.id,
      height: container.scrollHeight,
      top: container.scrollTop,
    };
    isLoadingRef.current = true;
    void onLoadOlder();
  };

  return (
    <>
      {isChannel && active.id === 'produto' && (
        <div className="channel-intro">
          <div className="intro-icon">
            <Hash size={19} />
          </div>
          <div>
            <h2>Bem-vindo a #{active.name}</h2>
            <p>
              {active.description} <button onClick={onShowDetails}>Ver detalhes</button>
            </p>
          </div>
        </div>
      )}
      <div
        ref={scrollContainerRef}
        className="messages-scroll"
        role="feed"
        aria-label={`Mensagens em ${active.name}`}
        aria-busy={isLoadingOlder}
        onScroll={(event) => {
          if (event.currentTarget.scrollTop <= 24) requestOlder();
        }}
      >
        {nextCursor && (
          <button
            className="older-messages-button"
            type="button"
            onClick={requestOlder}
            disabled={isLoadingOlder}
          >
            {isLoadingOlder ? 'Carregando mensagens…' : 'Carregar mensagens anteriores'}
          </button>
        )}
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
                    {!compact && <Avatar person={message.author} />}
                  </div>
                  <div className="message-body">
                    {!compact && (
                      <div className="message-meta">
                        <strong>{message.author.name}</strong>
                        {message.author.id === me.id && <span className="you-badge">você</span>}
                        <time>{message.time}</time>
                      </div>
                    )}
                    <p className="message-text">{message.text}</p>
                    {message.reactions?.length ? (
                      <div className="reaction-row" role="group" aria-label="Reações">
                        {message.reactions.map((reaction) => (
                          <button
                            key={reaction.emoji}
                            className={`reaction ${reaction.active ? 'reaction-active' : ''}`}
                            onClick={() => onToast('Reações em tempo real em breve.')}
                            aria-label={`${reaction.count} reações ${reaction.emoji}`}
                          >
                            <span>{reaction.emoji}</span>
                            <span>{reaction.count}</span>
                          </button>
                        ))}
                        <button
                          className="reaction-add"
                          aria-label="Adicionar reação"
                          onClick={() => onToast('Seletor de reações em breve.')}
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
                          onToast('As conversas em tópicos serão adicionadas em breve.')
                        }
                      >
                        <span className="thread-avatars">
                          <Avatar person={me} size="small" />
                          <Avatar person={message.author} size="small" />
                        </span>
                        {message.replyCount} respostas <span>Última resposta às 10:38</span>
                      </button>
                    ) : null}
                  </div>
                  <div className="message-hover-actions">
                    <button
                      aria-label="Reagir à mensagem"
                      onClick={() => onToast('Seletor de reações em breve.')}
                    >
                      <Smile size={15} />
                    </button>
                    <button
                      aria-label="Responder no tópico"
                      onClick={() => onToast('Conversas em tópicos em breve.')}
                    >
                      <MessageCircle size={15} />
                    </button>
                    <button
                      aria-label="Mais ações da mensagem"
                      onClick={() => onToast('Ações da mensagem em breve.')}
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
    </>
  );
}
