import {
  ChevronLeft,
  Hash,
  Info,
  Menu,
  MoreHorizontal,
  Search,
  UsersRound,
  Video,
} from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { conversationAvatarPerson, type Conversation, type Person } from '../../../types';

export function ConversationHeader({
  active,
  isChannel,
  showDetails,
  showFiles,
  getOtherPerson,
  onMobileMenu,
  onSearch,
  onCall,
  onToggleDetails,
  onShowMessages,
  onShowFiles,
  onMore,
}: {
  active: Conversation;
  isChannel: boolean;
  showDetails: boolean;
  showFiles: boolean;
  getOtherPerson: (conversation: Conversation) => Person;
  onMobileMenu: () => void;
  onSearch: () => void;
  onCall: () => void;
  onToggleDetails: () => void;
  onShowMessages: () => void;
  onShowFiles: () => void;
  onMore: () => void;
}) {
  return (
    <header className="conversation-header">
      <button
        className="mobile-menu icon-button"
        aria-label="Abrir navegação"
        onClick={onMobileMenu}
      >
        <Menu size={20} />
      </button>
      <button className="mobile-back icon-button" aria-label="Voltar" onClick={onMobileMenu}>
        <ChevronLeft size={20} />
      </button>
      <div className="conversation-heading-icon">
        {isChannel ? (
          <Hash size={18} />
        ) : active.kind === 'GROUP' ? (
          active.avatarUrl ? (
            <Avatar person={conversationAvatarPerson(active)} size="small" />
          ) : (
            <span className="conversation-heading-group-icon">
              <UsersRound size={17} aria-hidden="true" />
            </span>
          )
        ) : (
          <Avatar person={getOtherPerson(active)} size="small" />
        )}
      </div>
      <div className="conversation-heading-copy">
        <h1>{active.name}</h1>
        <p>
          {isChannel
            ? active.description
            : active.kind === 'GROUP'
              ? `${active.memberCount ?? active.members.length} pessoas no grupo`
              : (getOtherPerson(active).role ?? 'Conversa direta')}
        </p>
      </div>
      {active.kind !== 'DIRECT' && (
        <div
          className="header-members"
          title={`${active.memberCount ?? active.members.length} pessoas no canal`}
        >
          <div className="mini-avatars">
            {active.members.slice(0, 3).map((person) => (
              <Avatar key={person.id} person={person} size="small" />
            ))}
          </div>
          <span>{active.memberCount ?? active.members.length}</span>
        </div>
      )}
      {isChannel && (
        <div className="conversation-tabs" role="tablist" aria-label="Conteúdo do canal">
          <button
            type="button"
            role="tab"
            aria-selected={!showFiles}
            aria-controls="channel-content"
            className={!showFiles ? 'conversation-tab conversation-tab-active' : 'conversation-tab'}
            onClick={onShowMessages}
          >
            Publicações
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={showFiles}
            aria-controls="channel-content"
            className={showFiles ? 'conversation-tab conversation-tab-active' : 'conversation-tab'}
            onClick={onShowFiles}
          >
            Arquivos
          </button>
        </div>
      )}
      <div className="header-divider" />
      <button
        className="icon-button header-action"
        aria-label="Buscar nesta conversa"
        onClick={onSearch}
      >
        <Search size={19} />
      </button>
      <button className="icon-button header-action" aria-label="Iniciar chamada" onClick={onCall}>
        <Video size={19} />
      </button>
      <button
        className={`icon-button header-action ${showDetails ? 'action-selected' : ''}`}
        aria-label="Ver detalhes"
        aria-expanded={showDetails}
        onClick={onToggleDetails}
      >
        <Info size={19} />
      </button>
      <button
        className="icon-button header-action more-action"
        aria-label="Mais opções"
        onClick={onMore}
      >
        <MoreHorizontal size={20} />
      </button>
    </header>
  );
}
