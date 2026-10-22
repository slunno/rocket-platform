import { useState, type ReactNode } from 'react';

export type TabItem = { id: string; label: string; content: ReactNode };

export function Tabs({ items, label }: { items: TabItem[]; label: string }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? '');
  const active = items.find((item) => item.id === activeId) ?? items[0];
  const move = (current: number, direction: number) => {
    const next = (current + direction + items.length) % items.length;
    setActiveId(items[next].id);
    document.getElementById(`tab-${items[next].id}`)?.focus();
  };

  return (
    <div className="tabs">
      <div className="tab-list" role="tablist" aria-label={label}>
        {items.map((item, index) => (
          <button
            key={item.id}
            id={`tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={active?.id === item.id}
            aria-controls={`panel-${item.id}`}
            tabIndex={active?.id === item.id ? 0 : -1}
            onClick={() => setActiveId(item.id)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') move(index, 1);
              if (event.key === 'ArrowLeft') move(index, -1);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {active && (
        <div id={`panel-${active.id}`} role="tabpanel" aria-labelledby={`tab-${active.id}`}>
          {active.content}
        </div>
      )}
    </div>
  );
}
