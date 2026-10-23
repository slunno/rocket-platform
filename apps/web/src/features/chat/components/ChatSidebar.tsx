import { useState } from 'react';
import {
  AtSign,
  Bell,
  ChevronDown,
  ChevronRight,
  Command,
  Hash,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Star,
  UsersRound,
} from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import type { RemoteTeam, RemoteWorkspace, WorkspaceRole } from '../../../api';
import type { Conversation, Person } from '../../../types';

type ChatSidebarProps = {
  activeId: string;
  visibleDms: Conversation[];
  teams: RemoteTeam[];
  workspaces: RemoteWorkspace[];
  workspaceName: string;
  workspaceId: string;
  workspaceRole: WorkspaceRole;
  sidebarOpen: boolean;
  online: boolean;
  getOtherPerson: (conversation: Conversation) => Person;
  onSearch: () => void;
  onCreateTeam: () => void;
  onCreateChannel: (teamId: string) => void;
  onInvite: (teamId?: string) => void;
  onManageTeam: (team: RemoteTeam) => void;
  onManageWorkspace: () => void;
  onManageChannel: (channel: RemoteTeam['channels'][number], team: RemoteTeam) => void;
  onWorkspaceChange: (workspaceId: string) => void;
  onOpenConversation: (conversation: Conversation) => void;
  onJoinTeam: (teamId: string, channelId: string) => void;
  onToggleFavorite: (channelId: string, value: boolean) => void;
  onToggleHidden: (channelId: string, value: boolean) => void;
  onToast: (message: string) => void;
};

export function ChatSidebar({
  activeId,
  visibleDms,
  teams,
  workspaces,
  workspaceName,
  workspaceId,
  workspaceRole,
  sidebarOpen,
  online,
  getOtherPerson,
  onSearch,
  onCreateTeam,
  onCreateChannel,
  onInvite,
  onManageTeam,
  onManageWorkspace,
  onManageChannel,
  onWorkspaceChange,
  onOpenConversation,
  onJoinTeam,
  onToggleFavorite,
  onToggleHidden,
  onToast,
}: ChatSidebarProps) {
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>({});
  const [showHidden, setShowHidden] = useState(false);
  const canManage = workspaceRole === 'OWNER' || workspaceRole === 'ADMIN';
  const hiddenCount = teams.reduce(
    (count, team) => count + team.channels.filter((channel) => channel.isHidden).length,
    0,
  );

  return (
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="workspace-picker">
        <div className="workspace-logo">
          <Sparkles size={17} />
        </div>
        <div className="workspace-copy">
          {workspaces.length > 1 ? (
            <label className="workspace-select-label">
              <span className="sr-only">Espaço de trabalho</span>
              <select
                aria-label="Espaço de trabalho"
                value={workspaceId}
                onChange={(event) => onWorkspaceChange(event.target.value)}
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <strong>{workspaceName}</strong>
          )}
          <span>
            {workspaceRole === 'OWNER'
              ? 'Proprietário'
              : workspaceRole === 'ADMIN'
                ? 'Administrador'
                : workspaceRole === 'GUEST'
                  ? 'Convidado'
                  : 'Membro'}
          </span>
        </div>
        {canManage && (
          <button
            className="icon-button light-icon"
            aria-label="Gerenciar pessoas do espaço"
            onClick={onManageWorkspace}
          >
            <UsersRound size={16} />
          </button>
        )}
        {canManage && (
          <button
            className="icon-button light-icon"
            aria-label="Convidar pessoas para o espaço"
            onClick={() => onInvite()}
          >
            <Plus size={17} />
          </button>
        )}
      </div>

      <button className="search-trigger" onClick={onSearch} aria-label="Buscar em tudo">
        <Search size={16} aria-hidden="true" />
        <span>Buscar em tudo</span>
        <kbd>
          <Command size={11} /> K
        </kbd>
      </button>

      <nav className="sidebar-main-nav" aria-label="Seções de mensagens">
        <button className="nav-row nav-row-selected" type="button" aria-current="page">
          <MessageCircle size={17} aria-hidden="true" />
          <span>Mensagens</span>
        </button>
        <button className="nav-row" type="button" onClick={() => onToast('Não há menções novas.')}>
          <AtSign size={17} aria-hidden="true" />
          <span>Menções</span>
        </button>
        <button
          className="nav-row"
          type="button"
          onClick={() => onToast('Nenhuma notificação nova.')}
        >
          <Bell size={17} aria-hidden="true" />
          <span>Notificações</span>
        </button>
      </nav>

      <div className="sidebar-divider" />
      <section className="conversation-section" aria-labelledby="teams-heading">
        <div className="section-heading">
          <div>
            <ChevronDown size={14} aria-hidden="true" />
            <span id="teams-heading">EQUIPES</span>
          </div>
          {canManage && (
            <button className="section-add" aria-label="Criar equipe" onClick={onCreateTeam}>
              <Plus size={16} />
            </button>
          )}
        </div>
        <div className="team-tree">
          {teams.map((team) => {
            const expanded = expandedTeams[team.id] ?? true;
            const joinedChannels = team.channels
              .filter((channel) => channel.joined && (showHidden || !channel.isHidden))
              .sort((left, right) => Number(right.isFavorite) - Number(left.isFavorite));
            const hiddenChannels = team.channels.filter((channel) => channel.isHidden);
            const publicChannels = team.channels.filter(
              (channel) => !channel.joined && channel.visibility === 'PUBLIC',
            );
            const manageablePrivateChannels = canManage
              ? team.channels.filter(
                  (channel) => !channel.joined && channel.visibility === 'PRIVATE',
                )
              : [];
            return (
              <section className="team-tree-section" key={team.id}>
                <div className="team-tree-heading">
                  <button
                    className="team-expand-button"
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`team-channels-${team.id}`}
                    onClick={() =>
                      setExpandedTeams((current) => ({ ...current, [team.id]: !expanded }))
                    }
                  >
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <UsersRound size={15} aria-hidden="true" />
                    <span>{team.name}</span>
                  </button>
                  <div className="team-tree-actions">
                    {canManage && (
                      <>
                        <button
                          className="section-add"
                          aria-label={`Criar canal na equipe ${team.name}`}
                          onClick={() => onCreateChannel(team.id)}
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          className="section-add"
                          aria-label={`Gerenciar equipe ${team.name}`}
                          onClick={() => onManageTeam(team)}
                        >
                          <MoreHorizontal size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {expanded && (
                  <div className="team-channel-list" id={`team-channels-${team.id}`}>
                    {joinedChannels.map((channel) => (
                      <div className="team-channel-row" key={channel.id}>
                        <button
                          className={`conversation-row ${activeId === channel.id ? 'conversation-row-active' : ''}`}
                          onClick={() =>
                            onOpenConversation({
                              id: channel.id,
                              kind: 'CHANNEL',
                              name: channel.name,
                              description: channel.description ?? undefined,
                              members: [],
                              teamId: team.id,
                              teamName: team.name,
                              visibility: channel.visibility,
                              joined: true,
                              isFavorite: channel.isFavorite,
                              isHidden: channel.isHidden,
                              memberCount: channel.memberCount,
                              unread: channel.unread,
                            })
                          }
                          aria-current={activeId === channel.id ? 'page' : undefined}
                        >
                          {channel.visibility === 'PRIVATE' ? (
                            <LockKeyhole size={14} className="row-hash" aria-hidden="true" />
                          ) : (
                            <Hash size={15} className="row-hash" aria-hidden="true" />
                          )}
                          <span className="conversation-name">{channel.name}</span>
                          {channel.isFavorite && <Star size={12} aria-label="Canal fixado" />}
                          {channel.unread ? (
                            <span
                              className="unread-count"
                              aria-label={`${channel.unread} mensagens não lidas`}
                            >
                              {channel.unread}
                            </span>
                          ) : null}
                        </button>
                        <div className="team-channel-actions">
                          <button
                            className="channel-option-button"
                            aria-label={`${channel.isFavorite ? 'Desafixar' : 'Fixar'} ${channel.name}`}
                            title={channel.isFavorite ? 'Desafixar canal' : 'Fixar canal'}
                            onClick={() => onToggleFavorite(channel.id, !channel.isFavorite)}
                          >
                            <Star size={13} />
                          </button>
                          <button
                            className="channel-option-button"
                            aria-label={`${channel.isHidden ? 'Mostrar' : 'Ocultar'} ${channel.name}`}
                            title={channel.isHidden ? 'Mostrar canal' : 'Ocultar canal'}
                            onClick={() => onToggleHidden(channel.id, !channel.isHidden)}
                          >
                            <MoreHorizontal size={14} />
                          </button>
                          {canManage && (
                            <button
                              className="channel-option-button"
                              aria-label={`Gerenciar canal ${channel.name}`}
                              title="Gerenciar canal"
                              onClick={() => onManageChannel(channel, team)}
                            >
                              <UsersRound size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {publicChannels.map((channel) => (
                      <button
                        className="public-channel-join"
                        type="button"
                        key={channel.id}
                        onClick={() => onJoinTeam(team.id, channel.id)}
                      >
                        <Hash size={14} aria-hidden="true" />
                        <span>{channel.name}</span>
                        <span className="join-label">Entrar</span>
                      </button>
                    ))}
                    {manageablePrivateChannels.map((channel) => (
                      <div className="team-channel-row private-channel-managed" key={channel.id}>
                        <span
                          className="conversation-row"
                          aria-label={`Canal privado ${channel.name}; você não participa`}
                        >
                          <LockKeyhole size={14} className="row-hash" aria-hidden="true" />
                          <span className="conversation-name">{channel.name}</span>
                          <span className="sr-only">Sem acesso às mensagens</span>
                        </span>
                        <button
                          className="channel-option-button"
                          aria-label={`Gerenciar canal ${channel.name}`}
                          onClick={() => onManageChannel(channel, team)}
                        >
                          <UsersRound size={13} />
                        </button>
                      </div>
                    ))}
                    {!joinedChannels.length &&
                      !publicChannels.length &&
                      !manageablePrivateChannels.length && (
                        <p className="empty-list">Nenhum canal visível.</p>
                      )}
                    {hiddenChannels.length > 0 && !showHidden && (
                      <button
                        className="show-hidden-channels"
                        type="button"
                        onClick={() => setShowHidden(true)}
                      >
                        Mostrar {hiddenChannels.length} canal(is) oculto(s)
                      </button>
                    )}
                    {showHidden && hiddenChannels.length > 0 && (
                      <button
                        className="show-hidden-channels"
                        type="button"
                        onClick={() => setShowHidden(false)}
                      >
                        Ocultar canais ocultos
                      </button>
                    )}
                  </div>
                )}
              </section>
            );
          })}
          {!teams.length && <p className="empty-list">Nenhuma equipe disponível.</p>}
          {hiddenCount > 0 && !showHidden && (
            <span className="sr-only">Existem canais ocultos neste espaço.</span>
          )}
        </div>
      </section>

      <section
        className="conversation-section dm-section"
        aria-labelledby="direct-messages-heading"
      >
        <div className="section-heading">
          <div>
            <ChevronDown size={14} aria-hidden="true" />
            <span id="direct-messages-heading">MENSAGENS DIRETAS</span>
          </div>
          <button
            className="section-add"
            aria-label="Nova mensagem direta"
            onClick={() => onToast('A criação de conversas diretas será adicionada no Bloco 5.')}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="conversation-list">
          {visibleDms.map((conversation) => {
            const person = getOtherPerson(conversation);
            return (
              <button
                key={conversation.id}
                className={`conversation-row dm-row ${activeId === conversation.id ? 'conversation-row-active' : ''}`}
                onClick={() => onOpenConversation(conversation)}
                aria-current={activeId === conversation.id ? 'page' : undefined}
              >
                <span className="avatar-wrap">
                  <Avatar person={person} size="small" />
                  <span className={`status-dot status-${person.status}`} aria-hidden="true" />
                  <span className="sr-only">
                    {person.status === 'online'
                      ? 'Disponível'
                      : person.status === 'away'
                        ? 'Ausente'
                        : 'Indisponível'}
                  </span>
                </span>
                <span className="conversation-name">{conversation.name}</span>
                {conversation.unread ? (
                  <span
                    className="unread-count"
                    aria-label={`${conversation.unread} mensagens não lidas`}
                  >
                    {conversation.unread}
                  </span>
                ) : null}
              </button>
            );
          })}
          {!visibleDms.length && <p className="empty-list">Nenhuma conversa direta.</p>}
        </div>
      </section>

      <div className="sidebar-bottom">
        <div className="workspace-status">
          <span className="status-live" aria-hidden="true" />
          <span>{online ? 'Conectado' : 'Desconectado'}</span>
        </div>
        {canManage && (
          <button
            className="icon-button light-icon"
            onClick={() => onInvite()}
            aria-label="Convidar pessoas"
          >
            <MoreHorizontal size={18} />
          </button>
        )}
      </div>
    </aside>
  );
}
