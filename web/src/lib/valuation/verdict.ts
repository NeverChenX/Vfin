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
