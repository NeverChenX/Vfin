'use client';

import type { StatementId } from '@/types/finance';

interface TabInfo {
  id: StatementId;
  zhName: string;
  cfaName: string;
}

interface Props {
  currentStatement: StatementId;
  statements: ReadonlyArray<TabInfo>;
  onSelect: (id: StatementId) => void;
}

export function StatementTabs({ currentStatement, statements, onSelect }: Props) {
  return (
    <div className="border-b border-[var(--color-border-base)] bg-[var(--color-bg-elev1)]">
      <div className="flex gap-0 px-4" role="tablist">
        {statements.map((s) => {
          const active = s.id === currentStatement;
          return (
            <button
              key={s.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => onSelect(s.id)}
              className={[
                'flex items-baseline gap-1.5 border-b-2 px-3 py-2 text-[12.5px] transition-colors',
                active
                  ? 'border-[var(--color-brand)] text-[var(--color-text-primary)]'
                  : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
              ].join(' ')}
            >
              <span className={active ? 'font-semibold' : ''}>{s.zhName}</span>
              <span className="font-mono text-[10.5px] text-[var(--color-text-tertiary)]">
                {s.cfaName}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
