import type {
  BusinessSegment,
  SegmentValuation,
  SotpResult,
  ValuationConfig,
} from '@/types/valuation';
import { classifyVerdict } from './verdict';

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n % 2 === 1) return sorted[(n - 1) / 2];
  return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

export function computeSegmentValuation(segment: BusinessSegment): SegmentValuation {
  const peerImpliedMultiples: Record<string, number> = {};
  const multiples = segment.peers.flatMap((p) => {
    if (p.valuationMultiple !== undefined && p.valuationMultiple !== null) {
      if (!Number.isFinite(p.valuationMultiple)) return [];
      if (segment.method === 'PE' && p.valuationMultiple <= 0) return [];
      peerImpliedMultiples[p.ticker] = p.valuationMultiple;
      return [p.valuationMultiple];
    }

    const hasNetIncome =
      p.netIncome !== null && Number.isFinite(p.netIncome) && p.netIncome !== 0;
    const hasMarketValue = p.marketValue !== null && Number.isFinite(p.marketValue);
    const hasUsablePeDenominator =
      segment.method !== 'PE' || ((p.netIncome ?? 0) > 0);
    if (!hasNetIncome || !hasMarketValue) return [];
    if (!hasUsablePeDenominator) return [];
    const multiple = (p.marketValue as number) / (p.netIncome as number);
    peerImpliedMultiples[p.ticker] = multiple;
    return [multiple];
  });
  const peerCount = multiples.length;
  const hasMetric = segment.metricValue !== null && Number.isFinite(segment.metricValue);
  const hasUsablePeMetric =
    segment.method !== 'PE' || ((segment.metricValue ?? 0) > 0);
  const hasPeers = multiples.length > 0;

  const peerMedian = hasPeers ? median(multiples) : null;
  const peerMean = hasPeers ? mean(multiples) : null;

  let impliedValue: number | null = null;
  let excluded = false;
  let excludeReason: string | undefined;

  if (!hasMetric && !hasPeers) {
    excluded = true;
    excludeReason = '指标值与对标公司倍数均缺失';
  } else if (!hasMetric) {
    excluded = true;
    excludeReason = '指标值缺失';
  } else if (!hasUsablePeMetric) {
    excluded = true;
    excludeReason = 'PE 口径不适用于负利润业务，请改用收入或 EBITDA 等正指标';
  } else if (!hasPeers) {
    excluded = true;
    excludeReason = segment.method === 'PE'
      ? '无可用正利润 PE 对标公司倍数'
      : '无对标公司倍数';
  } else {
    impliedValue = (segment.metricValue as number) * (peerMedian as number);
  }

  return {
    segment,
    peerMedian,
    peerMean,
    peerCount,
    peerImpliedMultiples,
    impliedValue,
    excluded,
    excludeReason,
  };
}

export function computeSotp(cfg: ValuationConfig, currentMarketCap: number | null): SotpResult {
  const segments = cfg.segments.map(computeSegmentValuation);
  const segmentsTotal = segments
    .filter((s) => !s.excluded && s.impliedValue !== null)
    .reduce((sum, s) => sum + (s.impliedValue as number), 0);
  const excludedCount = segments.filter((s) => s.excluded).length;
  const sotpTotal = segmentsTotal + (cfg.netCash ?? 0);
  const impliedUpsidePct =
    currentMarketCap !== null && currentMarketCap !== 0
      ? (sotpTotal - currentMarketCap) / currentMarketCap
      : null;

  return {
    segments,
    segmentsTotal,
    excludedCount,
    netCash: cfg.netCash,
    sotpTotal,
    currentMarketCap,
    impliedUpsidePct,
    verdict: classifyVerdict(impliedUpsidePct ?? 0),
    currency: cfg.sotpCurrency,
    asOf: cfg.sotpAsOf,
  };
}
