import type { Verdict } from '@/types/valuation';

/**
 * 5 档分类。边界口径（spec §3.3）：
 *   >+20%  → STRONG_UNDER
 *   (+5%,+20%] → MILD_UNDER
 *   [-5%,+5%]  → FAIR
 *   [-20%,-5%) → MILD_OVER
 *   <-20%  → STRONG_OVER
 */
export function classifyVerdict(impliedUpsidePct: number): Verdict {
  if (impliedUpsidePct > 0.20) return 'STRONG_UNDER';
  if (impliedUpsidePct > 0.05) return 'MILD_UNDER';
  if (impliedUpsidePct >= -0.05) return 'FAIR';
  if (impliedUpsidePct >= -0.20) return 'MILD_OVER';
  return 'STRONG_OVER';
}

export function verdictLabel(v: Verdict): string {
  switch (v) {
    case 'STRONG_UNDER': return '显著低估';
    case 'MILD_UNDER':   return '合理偏低';
    case 'FAIR':         return '合理';
    case 'MILD_OVER':    return '合理偏高';
    case 'STRONG_OVER':  return '显著高估';
  }
}

export type VerdictTone =
  | 'positive-strong'
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'negative-strong';

export function verdictTone(v: Verdict): VerdictTone {
  switch (v) {
    case 'STRONG_UNDER': return 'positive-strong';
    case 'MILD_UNDER':   return 'positive';
    case 'FAIR':         return 'neutral';
    case 'MILD_OVER':    return 'negative';
    case 'STRONG_OVER':  return 'negative-strong';
  }
}

export interface ValuationGapSummary {
  direction: '低估' | '高估' | '持平';
  amount: number;
  pct: number;
}

export function valuationGapSummary(
  estimatedValue: number | null,
  currentMarketCap: number | null,
): ValuationGapSummary | null {
  if (
    estimatedValue === null ||
    currentMarketCap === null ||
    !Number.isFinite(estimatedValue) ||
    !Number.isFinite(currentMarketCap) ||
    currentMarketCap === 0
  ) {
    return null;
  }

  const gap = estimatedValue - currentMarketCap;
  return {
    direction: gap > 0 ? '低估' : gap < 0 ? '高估' : '持平',
    amount: Math.abs(gap),
    pct: Math.abs(gap / currentMarketCap),
  };
}

export function valuationCoverageRatio(
  estimatedValue: number | null,
  currentMarketCap: number | null,
): number | null {
  if (
    estimatedValue === null ||
    currentMarketCap === null ||
    !Number.isFinite(estimatedValue) ||
    !Number.isFinite(currentMarketCap) ||
    estimatedValue === 0
  ) {
    return null;
  }

  return currentMarketCap / estimatedValue;
}
