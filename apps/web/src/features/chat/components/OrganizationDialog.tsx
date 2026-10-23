import { useEffect, useState, type FormEvent } from 'react';
import { Dialog } from '../../../components/ui/Dialog';
import type { ChannelVisibility, CreatedInvite, RemoteWorkspaceMember } from '../../../api';

export type OrganizationDialogState =
  | { mode: 'workspace' }
  | { mode: 'team' }
  | { mode: 'channel'; teamId: string; teamName: string }
  | { mode: 'invite'; teamId?: string; teamName?: string }
  | { mode: 'manage-workspace' }
  | { mode: 'manage-team'; teamId: string; teamName: string; description: string | null }
  | {
      mode: 'manage-channel';
      channelId: string;
      channelName: string;
      description: string | null;
      channelVisibility: ChannelVisibility;
    };

type OrganizationDialogProps = {
  dialog: OrganizationDialogState | null;
  workspaceName: string;
  workspaceMembers: RemoteWorkspaceMember[];
  teamMembers: RemoteWorkspaceMember[];
  channelMembers: RemoteWorkspaceMember[];
  availableMembers: RemoteWorkspaceMember[];
  onClose: () => void;
  onCreateWorkspace: (name: string) => Promise<void>;
  onCreateTeam: (name: string, description: string) => Promise<void>;
  onCreateChannel: (
    teamId: string,
    name: string,
    description: string,
    visibility: ChannelVisibility,
  ) => Promise<void>;
  onCreateInvite: (
    email: string,
    role: 'MEMBER' | 'GUEST',
    teamId?: string,
  ) => Promise<CreatedInvite>;
  onAddTeamMember: (teamId: string, userId: string) => Promise<void>;
  onRemoveTeamMember: (teamId: string, userId: string) => Promise<void>;
  onRemoveWorkspaceMember: (userId: string) => Promise<void>;
  onUpdateWorkspaceMember: (userId: string, role: 'ADMIN' | 'MEMBER' | 'GUEST') => Promise<void>;
  onAddChannelMember: (channelId: string, userId: string) => Promise<void>;
  onRemoveChannelMember: (channelId: string, userId: string) => Promise<void>;
  onUpdateTeam: (teamId: string, name: string, description: string) => Promise<void>;
  onArchiveTeam: (teamId: string) => Promise<void>;
  onUpdateChannel: (
    channelId: string,
    name: string,
    description: string,
    visibility: ChannelVisibility,
  ) => Promise<void>;
  onArchiveChannel: (channelId: string) => Promise<void>;
  onInviteToTeam: (teamId: string) => void;
};

export function OrganizationDialog({
  dialog,
  workspaceName,
  workspaceMembers,
  teamMembers,
  channelMembers,
  availableMembers,
  onClose,
  onCreateWorkspace,
  onCreateTeam,
  onCreateChannel,
  onCreateInvite,
  onAddTeamMember,
  onRemoveTeamMember,
  onRemoveWorkspaceMember,
  onUpdateWorkspaceMember,
  onAddChannelMember,
  onRemoveChannelMember,
  onUpdateTeam,
  onArchiveTeam,
  onUpdateChannel,
  onArchiveChannel,
  onInviteToTeam,
}: OrganizationDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'MEMBER' | 'GUEST'>('MEMBER');
  const [visibility, setVisibility] = useState<ChannelVisibility>('PUBLIC');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [invite, setInvite] = useState<CreatedInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);

  useEffect(() => {
    setName(
      dialog?.mode === 'manage-team' || dialog?.mode === 'manage-channel'
        ? dialog.mode === 'manage-team'
          ? dialog.teamName
          : dialog.channelName
        : '',
    );
    setDescription(
      dialog?.mode === 'manage-team' || dialog?.mode === 'manage-channel'
        ? (dialog.description ?? '')
        : '',
    );
    setEmail('');
    setRole('MEMBER');
    setVisibility(dialog?.mode === 'manage-channel' ? dialog.channelVisibility : 'PUBLIC');
    setSelectedUserId('');
    setInvite(null);
    setError('');
    setConfirmArchive(false);
  }, [dialog]);

  if (!dialog) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (dialog.mode === 'workspace') await onCreateWorkspace(name);
      else if (dialog.mode === 'team') await onCreateTeam(name, description);
      else if (dialog.mode === 'channel') {
        await onCreateChannel(dialog.teamId, name, description, visibility);
      } else if (dialog.mode === 'invite') {
        setInvite(await onCreateInvite(email, role, dialog.teamId));
      } else if (dialog.mode === 'manage-team') {
        await onUpdateTeam(dialog.teamId, name, description);
      } else if (dialog.mode === 'manage-channel') {
        await onUpdateChannel(dialog.channelId, name, description, visibility);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível concluir a ação.');
    } finally {
      setBusy(false);
    }
  };

  const addMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedUserId || (dialog.mode !== 'manage-team' && dialog.mode !== 'manage-channel'))
      return;
    setBusy(true);
    setError('');
    try {
      if (dialog.mode === 'manage-team') await onAddTeamMember(dialog.teamId, selectedUserId);
      else await onAddChannelMember(dialog.channelId, selectedUserId);
      setSelectedUserId('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível adicionar a pessoa.');
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (dialog.mode !== 'manage-team' && dialog.mode !== 'manage-channel') return;
    setBusy(true);
    setError('');
    try {
      if (dialog.mode === 'manage-team') await onArchiveTeam(dialog.teamId);
      else await onArchiveChannel(dialog.channelId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível arquivar.');
    } finally {
      setBusy(false);
      setConfirmArchive(false);
    }
  };

  const title = dialogTitle(dialog, workspaceName);
  const managingWorkspace = dialog.mode === 'manage-workspace';
  const managingTeam = dialog.mode === 'manage-team';
  const managingChannel = dialog.mode === 'manage-channel';

  return (
    <Dialog open title={title} onClose={onClose}>
      {managingWorkspace ? (
        <div className="organization-manager">
          <p className="dialog-description">Pessoas com acesso ao espaço de trabalho.</p>
          <WorkspaceMemberList
            members={workspaceMembers}
            busy={busy}
            onUpdate={(userId, role) =>
              void runMemberAction(() => onUpdateWorkspaceMember(userId, role), setBusy, setError)
            }
            onRemove={(userId) =>
              void runMemberAction(() => onRemoveWorkspaceMember(userId), setBusy, setError)
            }
          />
          {error && (
            <p role="alert" className="auth-feedback auth-error">
              {error}
            </p>
          )}
        </div>
      ) : managingTeam || managingChannel ? (
        <div className="organization-manager">
          <form className="organization-form" onSubmit={(event) => void submit(event)}>
            <label>
              Nome
              <input
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Descrição
              <textarea
                maxLength={300}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            {managingChannel && (
              <label>
                Visibilidade
                <select
                  value={visibility}
                  onChange={(event) => setVisibility(event.target.value as ChannelVisibility)}
                >
                  <option value="PUBLIC">Público · membros da equipe podem entrar</option>
                  <option value="PRIVATE">Privado · acesso por convite</option>
                </select>
              </label>
            )}
            <button className="button button-primary" type="submit" disabled={busy}>
              {busy ? 'Aguarde…' : 'Salvar alterações'}
            </button>
          </form>

          {managingTeam && (
            <>
              <p className="dialog-description">Membros com acesso à equipe.</p>
              <form
                className="organization-form organization-add-member"
                onSubmit={(event) => void addMember(event)}
              >
                <label>
                  Adicionar pessoa do espaço
                  <select
                    value={selectedUserId}
                    onChange={(event) => setSelectedUserId(event.target.value)}
                  >
                    <option value="">Selecione uma pessoa</option>
                    {availableMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName} · {member.email ?? member.username}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button button-secondary"
                  type="submit"
                  disabled={busy || !selectedUserId}
                >
                  Adicionar à equipe
                </button>
              </form>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => onInviteToTeam(dialog.teamId)}
              >
                Convidar por e-mail
              </button>
              <MemberList
                members={teamMembers}
                actionLabel="Remover da equipe"
                busy={busy}
                onRemove={(userId) =>
                  void runMemberAction(
                    () => onRemoveTeamMember(dialog.teamId, userId),
                    setBusy,
                    setError,
                  )
                }
              />
            </>
          )}

          {managingChannel && (
            <>
              <p className="dialog-description">
                {dialog.channelVisibility === 'PRIVATE'
                  ? 'Somente as pessoas desta lista podem ver as mensagens do canal privado.'
                  : 'Os membros da equipe têm acesso a este canal público.'}
              </p>
              {dialog.channelVisibility === 'PRIVATE' && (
                <form
                  className="organization-form organization-add-member"
                  onSubmit={(event) => void addMember(event)}
                >
                  <label>
                    Adicionar pessoa do espaço
                    <select
                      value={selectedUserId}
                      onChange={(event) => setSelectedUserId(event.target.value)}
                    >
                      <option value="">Selecione uma pessoa</option>
                      {availableMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.displayName} · {member.email ?? member.username}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button button-secondary"
                    type="submit"
                    disabled={busy || !selectedUserId}
                  >
                    Adicionar ao canal
                  </button>
                </form>
              )}
              <MemberList
                members={channelMembers}
                actionLabel="Remover do canal"
                busy={busy}
                onRemove={
                  dialog.channelVisibility === 'PRIVATE'
                    ? (userId) =>
                        void runMemberAction(
                          () => onRemoveChannelMember(dialog.channelId, userId),
                          setBusy,
                          setError,
                        )
                    : undefined
                }
              />
            </>
          )}

          {confirmArchive ? (
            <div className="archive-confirmation" role="group" aria-label="Confirmar arquivamento">
              <p>Esta equipe e seus canais deixarão de aparecer para todos. Deseja continuar?</p>
              <button
                className="button button-danger"
                type="button"
                disabled={busy}
                onClick={() => void archive()}
              >
                Confirmar arquivamento
              </button>
              <button
                className="button button-secondary"
                type="button"
                disabled={busy}
                onClick={() => setConfirmArchive(false)}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              className="button button-danger"
              type="button"
              disabled={busy}
              onClick={() => setConfirmArchive(true)}
            >
              Arquivar {managingTeam ? 'equipe' : 'canal'}
            </button>
          )}
          {error && (
            <p role="alert" className="auth-feedback auth-error">
              {error}
            </p>
          )}
        </div>
      ) : dialog.mode === 'invite' && invite ? (
        <div className="organization-manager">
          <p className="auth-feedback auth-success" role="status">
            Convite criado para {invite.email}. O link expira em{' '}
            {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(
              new Date(invite.expiresAt),
            )}
            .
          </p>
          <label className="invite-link-label">
            Link do convite
            <input
              readOnly
              value={invite.inviteUrl}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <button
            className="button button-primary"
            type="button"
            onClick={() => void navigator.clipboard?.writeText(invite.inviteUrl)}
          >
            Copiar link
          </button>
          <button className="button button-secondary" type="button" onClick={onClose}>
            Concluir
          </button>
        </div>
      ) : (
        <form className="organization-form" onSubmit={(event) => void submit(event)}>
          {dialog.mode === 'workspace' && (
            <label>
              Nome do espaço de trabalho
              <input
                autoFocus
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          )}
          {(dialog.mode === 'team' || dialog.mode === 'channel') && (
            <label>
              Nome
              <input
                autoFocus
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          )}
          {(dialog.mode === 'team' || dialog.mode === 'channel') && (
            <label>
              Descrição
              <textarea
                maxLength={300}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          )}
          {dialog.mode === 'channel' && (
            <label>
              Visibilidade
              <select
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as ChannelVisibility)}
              >
                <option value="PUBLIC">Público · membros da equipe podem entrar</option>
                <option value="PRIVATE">Privado · acesso por convite</option>
              </select>
            </label>
          )}
          {dialog.mode === 'invite' && (
            <>
              <label>
                E-mail da pessoa
                <input
                  autoFocus
                  required
                  type="email"
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label>
                Tipo de acesso
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as 'MEMBER' | 'GUEST')}
                >
                  <option value="MEMBER">Membro</option>
                  <option value="GUEST">Convidado</option>
                </select>
              </label>
            </>
          )}
          {error && (
            <p role="alert" className="auth-feedback auth-error">
              {error}
            </p>
          )}
          <div className="organization-actions">
            <button className="button button-secondary" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="button button-primary" type="submit" disabled={busy}>
              {busy ? 'Aguarde…' : submitLabel(dialog.mode)}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function MemberList({
  members,
  actionLabel,
  onRemove,
  busy,
  disabledUserIds,
}: {
  members: RemoteWorkspaceMember[];
  actionLabel: string;
  onRemove?: (userId: string) => void;
  busy: boolean;
  disabledUserIds?: Set<string>;
}) {
  if (!members.length) return <p className="empty-list">Nenhuma pessoa nesta lista.</p>;
  return (
    <ul className="organization-member-list">
      {members.map((member) => (
        <li key={member.id}>
          <span>
            <strong>{member.displayName}</strong>
            <small>{member.email ?? member.username}</small>
          </span>
          {onRemove && !disabledUserIds?.has(member.id) && (
            <button
              className="button button-quiet"
              type="button"
              disabled={busy}
              onClick={() => onRemove(member.id)}
            >
              {actionLabel}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function WorkspaceMemberList({
  members,
  busy,
  onUpdate,
  onRemove,
}: {
  members: RemoteWorkspaceMember[];
  busy: boolean;
  onUpdate: (userId: string, role: 'ADMIN' | 'MEMBER' | 'GUEST') => void;
  onRemove: (userId: string) => void;
}) {
  const [roles, setRoles] = useState<Record<string, 'ADMIN' | 'MEMBER' | 'GUEST'>>({});

  useEffect(() => {
    setRoles(
      Object.fromEntries(
        members.map((member) => [
          member.id,
          member.role === 'OWNER' ? 'ADMIN' : (member.role ?? 'MEMBER'),
        ]),
      ),
    );
  }, [members]);

  if (!members.length) return <p className="empty-list">Nenhuma pessoa neste espaço.</p>;
  return (
    <ul className="organization-member-list workspace-member-list">
      {members.map((member) => {
        const role = roles[member.id] ?? 'MEMBER';
        const owner = member.role === 'OWNER';
        return (
          <li key={member.id}>
            <span>
              <strong>
                {member.displayName}
                {owner ? ' · Proprietário' : ''}
              </strong>
              <small>{member.email ?? member.username}</small>
            </span>
            {!owner && (
              <>
                <select
                  aria-label={`Função de ${member.displayName}`}
                  value={role}
                  onChange={(event) =>
                    setRoles((current) => ({
                      ...current,
                      [member.id]: event.target.value as 'ADMIN' | 'MEMBER' | 'GUEST',
                    }))
                  }
                >
                  <option value="ADMIN">Administrador</option>
                  <option value="MEMBER">Membro</option>
                  <option value="GUEST">Convidado</option>
                </select>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={busy || role === member.role}
                  onClick={() => onUpdate(member.id, role)}
                >
                  Salvar
                </button>
                <button
                  className="button button-quiet"
                  type="button"
                  disabled={busy}
                  onClick={() => onRemove(member.id)}
                >
                  Remover
                </button>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

async function runMemberAction(
  action: () => Promise<void>,
  setBusy: (busy: boolean) => void,
  setError: (error: string) => void,
) {
  setBusy(true);
  setError('');
  try {
    await action();
  } catch (caught) {
    setError(caught instanceof Error ? caught.message : 'Não foi possível alterar os membros.');
  } finally {
    setBusy(false);
  }
}

function dialogTitle(dialog: OrganizationDialogState, workspaceName: string) {
  if (dialog.mode === 'workspace') return 'Criar espaço de trabalho';
  if (dialog.mode === 'team') return 'Criar equipe';
  if (dialog.mode === 'channel') return `Criar canal em ${dialog.teamName}`;
  if (dialog.mode === 'invite') return `Convidar para ${dialog.teamName ?? workspaceName}`;
  if (dialog.mode === 'manage-workspace') return `Gerenciar ${workspaceName}`;
  if (dialog.mode === 'manage-team') return `Gerenciar ${dialog.teamName}`;
  return `Gerenciar canal ${dialog.channelName}`;
}

function submitLabel(mode: OrganizationDialogState['mode']) {
  if (mode === 'workspace') return 'Criar espaço';
  if (mode === 'team') return 'Criar equipe';
  if (mode === 'channel') return 'Criar canal';
  return 'Criar convite';
}
