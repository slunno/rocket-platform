import type { Dispatch, SetStateAction } from 'react';
import { AtSign, Paperclip, Send, Smile } from 'lucide-react';

export function MessageComposer({
  activeName,
  isChannel,
  text,
  setText,
  onSend,
  onToast,
  onTyping,
  typingNames,
}: {
  activeName: string;
  isChannel: boolean;
  text: string;
  setText: Dispatch<SetStateAction<string>>;
  onSend: () => Promise<void>;
  onToast: (message: string) => void;
  onTyping: (isTyping: boolean) => void;
  typingNames: string[];
}) {
  const typingLabel =
    typingNames.length === 1
      ? `${typingNames[0]} está digitando…`
      : typingNames.length > 1
        ? `${typingNames.slice(0, -1).join(', ')} e ${typingNames.at(-1)} estão digitando…`
        : '';
  return (
    <div className="composer-wrap">
      <div className="composer">
        <textarea
          rows={1}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            onTyping(Boolean(event.target.value.trim()));
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void onSend();
            }
          }}
          placeholder={`Mensagem em ${isChannel ? `#${activeName}` : activeName}`}
          aria-label="Escreva uma mensagem"
        />
        <div className="composer-toolbar">
          <div className="composer-tools">
            <button
              type="button"
              title="Formatação"
              aria-label="Formatação"
              onClick={() => onToast('Formatação de texto em breve.')}
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
              onClick={() => setText((current) => `${current}@`)}
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
      </div>
      <p className="composer-note">
        Compartilhe uma ideia, uma atualização ou só diga oi.{' '}
        <span>Shift + Enter para pular linha</span>
      </p>
      {typingLabel && (
        <p className="typing-indicator" role="status" aria-live="polite">
          {typingLabel}
        </p>
      )}
    </div>
  );
}
