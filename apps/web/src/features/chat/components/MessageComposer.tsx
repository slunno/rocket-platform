import { useId, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { AtSign, MessageCircle, Paperclip, Send, Smile } from 'lucide-react';
import type { MessageMentionOption } from './MessageContent';

function getMentionQuery(value: string, caret: number) {
  const beforeCaret = value.slice(0, caret);
  const match = beforeCaret.match(/(?:^|\s)@([a-z\d._-]*)$/i);
  return match ? match[1]!.toLowerCase() : null;
}

export function MessageComposer({
  activeName,
  isChannel,
  text,
  setText,
  onSend,
  onToast,
  onTyping,
  typingNames,
  mentionOptions,
  variant = 'regular',
}: {
  activeName: string;
  isChannel: boolean;
  text: string;
  setText: Dispatch<SetStateAction<string>>;
  onSend: () => Promise<void>;
  onToast: (message: string) => void;
  onTyping: (isTyping: boolean) => void;
  typingNames: string[];
  mentionOptions: MessageMentionOption[];
  variant?: 'regular' | 'thread';
}) {
  const compact = variant === 'thread';
  const mentionListId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [showFormattingHelp, setShowFormattingHelp] = useState(false);
  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    return mentionOptions
      .filter(
        ({ username, displayName }) =>
          username.toLowerCase().includes(mentionQuery) ||
          displayName.toLowerCase().includes(mentionQuery),
      )
      .slice(0, 8);
  }, [mentionOptions, mentionQuery]);
  const typingLabel =
    typingNames.length === 1
      ? `${typingNames[0]} está digitando…`
      : typingNames.length > 1
        ? `${typingNames.slice(0, -1).join(', ')} e ${typingNames.at(-1)} estão digitando…`
        : '';

  const insertMention = (mention: MessageMentionOption) => {
    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? text.length;
    const query = getMentionQuery(text, caret);
    if (query === null) return;
    const start = caret - query.length - 1;
    const token = mention.type === 'CHANNEL' ? 'canal' : mention.username;
    const nextText = `${text.slice(0, start)}@${token} ${text.slice(caret)}`;
    const nextCaret = start + token.length + 2;
    setText(nextText);
    setMentionQuery(null);
    onTyping(Boolean(nextText.trim()));
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const sendWithMention = (index: number) => {
    const option = suggestions[index];
    if (option) insertMention(option);
  };

  return (
    <div className={compact ? 'thread-composer-wrap' : 'composer-wrap'}>
      <div className={compact ? 'thread-composer' : 'composer'}>
        <textarea
          ref={textareaRef}
          rows={compact ? 2 : 1}
          value={text}
          onChange={(event) => {
            const nextText = event.target.value;
            setText(nextText);
            setMentionQuery(getMentionQuery(nextText, event.target.selectionStart));
            setActiveMentionIndex(0);
            onTyping(Boolean(nextText.trim()));
          }}
          onKeyDown={(event) => {
            if (suggestions.length) {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveMentionIndex((index) => (index + 1) % suggestions.length);
                return;
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveMentionIndex(
                  (index) => (index - 1 + suggestions.length) % suggestions.length,
                );
                return;
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendWithMention(activeMentionIndex);
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setMentionQuery(null);
                return;
              }
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void onSend();
            }
          }}
          placeholder={
            compact
              ? 'Escreva uma resposta'
              : `Mensagem em ${isChannel ? `#${activeName}` : activeName}`
          }
          aria-label={compact ? 'Responder no tópico' : 'Escreva uma mensagem'}
          aria-autocomplete="list"
          aria-controls={suggestions.length ? mentionListId : undefined}
          aria-activedescendant={
            suggestions.length ? `${mentionListId}-${activeMentionIndex}` : undefined
          }
          aria-expanded={suggestions.length > 0}
        />
        {suggestions.length > 0 && (
          <div
            className="mention-suggestions"
            id={mentionListId}
            role="listbox"
            aria-label="Sugestões de menção"
          >
            {suggestions.map((mention, index) => (
              <button
                key={`${mention.type}:${mention.username}`}
                id={`${mentionListId}-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeMentionIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertMention(mention)}
              >
                <strong>{mention.type === 'CHANNEL' ? 'Canal atual' : mention.displayName}</strong>
                <span>{mention.type === 'CHANNEL' ? '@canal' : `@${mention.username}`}</span>
              </button>
            ))}
          </div>
        )}
        {!compact && (
          <div className="composer-toolbar">
            <div className="composer-tools">
              <button
                type="button"
                title="Formatação"
                aria-label="Ajuda de formatação"
                aria-expanded={showFormattingHelp}
                onClick={() => setShowFormattingHelp((current) => !current)}
              >
                <span className="format-icon">Aa</span>
              </button>
              <span className="tool-separator" aria-hidden="true" />
              <button
                type="button"
                title="Anexar arquivo"
                aria-label="Anexar arquivo"
                onClick={() => onToast('Envio de arquivos em breve.')}
              >
                <Paperclip size={17} />
              </button>
              <button
                type="button"
                title="Emoji"
                aria-label="Inserir emoji"
                onClick={() => setText((current) => `${current} 😊`)}
              >
                <Smile size={17} />
              </button>
              <button
                type="button"
                title="Mencionar alguém"
                aria-label="Mencionar alguém"
                onClick={() => {
                  const textarea = textareaRef.current;
                  const caret = textarea?.selectionStart ?? text.length;
                  const nextText = `${text.slice(0, caret)}@${text.slice(caret)}`;
                  setText(nextText);
                  setMentionQuery('');
                  onTyping(true);
                  window.requestAnimationFrame(() => {
                    textareaRef.current?.focus();
                    textareaRef.current?.setSelectionRange(caret + 1, caret + 1);
                  });
                }}
              >
                <AtSign size={16} />
              </button>
            </div>
            <div className="composer-submit-area">
              <span className="send-hint">Enter para enviar</span>
              <button
                className="send-button"
                type="button"
                onClick={() => void onSend()}
                disabled={!text.trim()}
                aria-label="Enviar mensagem"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        )}
        {compact && (
          <button
            className="thread-composer-send"
            type="button"
            aria-label="Enviar resposta"
            disabled={!text.trim()}
            onClick={() => void onSend()}
          >
            {text.trim() ? <Send size={16} /> : <MessageCircle size={16} />}
          </button>
        )}
      </div>
      {!compact && showFormattingHelp && (
        <p className="formatting-help" role="status">
          Formate com **negrito**, *itálico*, `código` ou listas iniciadas por -.
        </p>
      )}
      {!compact && (
        <p className="composer-note">
          Compartilhe uma ideia, uma atualização ou só diga oi.{' '}
          <span>Shift + Enter para pular linha</span>
        </p>
      )}
      {!compact && typingLabel && (
        <p className="typing-indicator" role="status" aria-live="polite">
          {typingLabel}
        </p>
      )}
    </div>
  );
}
