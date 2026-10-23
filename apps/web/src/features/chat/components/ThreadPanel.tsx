import { useEffect, useRef, useState } from 'react';
import { Plus, Smile, X } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import type { Message } from '../../../types';
import { MessageContent, type MessageMentionOption } from './MessageContent';
import { MessageComposer } from './MessageComposer';

export function ThreadPanel({
  root,
  replies,
  nextCursor,
  isLoading,
  isLoadingOlder,
  onLoadOlder,
  onClose,
  onSend,
  onEditMessage,
  onDeleteMessage,
  onToggleReaction,
  mentionOptions,
  activeName,
  isChannel,
}: {
  root: Message;
  replies: Message[];
  nextCursor: string | null;
  isLoading: boolean;
  isLoadingOlder: boolean;
  onLoadOlder: () => void;
  onClose: () => void;
  onSend: (text: string) => Promise<void>;
  onEditMessage: (id: string, text: string) => Promise<boolean>;
  onDeleteMessage: (id: string) => Promise<void>;
  onToggleReaction: (id: string, emoji: string, active: boolean) => Promise<void>;
  mentionOptions: MessageMentionOption[];
  activeName: string;
  isChannel: boolean;
}) {
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [reactionMessageId, setReactionMessageId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [replies.length, root.id]);

  const submit = async () => {
    const value = text.trim();
    if (!value) return;
    setText('');
    await onSend(value);
  };

  return (
    <aside className="details-panel thread-panel" aria-label="Conversa em tópico">
      <div className="details-header">
        <div>
          <span className="eyebrow">TÓPICO</span>
          <h2>Respostas</h2>
        </div>
        <button className="icon-button" aria-label="Fechar tópico" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="thread-root">
        <Avatar person={root.author} size="small" />
        <div>
          <strong>{root.author.name}</strong>
          {root.deleted ? (
            <p className="message-deleted">Esta mensagem foi excluída.</p>
          ) : (
            <MessageContent text={root.text} mentionOptions={mentionOptions} />
          )}
        </div>
      </div>
      <div className="thread-replies" aria-live="polite" aria-busy={isLoading}>
        {nextCursor && (
          <button
            className="older-messages-button"
            type="button"
            onClick={onLoadOlder}
            disabled={isLoadingOlder}
          >
            {isLoadingOlder ? 'Carregando respostas…' : 'Ver respostas anteriores'}
          </button>
        )}
        {isLoading && !replies.length ? (
          <p className="thread-empty">Carregando respostas…</p>
        ) : replies.length ? (
          replies.map((reply) => (
            <article className="thread-reply" key={reply.id}>
              <Avatar person={reply.author} size="small" />
              <div className="thread-reply-body">
                <div className="thread-reply-meta">
                  <strong>{reply.author.name}</strong>
                  <time>{reply.time}</time>
                </div>
                {editingId === reply.id ? (
                  <div className="thread-edit-form">
                    <textarea
                      aria-label="Editar resposta"
                      value={editText}
                      onChange={(event) => setEditText(event.target.value)}
                    />
                    <div>
                      <button
                        type="button"
                        disabled={!editText.trim()}
                        onClick={() => {
                          void onEditMessage(reply.id, editText).then((saved) => {
                            if (saved) setEditingId(null);
                          });
                        }}
                      >
                        Salvar
                      </button>
                      <button type="button" onClick={() => setEditingId(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : reply.deleted ? (
                  <p className="message-deleted">Esta resposta foi excluída.</p>
                ) : (
                  <MessageContent text={reply.text} mentionOptions={mentionOptions} />
                )}
                {!reply.deleted && (
                  <div className="reaction-row" role="group" aria-label="Reações da resposta">
                    {(reply.reactions ?? []).map((reaction) => (
                      <button
                        key={reaction.emoji}
                        className={`reaction ${reaction.active ? 'reaction-active' : ''}`}
                        type="button"
                        onClick={() =>
                          void onToggleReaction(reply.id, reaction.emoji, Boolean(reaction.active))
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
                      type="button"
                      aria-label="Adicionar reação à resposta"
                      aria-expanded={reactionMessageId === reply.id}
                      onClick={() =>
                        setReactionMessageId((current) => (current === reply.id ? null : reply.id))
                      }
                    >
                      <Smile size={15} />
                      <Plus size={10} />
                    </button>
                  </div>
                )}
                {!reply.deleted && reactionMessageId === reply.id && (
                  <div className="reaction-picker" role="group" aria-label="Adicionar reação">
                    {['👍', '❤️', '😂', '🎉', '👀'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        aria-label={`Reagir com ${emoji}`}
                        onClick={() => {
                          void onToggleReaction(reply.id, emoji, false);
                          setReactionMessageId(null);
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
                {reply.mine && !reply.deleted && editingId !== reply.id && (
                  <div className="thread-reply-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setEditText(reply.text);
                        setEditingId(reply.id);
                      }}
                    >
                      Editar
                    </button>
                    <button type="button" onClick={() => void onDeleteMessage(reply.id)}>
                      Excluir
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))
        ) : (
          <p className="thread-empty">Ainda não há respostas. Comece a conversa.</p>
        )}
        <div ref={endRef} />
      </div>
      <MessageComposer
        variant="thread"
        activeName={activeName}
        isChannel={isChannel}
        text={text}
        setText={setText}
        onSend={submit}
        onToast={() => undefined}
        onTyping={() => undefined}
        typingNames={[]}
        mentionOptions={mentionOptions}
      />
    </aside>
  );
}
