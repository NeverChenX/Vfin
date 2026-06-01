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
  const peerCount = segment.peers.length;
  const multiples = segment.peers
    .map((p) => p.multiple)
    .filter((m): m is number => Number.isFinite(m));
  const hasMetric = segment.metricValue !== null && Number.isFinite(segment.metricValue);
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
  } else if (!hasPeers) {
    excluded = true;
    excludeReason = '无对标公司倍数';
  } else {
    impliedValue = (segment.metricValue as number) * (peerMedian as number);
  }

  return { segment, peerMedian, peerMean, peerCount, impliedValue, excluded, excludeReason };
}

export function computeSotp(cfg: ValuationConfig, currentMarketCap: number): SotpResult {
  const segments = cfg.segments.map(computeSegmentValuation);
  const segmentsTotal = segments
    .filter((s) => !s.excluded && s.impliedValue !== null)
    .reduce((sum, s) => sum + (s.impliedValue as number), 0);
  const excludedCount = segments.filter((s) => s.excluded).length;
  const sotpTotal = segmentsTotal + (cfg.netCash ?? 0);
  const impliedUpsidePct =
    currentMarketCap !== 0 ? (sotpTotal - currentMarketCap) / currentMarketCap : 0;

  return {
    segments,
    segmentsTotal,
    excludedCount,
    netCash: cfg.netCash,
    sotpTotal,
    currentMarketCap,
    impliedUpsidePct,
    verdict: classifyVerdict(impliedUpsidePct),
    currency: cfg.sotpCurrency,
    asOf: cfg.sotpAsOf,
  };
}
