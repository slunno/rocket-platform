import { ChevronLeft, Hash, Info, Menu, MoreHorizontal, Search, Video } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import type { Conversation, Person } from '../../../types';

export function ConversationHeader({
  active,
  isChannel,
  showDetails,
  getOtherPerson,
  onMobileMenu,
  onSearch,
  onCall,
  onToggleDetails,
  onMore,
}: {
  active: Conversation;
  isChannel: boolean;
  showDetails: boolean;
  getOtherPerson: (conversation: Conversation) => Person;
  onMobileMenu: () => void;
  onSearch: () => void;
  onCall: () => void;
  onToggleDetails: () => void;
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
        {isChannel ? <Hash size={18} /> : <Avatar person={getOtherPerson(active)} size="small" />}
      </div>
      <div className="conversation-heading-copy">
        <h1>{active.name}</h1>
        <p>{isChannel ? active.description : (getOtherPerson(active).role ?? 'Conversa direta')}</p>
      </div>
      {isChannel && (
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
