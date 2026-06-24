import type { SotpResult } from '@/types/valuation';
import { formatMoney, formatPct } from '@/lib/valuation/format';
import {
  valuationCoverageRatio,
  valuationGapSummary,
  verdictLabel,
  verdictTone,
  type VerdictTone,
} from '@/lib/valuation/verdict';

interface ValuationVerdictCardsProps {
  result: SotpResult;
}

const TONE_BG: Record<VerdictTone, string> = {
  'positive-strong': 'bg-[rgba(14,203,129,0.12)] text-[var(--color-up)] ring-[rgba(14,203,129,0.35)]',
  'positive':        'bg-[rgba(14,203,129,0.10)] text-[var(--color-up)] ring-[rgba(14,203,129,0.28)]',
  'neutral':         'bg-[var(--color-bg-elev3)] text-[var(--color-text-secondary)] ring-[var(--color-border-strong)]',
  'negative':        'bg-[rgba(240,185,11,0.12)] text-[var(--color-brand)] ring-[rgba(240,185,11,0.35)]',
  'negative-strong': 'bg-[rgba(246,70,93,0.12)] text-[var(--color-down)] ring-[rgba(246,70,93,0.35)]',
};

export function ValuationVerdictCards({ result }: ValuationVerdictCardsProps) {
  const tone = verdictTone(result.verdict);
  const label = verdictLabel(result.verdict);
  const gap = valuationGapSummary(result.sotpTotal, result.currentMarketCap);
  const coverage = valuationCoverageRatio(result.sotpTotal, result.currentMarketCap);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div className="rounded-lg border border-[var(--color-border-base)] bg-[var(--color-bg-elev1)] p-5">
        <div className="text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">当前市值</div>
        <div className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)] tabular-nums">
          {formatMoney(result.currentMarketCap, result.currency)}
        </div>
      </div>
      <div className="rounded-lg border border-[rgba(240,185,11,0.45)] bg-[var(--color-bg-elev1)] p-5 shadow-[0_0_0_1px_rgba(240,185,11,0.08)]">
        <div className="text-xs uppercase tracking-wide text-[var(--color-brand)]">推算估值</div>
        <div className="mt-2 text-2xl font-semibold text-[var(--color-brand)] tabular-nums">
          {formatMoney(result.sotpTotal, result.currency)}
        </div>
      </div>
      <div className="rounded-lg border border-[var(--color-border-base)] bg-[var(--color-bg-elev1)] p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">估值结论</div>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${TONE_BG[tone]}`}>
            {label}
          </span>
        </div>
        {gap ? (
          <>
            <div className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)] tabular-nums">
              {gap.direction}
              {formatMoney(gap.amount, result.currency)}
            </div>
            <div className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {gap.direction === '持平' ? '与当前市值基本一致' : `${gap.direction}幅度 `}
              {gap.direction !== '持平' && (
                <span className="font-medium tabular-nums">{formatPct(gap.pct).replace('+', '')}</span>
              )}
            </div>
            <div className="mt-3 border-t border-[var(--color-border-base)] pt-3">
              <div className="text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">估值兑现率</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--color-brand)]">
                {coverage === null ? '--' : formatPct(coverage).replace('+', '')}
              </div>
              <div className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">当前市值 / 推算估值</div>
            </div>
          </>
        ) : (
          <>
            <div className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">--</div>
            <div className="mt-1 text-sm text-[var(--color-text-secondary)]">缺少当前市值，无法计算幅度</div>
          </>
        )}
      </div>
    </div>
  );
}
