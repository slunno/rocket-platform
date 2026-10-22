import type { ReactNode } from 'react';

export function SidePanel({
  open,
  label,
  children,
}: {
  open: boolean;
  label: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <aside className="details-panel" aria-label={label}>
      {children}
    </aside>
  );
}
