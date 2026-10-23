import { useEffect, useState, type FormEvent } from 'react';
import { BellOff, LogOut, Pencil, Pin, Plus, UserRoundMinus, Users, X } from 'lucide-react';
import type { RemoteWorkspaceMember } from '../../../api';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { SidePanel } from '../../../layout/SidePanel';
import type { Conversation } from '../../../types';

export function ConversationDetails({
  active,
  isChannel,
  open,
  onClose,
  meId,
  availableMembers,
  onTogglePreference,
  onUpdateGroup,
  onAddMember,
  onRemoveMember,
}: {
  active: Conversation;
  isChannel: boolean;
  open: boolean;
  onClose: () => void;
  meId: string;
  availableMembers: RemoteWorkspaceMember[];
  onTogglePreference: (preference: 'muted' | 'pinned') => Promise<void>;
  onUpdateGroup: (
    conversationId: string,
    name: string,
    description: string,
    avatarUrl: string | null,
  ) => Promise<void>;
  onAddMember: (conversationId: string, userId: string) => Promise<void>;
  onRemoveMember: (conversationId: string, userId: string) => Promise<void>;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [name, setName] = useState(active.name);
  const [description, setDescription] = useState(active.description ?? '');
  const [avatarUrl, setAvatarUrl] = useState(active.avatarUrl ?? '');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isGroup = active.kind === 'GROUP';
  const canManage = isGroup && (!active.createdById || active.createdById === meId);

  useEffect(() => {
    setName(active.name);
    setDescription(active.description ?? '');
    setAvatarUrl(active.avatarUrl ?? '');
  }, [active.avatarUrl, active.description, active.id, active.name]);

  const editGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onUpdateGroup(active.id, name.trim(), description, avatarUrl.trim() || null);
      setEditOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível atualizar o grupo.');
    } finally {
      setBusy(false);
    }
  };

  const addGroupMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedUserId) return;
    setBusy(true);
    setError('');
    try {
      await onAddMember(active.id, selectedUserId);
      setAddOpen(false);
      setSelectedUserId('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível adicionar a pessoa.');
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (userId: string) => {
    setBusy(true);
    setError('');
    try {
      await onRemoveMember(active.id, userId);
      if (userId === meId) setLeaveOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível atualizar o grupo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SidePanel open={open} label="Detalhes da conversa">
        <div className="details-header">
          <div>
            <span className="eyebrow">DETALHES</span>
            <h2>{isChannel ? `# ${active.name}` : active.name}</h2>
          </div>
          <button className="icon-button" aria-label="Fechar detalhes" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p className="details-description">
          {active.description ??
            (isGroup ? 'Conversa em grupo.' : `Conversa direta com ${active.name}.`)}
        </p>
        {!isChannel && (
          <div className="conversation-preference-actions">
            <button type="button" onClick={() => void onTogglePreference('muted')}>
              <BellOff size={15} aria-hidden="true" />
              {active.muted ? 'Ativar notificações' : 'Silenciar conversa'}
            </button>
            <button type="button" onClick={() => void onTogglePreference('pinned')}>
              <Pin size={15} aria-hidden="true" />
              {active.pinned ? 'Desafixar conversa' : 'Fixar conversa'}
            </button>
          </div>
        )}
        {isGroup && canManage && (
          <>
            <button
              className="details-edit"
              onClick={() => {
                setError('');
                setEditOpen(true);
              }}
            >
              <span>Nome e descrição</span>
              <span>
                Editar <Pencil size={13} aria-hidden="true" />
              </span>
            </button>
            <div className="details-divider" />
          </>
        )}
        <div className="conversation-member-heading">
          <span>
            <Users size={15} aria-hidden="true" /> Pessoas (
            {active.memberCount ?? active.members.length})
          </span>
          {isGroup && canManage && (
            <button
              type="button"
              onClick={() => {
                setError('');
                setAddOpen(true);
              }}
            >
              <Plus size={14} aria-hidden="true" /> Adicionar
            </button>
          )}
        </div>
        <div className="member-list">
          {active.members.map((person) => (
            <div className="conversation-member-row" key={person.id}>
              <div className="member-row">
                <span className="avatar-wrap">
                  <Avatar person={person} size="small" />
                  <span className={`status-dot status-${person.status}`} />
                </span>
                <span>{person.name}</span>
                {person.id === meId && <small>você</small>}
                {person.id === active.createdById && <small>criador</small>}
              </div>
              {isGroup && canManage && person.id !== meId && (
                <button
                  type="button"
                  className="conversation-member-action"
                  aria-label={`Remover ${person.name} do grupo`}
                  title={`Remover ${person.name}`}
                  onClick={() => void removeMember(person.id)}
                  disabled={busy}
                >
                  <UserRoundMinus size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>
        {isGroup && (
          <button
            className="conversation-member-action leave-group"
            onClick={() => setLeaveOpen(true)}
          >
            <LogOut size={15} aria-hidden="true" /> Sair do grupo
          </button>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </SidePanel>

      <Dialog open={editOpen} title="Editar grupo" onClose={() => !busy && setEditOpen(false)}>
        <form className="organization-form" onSubmit={editGroup}>
          <label>
            Nome do grupo
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              maxLength={80}
            />
          </label>
          <label>
            Foto do grupo (URL HTTPS)
            <input
              type="url"
              pattern="https://.*"
              value={avatarUrl}
              onChange={(event) => setAvatarUrl(event.target.value)}
              placeholder="https://exemplo.com/foto.png"
            />
          </label>
          <label>
            Descrição
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={300}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="organization-actions">
            <Button type="button" onClick={() => setEditOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
              {busy ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={addOpen} title="Adicionar pessoas" onClose={() => !busy && setAddOpen(false)}>
        <form className="organization-form" onSubmit={addGroupMember}>
          <p className="dialog-description">
            Escolha uma pessoa deste espaço para incluir no grupo.
          </p>
          <label>
            Pessoa
            <select
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              required
            >
              <option value="">Selecione uma pessoa</option>
              {availableMembers.map((member) => (
                <option value={member.id} key={member.id}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="organization-actions">
            <Button type="button" onClick={() => setAddOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={busy || !selectedUserId}>
              {busy ? 'Adicionando…' : 'Adicionar'}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={leaveOpen} title="Sair do grupo?" onClose={() => !busy && setLeaveOpen(false)}>
        <p className="dialog-description">
          Você deixará de receber mensagens e o grupo sairá da sua lista.
        </p>
        <div className="organization-actions">
          <Button type="button" onClick={() => setLeaveOpen(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={busy}
            onClick={() => void removeMember(meId)}
          >
            {busy ? 'Saindo…' : 'Sair do grupo'}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
