import {
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type Dispatch,
  type DragEvent,
  type SetStateAction,
} from 'react';
import { AtSign, MessageCircle, Paperclip, Send, Smile } from 'lucide-react';
import { MAX_ATTACHMENT_SIZE_BYTES, MAX_ATTACHMENTS_PER_MESSAGE } from '@rocket/shared';
import type { MessageMentionOption } from './MessageContent';

const acceptedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
]);

const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

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
  onSend: (files: File[], onProgress: (file: File, percentage: number) => void) => Promise<void>;
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
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [isSending, setIsSending] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const addFiles = (selectedFiles: File[]) => {
    if (compact || isSending) return;
    const valid: File[] = [];
    let rejected = false;
    for (const file of selectedFiles) {
      const extension = file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase();
      const validTextName =
        file.type !== 'text/plain' || ['.txt', '.md', '.log'].includes(extension ?? '');
      if (
        !acceptedMimeTypes.has(file.type) ||
        !validTextName ||
        file.size < 1 ||
        file.size > MAX_ATTACHMENT_SIZE_BYTES
      ) {
        rejected = true;
      } else {
        valid.push(file);
      }
    }
    const unique = valid.filter(
      (file, index) =>
        valid.findIndex((candidate) => fileKey(candidate) === fileKey(file)) === index &&
        !files.some((candidate) => fileKey(candidate) === fileKey(file)),
    );
    if (files.length + unique.length > MAX_ATTACHMENTS_PER_MESSAGE) rejected = true;
    setFiles((current) => [...current, ...unique].slice(0, MAX_ATTACHMENTS_PER_MESSAGE));
    if (rejected)
      onToast(
        'Alguns arquivos foram ignorados. Use tipos permitidos, até 25 MiB e no máximo 10 anexos.',
      );
  };

  const submit = async () => {
    if (isSending || (!text.trim() && !files.length)) return;
    setIsSending(true);
    setProgress({});
    try {
      await onSend(files, (file, percentage) => {
        setProgress((current) => ({ ...current, [fileKey(file)]: percentage }));
      });
      setFiles([]);
      setText('');
    } catch {
      // Mantém os arquivos selecionados para permitir uma nova tentativa.
    } finally {
      setIsSending(false);
    }
  };

  const pasteFiles = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedFiles = Array.from(event.clipboardData.files);
    if (pastedFiles.length) {
      event.preventDefault();
      addFiles(pastedFiles);
    }
  };

  const dropFiles = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDropTarget(false);
    addFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <div
      className={`${compact ? 'thread-composer-wrap' : 'composer-wrap'} ${isDropTarget ? 'composer-drop-target' : ''}`}
      onDragOver={(event) => {
        if (compact) return;
        event.preventDefault();
        setIsDropTarget(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setIsDropTarget(false);
      }}
      onDrop={dropFiles}
    >
      <div className={compact ? 'thread-composer' : 'composer'}>
        {!compact && files.length > 0 && (
          <ul className="composer-attachments" aria-label="Arquivos anexados">
            {files.map((file) => {
              const value = progress[fileKey(file)];
              return (
                <li key={fileKey(file)}>
                  <span className="composer-file-name">{file.name}</span>
                  <span className="composer-file-size">
                    {file.size >= 1024 * 1024
                      ? `${(file.size / (1024 * 1024)).toFixed(1)} MiB`
                      : `${Math.max(1, Math.round(file.size / 1024))} KiB`}
                  </span>
                  {value !== undefined && (
                    <progress aria-label={`Envio de ${file.name}`} max={100} value={value} />
                  )}
                  <button
                    type="button"
                    aria-label={`Remover ${file.name}`}
                    disabled={isSending}
                    onClick={() =>
                      setFiles((current) =>
                        current.filter((item) => fileKey(item) !== fileKey(file)),
                      )
                    }
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <textarea
          ref={textareaRef}
          rows={compact ? 2 : 1}
          value={text}
          disabled={isSending}
          onChange={(event) => {
            const nextText = event.target.value;
            setText(nextText);
            setMentionQuery(getMentionQuery(nextText, event.target.selectionStart));
            setActiveMentionIndex(0);
            onTyping(Boolean(nextText.trim()));
          }}
          onPaste={pasteFiles}
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
              void submit();
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
                disabled={isSending}
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
                disabled={isSending}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip size={17} />
              </button>
              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,.txt,.md,.log"
                aria-label="Selecionar arquivos para anexar"
                disabled={isSending}
                onChange={(event) => {
                  addFiles(Array.from(event.target.files ?? []));
                  event.target.value = '';
                }}
              />
              <button
                type="button"
                title="Emoji"
                aria-label="Inserir emoji"
                disabled={isSending}
                onClick={() => setText((current) => `${current} 😊`)}
              >
                <Smile size={17} />
              </button>
              <button
                type="button"
                title="Mencionar alguém"
                aria-label="Mencionar alguém"
                disabled={isSending}
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
                onClick={() => void submit()}
                disabled={isSending || (!text.trim() && files.length === 0)}
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
            onClick={() => void submit()}
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
