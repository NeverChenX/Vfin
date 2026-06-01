import type { SotpCurrency } from '@/types/valuation';

interface ValuationHeaderProps {
  ticker: string;
  companyName: string;
  market?: string;
  currency: SotpCurrency;
  asOf: string;
  isDemo?: boolean;
}

export function ValuationHeader({
  ticker,
  companyName,
  market,
  currency,
  asOf,
  isDemo,
}: ValuationHeaderProps) {
  return (
    <div>
      {isDemo && (
        <div className="mb-4 rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-semibold">
            <span className="text-base">⚠</span>
            <span>演示数据 — 所有 metric / peer 倍数 / 净现金均为占位</span>
          </div>
          <div className="mt-1 text-xs text-amber-800">
            按项目"金融数据零容错"铁律，任何数字必须经 ≥3 独立来源核对才能用于投资决策。
            请编辑 <code className="rounded bg-amber-100 px-1 py-0.5 text-[11px]">
              web/src/data/companies/{ticker}.json
            </code> 的 <code>valuation</code> 字段填入真实数字后，去掉 <code>isDemo: true</code>。
          </div>
        </div>
      )}
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {companyName}{' '}
            <span className="ml-2 text-base font-normal text-gray-500">({ticker})</span>
          </h1>
          <div className="mt-1 text-sm text-gray-500">
            {market ? `${market} · ` : ''}
            {currency} · 数据截止 {asOf}
          </div>
        </div>
        <a
          href={`/research/${encodeURIComponent(ticker)}`}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          ← 回研究页
        </a>
      </div>
    </div>
  );
}
