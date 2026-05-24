'use client';

import type { AnalysisOverlay, DisplayUnit, PeriodGranularity } from '@/types/finance';

interface ResearchToolbarProps {
  currentGranularity: PeriodGranularity;
  currentPeriodsCount: number;
  currentOverlays: ReadonlySet<AnalysisOverlay>;
  currentUnit: DisplayUnit;
  onGranularityChange: (g: PeriodGranularity) => void;
  onPeriodsCountChange: (n: number) => void;
  onOverlayToggle: (o: AnalysisOverlay) => void;
  onUnitChange: (u: DisplayUnit) => void;
}

const GRAN_OPTS: ReadonlyArray<{ value: PeriodGranularity; label: string }> = [
  { value: 'Y', label: '年' },
  { value: 'H', label: '半年' },
  { value: 'Q', label: '季度' },
];

const OVERLAY_OPTS: ReadonlyArray<{ value: AnalysisOverlay; label: string; hint: string }> = [
  { value: 'yoy',    label: '同比', hint: '与上年同期' },
  { value: 'qoq',    label: '环比', hint: '与上一期' },
  { value: 'common', label: '占比', hint: 'IS:占营收 / BS:占资产 / CF:占经营流入' },
];

const UNIT_OPTS: ReadonlyArray<{ value: DisplayUnit; label: string }> = [
  { value: 'auto', label: '自动' },
  { value: 'yi',   label: '亿' },
  { value: 'wan',  label: '万' },
  { value: 'yuan', label: '元' },
];

export function periodCountOpts(g: PeriodGranularity): number[] {
  if (g === 'Y') return [3, 4, 5, 10];
  if (g === 'H') return [2, 4, 6];
  return [4, 6, 8];
}

export function ResearchToolbar({
  currentGranularity,
  currentPeriodsCount,
  currentOverlays,
  currentUnit,
  onGranularityChange,
  onPeriodsCountChange,
  onOverlayToggle,
  onUnitChange,
}: ResearchToolbarProps) {
  return (
    <nav className="border-b border-[var(--color-border-base)] bg-[var(--color-bg-elev1)]">
      <div className="flex flex-wrap items-center gap-2.5 px-4 py-2">
        <Field label="期间">
          <SegGroup
            options={GRAN_OPTS}
            current={currentGranularity}
            onSelect={(v) => onGranularityChange(v as PeriodGranularity)}
          />
        </Field>

        <Field label="期数">
          <SegGroup
            options={periodCountOpts(currentGranularity).map((n) => ({ value: String(n), label: String(n) }))}
            current={String(currentPeriodsCount)}
            onSelect={(v) => onPeriodsCountChange(Number(v))}
          />
        </Field>

        <Field label="对比">
          <div className="flex items-center gap-1">
            {OVERLAY_OPTS.map((o) => {
              const on = currentOverlays.has(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  title={o.hint}
                  onClick={() => onOverlayToggle(o.value)}
                  className={[
                    'rounded px-2.5 py-1 text-[11.5px] transition-colors',
                    on
                      ? 'bg-[var(--color-brand)] text-[var(--color-bg-base)] font-semibold'
                      : 'border border-[var(--color-border-base)] text-[var(--color-text-secondary)] hover:border-[var(--color-brand)] hover:text-[var(--color-text-primary)]',
                  ].join(' ')}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="单位">
          <SegGroup
            options={UNIT_OPTS}
            current={currentUnit}
            onSelect={(v) => onUnitChange(v as DisplayUnit)}
          />
        </Field>
      </div>
    </nav>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-[var(--color-text-tertiary)]">{label}</span>
      {children}
    </div>
  );
}

function SegGroup<T extends string>({
  options,
  current,
  onSelect,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  current: T;
  onSelect: (v: T) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded border border-[var(--color-border-base)]">
      {options.map((o) => {
        const active = o.value === current;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onSelect(o.value)}
            className={[
              'px-2.5 py-1 text-[11.5px] transition-colors',
              active
                ? 'bg-[var(--color-brand)] text-[var(--color-bg-base)] font-semibold'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elev2)] hover:text-[var(--color-text-primary)]',
            ].join(' ')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function defaultPeriodsCount(g: PeriodGranularity): number {
  return g === 'Y' ? 5 : g === 'H' ? 4 : 8;
}
