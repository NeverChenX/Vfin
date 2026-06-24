import type { KeyMetricsRow } from '@/types/finance';

export const ASSET_LIST_METRIC_COLUMNS = [
  { key: 'peTtm', label: 'PE' },
  { key: 'pb', label: 'PB' },
] as const;

export interface MarketMultiplesSource {
  ratios?: Pick<KeyMetricsRow, 'period' | 'values'>[];
}

export interface QuoteMarketMultiplesSource {
  peTtm?: number | null;
  pb?: number | null;
  marketMultiplesValidationStatus?: 'verified' | 'degraded_single_source' | 'unavailable';
}

export function latestMarketMultiples(
  company?: MarketMultiplesSource,
  quote?: QuoteMarketMultiplesSource,
): { peTtm: number | null; pb: number | null; validationStatus?: 'verified' | 'degraded_single_source' | 'cached' | 'unavailable' } {
  if (
    (quote?.marketMultiplesValidationStatus === 'verified' ||
      quote?.marketMultiplesValidationStatus === 'degraded_single_source') &&
    validMultiple(quote.peTtm) !== null &&
    validMultiple(quote.pb) !== null
  ) {
    return {
      peTtm: validMultiple(quote.peTtm),
      pb: validMultiple(quote.pb),
      validationStatus: quote.marketMultiplesValidationStatus,
    };
  }
  const latest = [...(company?.ratios ?? [])].sort((a, b) => periodSortVal(b.period) - periodSortVal(a.period))[0];
  return {
    peTtm: validMultiple(latest?.values.pe_ttm),
    pb: validMultiple(latest?.values.pb),
    validationStatus: latest ? 'cached' : 'unavailable',
  };
}

export function formatMarketMultiple(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return value.toFixed(2);
}

function validMultiple(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function periodSortVal(period: KeyMetricsRow['period']): number {
  const off = period.granularity === 'H' ? (period.index ?? 0) * 2 : period.granularity === 'Q' ? (period.index ?? 0) : 4;
  return period.year * 10 + off;
}
