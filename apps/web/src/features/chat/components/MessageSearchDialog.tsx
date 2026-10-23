import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from 'react';
import { ArrowDown, ChevronRight, Search, Sparkles, X } from 'lucide-react';
import {
  globalSearch,
  type RemoteGlobalSearchResults,
  type RemoteSearchTarget,
} from '../../../api';
import { Avatar } from '../../../components/ui/Avatar';
import type { Conversation, Person } from '../../../types';
import type { RemoteWorkspaceMember } from '../../../api';

const highlightPattern = /(__ROCKET_MATCH_START_8F31__)(.*?)(__ROCKET_MATCH_END_8F31__)/g;

function highlightedSnippet(text: string) {
  const fragments: { text: string; marked: boolean }[] = [];
  let offset = 0;
  for (const match of text.matchAll(highlightPattern)) {
    const start = match.index ?? 0;
    if (start > offset) fragments.push({ text: text.slice(offset, start), marked: false });
    fragments.push({ text: match[2] ?? '', marked: true });
    offset = start + match[0].length;
  }
  if (offset < text.length) fragments.push({ text: text.slice(offset), marked: false });
  if (!fragments.length) return text;
  return fragments.map((fragment, index) =>
    fragment.marked ? (
      <mark key={index}>{fragment.text}</mark>
    ) : (
      <span key={index}>{fragment.text}</span>
    ),
  );
}

function toPerson(person: RemoteGlobalSearchResults['people'][number]): Person {
  const initials = person.displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toLocaleUpperCase('pt-BR');
  const status: Person['status'] =
    person.status === 'DO_NOT_DISTURB'
      ? 'do-not-disturb'
      : (person.status.toLocaleLowerCase('en-US') as Person['status']);
  return {
    id: person.id,
    name: person.displayName,
    username: person.username,
    avatarUrl: person.avatarUrl,
    initials,
    status,
  };
}

function targetLabel(target: RemoteSearchTarget) {
  if (target.type === 'channel')
    return `# ${target.name ?? 'Canal'} · ${target.teamName ?? 'Equipe'}`;
  return target.name ?? 'Conversa';
}

export function MessageSearchDialog({
  open,
  query,
  setQuery,
  conversations,
  getOtherPerson,
  token,
  workspaceId,
  members,
  onOpenConversation,
  onStartDirect,
  onClose,
}: {
  open: boolean;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  conversations: Conversation[];
  getOtherPerson: (conversation: Conversation) => Person;
  token?: string | null;
  workspaceId?: string;
  members?: RemoteWorkspaceMember[];
  onOpenConversation: (conversation: Conversation) => void;
  onStartDirect?: (userId: string) => Promise<void>;
  onClose: () => void;
}) {
  const resultsRef = useRef<HTMLDivElement>(null);
  const [results, setResults] = useState<RemoteGlobalSearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [type, setType] = useState<'all' | 'messages' | 'people' | 'channels' | 'files'>('all');
  const [from, setFrom] = useState('');
  const [targetId, setTargetId] = useState('');
  const [after, setAfter] = useState('');
  const [before, setBefore] = useState('');
  const [hasAttachment, setHasAttachment] = useState<'any' | 'yes' | 'no'>('any');
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const canSearch = Boolean(token && workspaceId && normalizedQuery.length >= 2);

  useEffect(() => {
    if (!open || !canSearch || !token || !workspaceId) {
      setResults(null);
      setLoading(false);
      setError('');
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const timeout = window.setTimeout(() => {
      void globalSearch(
        token,
        {
          q: query.trim(),
          workspaceId,
          type,
          ...(from ? { from } : {}),
          ...(targetId ? { in: targetId } : {}),
          ...(after ? { after: new Date(`${after}T00:00:00.000Z`).toISOString() } : {}),
          ...(before ? { before: new Date(`${before}T23:59:59.999Z`).toISOString() } : {}),
          hasAttachment,
          limit: 5,
        },
        controller.signal,
      )
        .then((nextResults) => setResults(nextResults))
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          setResults(null);
          setError(reason instanceof Error ? reason.message : 'Falha ao buscar no espaço.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 220);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    after,
    before,
    canSearch,
    from,
    hasAttachment,
    open,
    query,
    targetId,
    token,
    type,
    workspaceId,
  ]);

  const localChannels = useMemo(
    () =>
      conversations.filter(
        (conversation) =>
          conversation.kind === 'CHANNEL' &&
          conversation.name.toLocaleLowerCase('pt-BR').includes(normalizedQuery),
      ),
    [conversations, normalizedQuery],
  );
  const localPeople = useMemo(
    () =>
      conversations.filter(
        (conversation) =>
          conversation.kind !== 'CHANNEL' &&
          conversation.name.toLocaleLowerCase('pt-BR').includes(normalizedQuery),
      ),
    [conversations, normalizedQuery],
  );
  if (!open) return null;

  const handleResultKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = Array.from(
      resultsRef.current?.querySelectorAll<HTMLButtonElement>('.search-result') ?? [],
    );
    if (!buttons.length) return;
    const currentIndex = buttons.indexOf(event.currentTarget);
    const nextIndex =
      (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  };

  const finishSearch = () => {
    setQuery('');
    onClose();
  };
  const openConversation = (conversation: Conversation) => {
    onOpenConversation(conversation);
    finishSearch();
  };
  const openTarget = (target: RemoteSearchTarget) => {
    const conversation = conversations.find(({ id }) => id === target.id);
    if (conversation) openConversation(conversation);
    else
      setError(
        'Essa conversa não está disponível na lista atual. Atualize o espaço e tente de novo.',
      );
  };
  const openPerson = async (userId: string) => {
    if (!onStartDirect) return;
    try {
      await onStartDirect(userId);
      finishSearch();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a conversa.');
    }
  };
  const hasRemoteResults = Boolean(
    results &&
    (results.messages.length ||
      results.people.length ||
      results.channels.length ||
      results.files.length),
  );
  const peopleOptions = members?.filter((member) => member.role !== 'GUEST') ?? [];

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
              } else if (event.key === 'Enter') {
                event.preventDefault();
                resultsRef.current?.querySelector<HTMLButtonElement>('.search-result')?.click();
              }
            }}
            placeholder="Buscar mensagens, pessoas, canais e arquivos"
            aria-label="Buscar mensagens, pessoas, canais e arquivos"
          />
          <kbd>ESC</kbd>
          <button aria-label="Fechar busca" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="search-filters" aria-label="Filtros da busca">
          <label>
            Tipo
            <select
              aria-label="Tipo de resultado"
              value={type}
              onChange={(event) => setType(event.target.value as typeof type)}
            >
              <option value="all">Tudo</option>
              <option value="messages">Mensagens</option>
              <option value="people">Pessoas</option>
              <option value="channels">Canais</option>
              <option value="files">Arquivos</option>
            </select>
          </label>
          <label>
            Autor
            <select
              aria-label="Filtrar por pessoa"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            >
              <option value="">Qualquer pessoa</option>
              {peopleOptions.map((member) => (
                <option value={member.id} key={member.id}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Em
            <select
              aria-label="Filtrar por conversa ou canal"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
            >
              <option value="">Qualquer conversa</option>
              {conversations.map((conversation) => (
                <option value={conversation.id} key={conversation.id}>
                  {conversation.kind === 'CHANNEL' ? '# ' : ''}
                  {conversation.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Depois de
            <input
              aria-label="Data inicial"
              type="date"
              value={after}
              onChange={(event) => setAfter(event.target.value)}
            />
          </label>
          <label>
            Antes de
            <input
              aria-label="Data final"
              type="date"
              value={before}
              onChange={(event) => setBefore(event.target.value)}
            />
          </label>
          <label>
            Anexo
            <select
              aria-label="Filtrar por anexo"
              value={hasAttachment}
              onChange={(event) => setHasAttachment(event.target.value as typeof hasAttachment)}
            >
              <option value="any">Qualquer</option>
              <option value="yes">Com anexo</option>
              <option value="no">Sem anexo</option>
            </select>
          </label>
        </div>
        <div className="search-modal-content" ref={resultsRef}>
          <span className="eyebrow">{normalizedQuery ? 'RESULTADOS' : 'ACESSO RÁPIDO'}</span>
          {loading && (
            <p className="empty-list" role="status">
              Buscando no espaço…
            </p>
          )}
          {error && (
            <p className="empty-list" role="alert">
              {error}
            </p>
          )}
          {!normalizedQuery ? (
            <div className="search-hints">
              <span>
                <kbd>
                  <ArrowDown size={11} />
                </kbd>{' '}
                navegar
              </span>
              <span>
                <kbd>Enter</kbd> abrir resultado
              </span>
              <span>
                <kbd>Esc</kbd> fechar
              </span>
            </div>
          ) : results ? (
            <>
              {results.messages.length > 0 && (
                <>
                  <div className="search-result-label">MENSAGENS</div>
                  {results.messages.map((result) => (
                    <button
                      type="button"
                      className="search-result search-result-detail"
                      key={`message-${result.id}`}
                      onClick={() => openTarget(result.target)}
                      onKeyDown={handleResultKeyDown}
                    >
                      <Search size={15} aria-hidden="true" />
                      <span>
                        <strong>{targetLabel(result.target)}</strong>
                        <small>{highlightedSnippet(result.snippet)}</small>
                        <small>
                          {result.author.displayName} ·{' '}
                          {new Date(result.createdAt).toLocaleString('pt-BR')}
                        </small>
                      </span>
                      <ChevronRight size={15} aria-hidden="true" />
                    </button>
                  ))}
                </>
              )}
              {results.people.length > 0 && (
                <>
                  <div className="search-result-label">PESSOAS</div>
                  {results.people.map((person) => (
                    <button
                      type="button"
                      className="search-result"
                      key={`person-${person.id}`}
                      onClick={() => void openPerson(person.id)}
                      onKeyDown={handleResultKeyDown}
                    >
                      <Avatar person={toPerson(person)} size="small" />
                      <span>
                        {person.displayName} <small>@{person.username}</small>
                      </span>
                      <ChevronRight size={15} aria-hidden="true" />
                    </button>
                  ))}
                </>
              )}
              {results.channels.length > 0 && (
                <>
                  <div className="search-result-label">CANAIS</div>
                  {results.channels.map((channel) => (
                    <button
                      type="button"
                      className="search-result"
                      key={`channel-${channel.id}`}
                      onClick={() =>
                        openTarget({
                          type: 'channel',
                          id: channel.id,
                          name: channel.name,
                          teamId: channel.teamId,
                          teamName: channel.teamName,
                        })
                      }
                      onKeyDown={handleResultKeyDown}
                    >
                      <Search size={15} aria-hidden="true" />
                      <span>
                        # {channel.name} <small>{channel.teamName}</small>
                      </span>
                      <ChevronRight size={15} aria-hidden="true" />
                    </button>
                  ))}
                </>
              )}
              {results.files.length > 0 && (
                <>
                  <div className="search-result-label">ARQUIVOS</div>
                  {results.files.map((file) => (
                    <button
                      type="button"
                      className="search-result search-result-detail"
                      key={`file-${file.id}`}
                      onClick={() => openTarget(file.target)}
                      onKeyDown={handleResultKeyDown}
                    >
                      <Search size={15} aria-hidden="true" />
                      <span>
                        <strong>{file.fileName}</strong>
                        <small>{highlightedSnippet(file.snippet)}</small>
                        <small>
                          {targetLabel(file.target)} · {file.authorName}
                        </small>
                      </span>
                      <ChevronRight size={15} aria-hidden="true" />
                    </button>
                  ))}
                </>
              )}
              {!hasRemoteResults && !loading && (
                <p className="empty-list">Nenhum resultado encontrado.</p>
              )}
            </>
          ) : canSearch ? null : (
            <>
              <div className="search-result-label">CANAIS</div>
              {localChannels.map((conversation) => (
                <button
                  type="button"
                  className="search-result"
                  key={conversation.id}
                  onClick={() => openConversation(conversation)}
                  onKeyDown={handleResultKeyDown}
                >
                  <Search size={15} aria-hidden="true" />
                  <span>{conversation.name}</span>
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              ))}
              <div className="search-result-label">PESSOAS</div>
              {localPeople.map((conversation) => (
                <button
                  type="button"
                  className="search-result"
                  key={conversation.id}
                  onClick={() => openConversation(conversation)}
                  onKeyDown={handleResultKeyDown}
                >
                  <Avatar person={getOtherPerson(conversation)} size="small" />
                  <span>{conversation.name}</span>
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              ))}
              {!localChannels.length && !localPeople.length && (
                <p className="empty-list">Digite ao menos dois caracteres para buscar.</p>
              )}
            </>
          )}
        </div>
        <div className="search-modal-footer">
          <span>
            <Sparkles size={13} aria-hidden="true" /> Busca do espaço
          </span>
          <span>
            Use <kbd>Ctrl K</kbd> para buscar de qualquer lugar
          </span>
        </div>
      </section>
    </div>
  );
}
