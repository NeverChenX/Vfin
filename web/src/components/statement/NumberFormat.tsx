import { formatNumber } from '@/lib/finance/format';
import type { RawUnit } from '@/types/finance';

interface Props {
  value: number | null;
  rawUnit: RawUnit;
  displayUnit: RawUnit;
  digits?: number;
  className?: string;
}

export function NumberFormat({ value, rawUnit, displayUnit, digits = 2, className = '' }: Props) {
  const text = formatNumber(value, { rawUnit, displayUnit, maximumFractionDigits: digits });
  const isNegative = text.startsWith('(');
  const isDash = text === '—';
  return (
    <span
      className={[
        'num',
        isNegative
          ? 'text-[var(--color-down)]'
          : isDash
            ? 'text-[var(--color-text-disabled)]'
            : 'text-[var(--color-text-primary)]',
        className,
      ].join(' ')}
    >
      {text}
    </span>
  );
}
