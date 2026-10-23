import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
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
  onToggleReaction,
  onEditMessage,
  onDeleteMessage,
  onOpenThread,
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
  onToggleReaction: (messageId: string, emoji: string, active: boolean) => Promise<void>;
  onEditMessage: (messageId: string, text: string) => Promise<boolean>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onOpenThread: (message: Message) => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);
  const pendingScrollRef = useRef<{ conversationId: string; height: number; top: number } | null>(
    null,
  );
  const [reactionMessageId, setReactionMessageId] = useState<string | null>(null);
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
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
                        {message.edited && <span className="message-edited">editada</span>}
                      </div>
                    )}
                    {editingMessageId === message.id ? (
                      <div className="message-edit-form">
                        <textarea
                          aria-label="Editar mensagem"
                          value={editText}
                          onChange={(event) => setEditText(event.target.value)}
                        />
                        <div>
                          <button
                            type="button"
                            onClick={() => {
                              void onEditMessage(message.id, editText).then((saved) => {
                                if (saved) setEditingMessageId(null);
                              });
                            }}
                            disabled={!editText.trim()}
                          >
                            Salvar
                          </button>
                          <button type="button" onClick={() => setEditingMessageId(null)}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className={`message-text ${message.deleted ? 'message-deleted' : ''}`}>
                        {message.deleted ? 'Esta mensagem foi excluída.' : message.text}
                      </p>
                    )}
                    {!message.deleted && message.reactions?.length ? (
                      <div className="reaction-row" role="group" aria-label="Reações">
                        {message.reactions.map((reaction) => (
                          <button
                            key={reaction.emoji}
                            className={`reaction ${reaction.active ? 'reaction-active' : ''}`}
                            onClick={() =>
                              void onToggleReaction(
                                message.id,
                                reaction.emoji,
                                Boolean(reaction.active),
                              )
                            }
                            aria-label={`${reaction.count} reações ${reaction.emoji}`}
                            title={reaction.users?.join(', ') ?? ''}
                          >
                            <span>{reaction.emoji}</span>
                            <span>{reaction.count}</span>
                          </button>
                        ))}
                        <button
                          className="reaction-add"
                          aria-label="Adicionar reação"
                          aria-expanded={reactionMessageId === message.id}
                          onClick={() =>
                            setReactionMessageId((current) =>
                              current === message.id ? null : message.id,
                            )
                          }
                        >
                          <Smile size={15} />
                          <Plus size={10} />
                        </button>
                      </div>
                    ) : null}
                    {!message.deleted && reactionMessageId === message.id && (
                      <div className="reaction-picker" role="group" aria-label="Adicionar reação">
                        {['👍', '❤️', '😂', '🎉', '👀'].map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            aria-label={`Reagir com ${emoji}`}
                            onClick={() => {
                              void onToggleReaction(message.id, emoji, false);
                              setReactionMessageId(null);
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                    {!message.deleted && (
                      <button
                        className="thread-link"
                        type="button"
                        onClick={() => onOpenThread(message)}
                      >
                        <MessageCircle size={13} />
                        {message.replyCount
                          ? `${message.replyCount} respostas`
                          : 'Responder no tópico'}
                      </button>
                    )}
                  </div>
                  {!message.deleted && (
                    <div className="message-hover-actions">
                      <button
                        aria-label="Reagir à mensagem"
                        aria-expanded={reactionMessageId === message.id}
                        onClick={() =>
                          setReactionMessageId((current) =>
                            current === message.id ? null : message.id,
                          )
                        }
                      >
                        <Smile size={15} />
                      </button>
                      {message.mine && (
                        <button
                          aria-label="Mais ações da mensagem"
                          aria-expanded={menuMessageId === message.id}
                          onClick={() =>
                            setMenuMessageId((current) =>
                              current === message.id ? null : message.id,
                            )
                          }
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      )}
                      {menuMessageId === message.id && (
                        <div
                          className="message-action-menu"
                          role="group"
                          aria-label="Ações da mensagem"
                        >
                          {message.mine && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditText(message.text);
                                  setEditingMessageId(message.id);
                                  setMenuMessageId(null);
                                }}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void onDeleteMessage(message.id);
                                  setMenuMessageId(null);
                                }}
                              >
                                Excluir
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
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
