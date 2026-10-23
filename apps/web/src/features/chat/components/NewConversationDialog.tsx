import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { RemoteWorkspaceMember } from '../../../api';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import type { Person } from '../../../types';

export function NewConversationDialog({
  open,
  people,
  selfId,
  onClose,
  onStartDirect,
  onCreateGroup,
}: {
  open: boolean;
  people: RemoteWorkspaceMember[];
  selfId: string;
  onClose: () => void;
  onStartDirect: (userId: string) => Promise<void>;
  onCreateGroup: (name: string, userIds: string[], avatarUrl: string | null) => Promise<void>;
}) {
  const [mode, setMode] = useState<'DIRECT' | 'GROUP'>('DIRECT');
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setMode('DIRECT');
      setQuery('');
      setName('');
      setAvatarUrl('');
      setSelected([]);
      setBusy(false);
      setError('');
    }
  }, [open]);

  const matchingPeople = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    return people
      .filter((person) => person.id !== selfId && person.role !== 'GUEST')
      .filter((person) =>
        normalized
          ? `${person.displayName} ${person.username}`
              .toLocaleLowerCase('pt-BR')
              .includes(normalized)
          : true,
      );
  }, [people, query, selfId]);

  const personView = (person: RemoteWorkspaceMember): Person => ({
    id: person.id,
    name: person.displayName,
    username: person.username,
    initials: person.displayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toLocaleUpperCase('pt-BR'),
    status: 'offline',
    avatarUrl: person.avatarUrl,
  });

  const startDirect = async (userId: string) => {
    setBusy(true);
    setError('');
    try {
      await onStartDirect(userId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível abrir a conversa.');
    } finally {
      setBusy(false);
    }
  };

  const createGroup = async () => {
    if (!selected.length) return;
    if (name.trim().length < 2) {
      setError('Informe um nome para o grupo.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onCreateGroup(name.trim(), selected, avatarUrl.trim() || null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível criar o grupo.');
    } finally {
      setBusy(false);
    }
  };

  const togglePerson = (userId: string) => {
    setSelected((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  };

  return (
    <Dialog open={open} title="Novo chat" onClose={onClose}>
      <div className="conversation-mode-tabs" role="group" aria-label="Tipo de conversa">
        <Button
          type="button"
          variant={mode === 'DIRECT' ? 'primary' : 'secondary'}
          aria-pressed={mode === 'DIRECT'}
          onClick={() => setMode('DIRECT')}
        >
          Mensagem direta
        </Button>
        <Button
          type="button"
          variant={mode === 'GROUP' ? 'primary' : 'secondary'}
          aria-pressed={mode === 'GROUP'}
          onClick={() => setMode('GROUP')}
        >
          Grupo
        </Button>
      </div>
      <label className="conversation-person-search">
        <Search size={16} aria-hidden="true" />
        <span className="sr-only">Buscar pessoas</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nome ou usuário"
          autoComplete="off"
        />
      </label>
      {mode === 'GROUP' && (
        <form
          id="new-group-form"
          className="conversation-group-form"
          onSubmit={(event) => {
            event.preventDefault();
            void createGroup();
          }}
        >
          <label className="field" htmlFor="new-group-name">
            Nome do grupo
            <input
              id="new-group-name"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              minLength={2}
              required
              placeholder="Ex.: Coleção primavera"
            />
          </label>
          <label className="field" htmlFor="new-group-avatar">
            Foto do grupo (URL HTTPS)
            <input
              id="new-group-avatar"
              className="input"
              type="url"
              pattern="https://.*"
              value={avatarUrl}
              onChange={(event) => setAvatarUrl(event.target.value)}
              placeholder="https://exemplo.com/foto.png"
            />
          </label>
          <p className="dialog-description">Selecione ao menos uma pessoa além de você.</p>
        </form>
      )}
      <div className="conversation-person-list" aria-live="polite">
        {matchingPeople.map((person) =>
          mode === 'DIRECT' ? (
            <button
              className="conversation-person-option"
              key={person.id}
              type="button"
              disabled={busy}
              onClick={() => void startDirect(person.id)}
            >
              <Avatar person={personView(person)} size="small" />
              <span>
                <strong>{person.displayName}</strong>
                <small>@{person.username}</small>
              </span>
            </button>
          ) : (
            <label className="conversation-person-option" key={person.id}>
              <input
                type="checkbox"
                checked={selected.includes(person.id)}
                onChange={() => togglePerson(person.id)}
                disabled={busy}
              />
              <Avatar person={personView(person)} size="small" />
              <span>
                <strong>{person.displayName}</strong>
                <small>@{person.username}</small>
              </span>
            </label>
          ),
        )}
        {!matchingPeople.length && <p className="empty-list">Nenhuma pessoa encontrada.</p>}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="organization-actions">
        <Button type="button" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        {mode === 'GROUP' && (
          <Button
            type="submit"
            form="new-group-form"
            variant="primary"
            disabled={busy || name.trim().length < 2 || !selected.length}
          >
            {busy ? 'Criando…' : 'Criar grupo'}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
