import type { SotpResult } from '@/types/valuation';
import { formatMoney, formatPct } from '@/lib/valuation/format';
import { verdictLabel, verdictTone, type VerdictTone } from '@/lib/valuation/verdict';

interface ValuationVerdictCardsProps {
  result: SotpResult;
}

const TONE_BG: Record<VerdictTone, string> = {
  'positive-strong': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'positive':        'bg-green-50 text-green-700 ring-green-200',
  'neutral':         'bg-gray-50 text-gray-700 ring-gray-200',
  'negative':        'bg-amber-50 text-amber-700 ring-amber-200',
  'negative-strong': 'bg-red-50 text-red-700 ring-red-200',
};

export function ValuationVerdictCards({ result }: ValuationVerdictCardsProps) {
  const tone = verdictTone(result.verdict);
  const label = verdictLabel(result.verdict);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="text-xs uppercase tracking-wide text-gray-500">当前市值</div>
        <div className="mt-2 text-2xl font-semibold text-gray-900 tabular-nums">
          {formatMoney(result.currentMarketCap, result.currency)}
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-gray-500">SOTP 总估值</div>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${TONE_BG[tone]}`}>
            {label}
          </span>
        </div>
        <div className="mt-2 text-2xl font-semibold text-gray-900 tabular-nums">
          {formatMoney(result.sotpTotal, result.currency)}
        </div>
        <div className="mt-1 text-sm text-gray-600">
          隐含上行 <span className="font-medium tabular-nums">{formatPct(result.impliedUpsidePct)}</span>
        </div>
      </div>
    </div>
  );
}
