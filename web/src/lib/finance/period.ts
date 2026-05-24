import type { PeriodKey, PeriodGranularity, PeriodValues } from '@/types/finance';

export function periodLabel(p: PeriodKey): string {
  if (p.granularity === 'Y') return String(p.year);
  if (p.granularity === 'H') return `${p.year}H${p.index ?? ''}`;
  return `${p.year}Q${p.index ?? ''}`;
}

/**
 * 把 ISO 日期字符串（如 2025-12-31）折成简短期间标签（2025FY / 2025Q1 / 2025H1 / 2025Q3）。
 * 用于 dataAsOf 字段的展示。月份不匹配时原样返回。
 */
export function periodLabelFromDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mo] = m;
  if (mo === '12') return `${y}FY`;
  if (mo === '03') return `${y}Q1`;
  if (mo === '06') return `${y}H1`;
  if (mo === '09') return `${y}Q3`;
  return `${y}-${mo}`;
}

export function periodSortKey(p: PeriodKey): number {
  const offset =
    p.granularity === 'H' ? (p.index ?? 0) * 2 :
    p.granularity === 'Q' ? (p.index ?? 0) :
    4;
  return p.year * 10 + offset;
}

export function comparePeriod(a: PeriodKey, b: PeriodKey): number {
  return periodSortKey(a) - periodSortKey(b);
}

export function filterByGranularity(
  periods: PeriodValues[],
  granularity: PeriodGranularity,
): PeriodValues[] {
  return periods
    .filter((p) => p.period.granularity === granularity)
    .sort((a, b) => comparePeriod(a.period, b.period));
}

export function takeLatest(periods: PeriodValues[], n: number): PeriodValues[] {
  if (n >= periods.length) return periods;
  return periods.slice(periods.length - n);
}

export function findSamePeriodPriorYear(
  periods: PeriodValues[],
  target: PeriodKey,
): PeriodValues | undefined {
  return periods.find(
    (p) =>
      p.period.granularity === target.granularity &&
      p.period.year === target.year - 1 &&
      p.period.index === target.index,
  );
}

export function findPreviousPeriod(
  periodsSortedAsc: PeriodValues[],
  target: PeriodKey,
): PeriodValues | undefined {
  const idx = periodsSortedAsc.findIndex((p) => comparePeriod(p.period, target) === 0);
  if (idx <= 0) return undefined;
  return periodsSortedAsc[idx - 1];
}
