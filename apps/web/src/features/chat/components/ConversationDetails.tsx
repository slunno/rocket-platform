import { ChevronRight, Users, X } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { SidePanel } from '../../../layout/SidePanel';
import type { Conversation } from '../../../types';

export function ConversationDetails({
  active,
  isChannel,
  open,
  onClose,
  onToast,
  meId,
}: {
  active: Conversation;
  isChannel: boolean;
  open: boolean;
  onClose: () => void;
  onToast: (message: string) => void;
  meId: string;
}) {
  return (
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
        {active.description ?? `Conversa direta com ${active.name}.`}
      </p>
      <button className="details-edit" onClick={() => onToast('Edição dos detalhes em breve.')}>
        <span>Descrição</span>
        <span>Editar</span>
      </button>
      <div className="details-divider" />
      <button className="details-members" onClick={() => onToast('Lista de pessoas em breve.')}>
        <span>
          <Users size={17} /> Pessoas
        </span>
        <span>
          {active.members.length}
          <ChevronRight size={15} />
        </span>
      </button>
      <div className="member-list">
        {active.members.slice(0, 6).map((person) => (
          <div className="member-row" key={person.id}>
            <span className="avatar-wrap">
              <Avatar person={person} size="small" />
              <span className={`status-dot status-${person.status}`} />
            </span>
            <span>{person.name}</span>
            {person.id === meId && <small>você</small>}
          </div>
        ))}
      </div>
    </SidePanel>
  );
}
