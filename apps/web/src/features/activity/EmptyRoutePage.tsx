import { NavLink } from 'react-router-dom';
import { EmptyState } from '../../components/ui/EmptyState';

export function EmptyRoutePage({ title, description }: { title: string; description: string }) {
  return (
    <section className="route-placeholder" aria-labelledby="route-title">
      <EmptyState title={title} description={description} />
      <NavLink className="button button-primary" to="/chat/produto">
        Ir para mensagens
      </NavLink>
    </section>
  );
}
