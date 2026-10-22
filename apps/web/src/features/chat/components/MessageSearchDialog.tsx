import { useRef, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react';
import { ArrowDown, ChevronRight, Search, Sparkles, X } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import type { Conversation, Person } from '../../../types';

export function MessageSearchDialog({
  open,
  query,
  setQuery,
  conversations,
  getOtherPerson,
  onOpenConversation,
  onClose,
}: {
  open: boolean;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  conversations: Conversation[];
  getOtherPerson: (conversation: Conversation) => Person;
  onOpenConversation: (conversation: Conversation) => void;
  onClose: () => void;
}) {
  const resultsRef = useRef<HTMLDivElement>(null);
  if (!open) return null;

  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const channels = conversations.filter(
    (conversation) =>
      conversation.kind === 'CHANNEL' &&
      conversation.name.toLocaleLowerCase('pt-BR').includes(normalizedQuery),
  );
  const people = conversations.filter(
    (conversation) =>
      conversation.kind !== 'CHANNEL' &&
      conversation.name.toLocaleLowerCase('pt-BR').includes(normalizedQuery),
  );

  const handleResultKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = Array.from(
      resultsRef.current?.querySelectorAll<HTMLButtonElement>('.search-result') ?? [],
    );
    const currentIndex = buttons.indexOf(event.currentTarget);
    const nextIndex =
      (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  };

  const openResult = (conversation: Conversation) => {
    onOpenConversation(conversation);
    setQuery('');
    onClose();
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="search-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="search-title" className="sr-only">
          Buscar em tudo
        </h2>
        <div className="search-modal-input">
          <Search size={19} aria-hidden="true" />
          <input
            id="global-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                resultsRef.current?.querySelector<HTMLButtonElement>('.search-result')?.focus();
              }
            }}
            placeholder="Buscar canais e pessoas"
            aria-label="Buscar canais e pessoas"
          />
          <kbd>ESC</kbd>
          <button aria-label="Fechar busca" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="search-modal-content" ref={resultsRef}>
          <span className="eyebrow">{normalizedQuery ? 'RESULTADOS' : 'ACESSO RÁPIDO'}</span>
          {normalizedQuery ? (
            <>
              <div className="search-result-label">CANAIS</div>
              {channels.map((conversation) => (
                <button
                  type="button"
                  className="search-result"
                  key={conversation.id}
                  onClick={() => openResult(conversation)}
                  onKeyDown={handleResultKeyDown}
                >
                  <Search size={15} aria-hidden="true" />
                  <span>{conversation.name}</span>
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              ))}
              <div className="search-result-label">PESSOAS</div>
              {people.map((conversation) => (
                <button
                  type="button"
                  className="search-result"
                  key={conversation.id}
                  onClick={() => openResult(conversation)}
                  onKeyDown={handleResultKeyDown}
                >
                  <Avatar person={getOtherPerson(conversation)} size="small" />
                  <span>{conversation.name}</span>
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              ))}
              {!channels.length && !people.length && (
                <p className="empty-list">Nenhum canal ou pessoa encontrado.</p>
              )}
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
            <Sparkles size={13} aria-hidden="true" /> Dica rápida
          </span>
          <span>
            Use <kbd>Ctrl K</kbd> para buscar de qualquer lugar
          </span>
        </div>
      </section>
    </div>
  );
}
