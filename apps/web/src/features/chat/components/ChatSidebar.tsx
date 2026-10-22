import {
  AtSign,
  Bell,
  ChevronDown,
  Command,
  Hash,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import type { Conversation, Person } from '../../../types';

type ChatSidebarProps = {
  activeId: string;
  visibleChannels: Conversation[];
  visibleDms: Conversation[];
  sidebarOpen: boolean;
  online: boolean;
  getOtherPerson: (conversation: Conversation) => Person;
  onSearch: () => void;
  onAddChannel: () => void;
  onOpenConversation: (conversation: Conversation) => void;
  onToast: (message: string) => void;
};

export function ChatSidebar({
  activeId,
  visibleChannels,
  visibleDms,
  sidebarOpen,
  online,
  getOtherPerson,
  onSearch,
  onAddChannel,
  onOpenConversation,
  onToast,
}: ChatSidebarProps) {
  return (
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="workspace-picker">
        <div className="workspace-logo">
          <Sparkles size={17} />
        </div>
        <div className="workspace-copy">
          <strong>AKR Brands</strong>
          <span>Espaço de trabalho</span>
        </div>
        <button
          className="icon-button light-icon"
          aria-label="Abrir menu do espaço"
          onClick={() => onToast('Configurações do espaço em breve.')}
        >
          <ChevronDown size={17} />
        </button>
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
          <span className="nav-count">2</span>
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
      <section className="conversation-section" aria-labelledby="channels-heading">
        <div className="section-heading">
          <div>
            <ChevronDown size={14} aria-hidden="true" />
            <span id="channels-heading">CANAIS</span>
          </div>
          <button className="section-add" aria-label="Criar canal" onClick={onAddChannel}>
            <Plus size={16} />
          </button>
        </div>
        <div className="conversation-list">
          {visibleChannels.map((conversation) => (
            <button
              key={conversation.id}
              className={`conversation-row ${activeId === conversation.id ? 'conversation-row-active' : ''}`}
              onClick={() => onOpenConversation(conversation)}
              aria-current={activeId === conversation.id ? 'page' : undefined}
            >
              <Hash size={16} className="row-hash" aria-hidden="true" />
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
          ))}
          {!visibleChannels.length && <p className="empty-list">Nenhum canal encontrado.</p>}
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
            onClick={() => onToast('Escolha alguém da equipe para iniciar uma conversa.')}
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
          {!visibleDms.length && <p className="empty-list">Nenhuma conversa encontrada.</p>}
        </div>
      </section>

      <div className="sidebar-bottom">
        <div className="workspace-status">
          <span className="status-live" aria-hidden="true" />
          <span>{online ? 'Conectado' : 'Modo de demonstração'}</span>
        </div>
        <button
          className="icon-button light-icon"
          onClick={() => onToast('Preferências em breve.')}
          aria-label="Preferências"
        >
          <MoreHorizontal size={18} />
        </button>
      </div>
    </aside>
  );
}
