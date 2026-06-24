import type { KeyMetricsRow } from '@/types/finance';
import type { QuoteSnapshot } from '@/types/market';

export interface KeyMetricsMarketSource {
  ratios?: Pick<KeyMetricsRow, 'period' | 'values'>[];
}

export interface CurrentMarketMetrics {
  price: number | null;
  peTtm: number | null;
  pb: number | null;
  marketMultiplesValidationStatus: 'verified' | 'degraded_single_source' | 'cached' | 'unavailable';
  asOf?: string;
  sources?: string[];
}

export function buildCurrentMarketMetrics(
  company?: KeyMetricsMarketSource,
  quote?: QuoteSnapshot | null,
): CurrentMarketMetrics {
  const q = quote ?? null;
  const price = finiteOrNull(q?.price);
  const quoteStatus = q?.marketMultiplesValidationStatus;

  if (q && (quoteStatus === 'verified' || quoteStatus === 'degraded_single_source')) {
    return {
      price,
      peTtm: finiteOrNull(q.peTtm),
      pb: finiteOrNull(q.pb),
      marketMultiplesValidationStatus: quoteStatus,
      asOf: q.timestamp,
      sources: q.marketMultiplesSources,
    };
  }

  if (q && quoteStatus === 'unavailable') {
    return {
      price,
      peTtm: null,
      pb: null,
      marketMultiplesValidationStatus: 'unavailable',
      asOf: q.timestamp,
      sources: q.marketMultiplesSources,
    };
  }

  const latest = [...(company?.ratios ?? [])].sort((a, b) => periodSortVal(b.period) - periodSortVal(a.period))[0];
  return {
    price,
    peTtm: finiteOrNull(latest?.values.pe_ttm),
    pb: finiteOrNull(latest?.values.pb),
    marketMultiplesValidationStatus: latest ? 'cached' : 'unavailable',
    asOf: q?.timestamp,
  };
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function periodSortVal(period: KeyMetricsRow['period']): number {
  const off = period.granularity === 'H' ? (period.index ?? 0) * 2 : period.granularity === 'Q' ? (period.index ?? 0) : 4;
  return period.year * 10 + off;
}
