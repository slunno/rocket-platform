import type { ReactNode } from 'react';

export function Menu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="menu">
      <summary>{label}</summary>
      <div className="menu-content">{children}</div>
    </details>
  );
}
