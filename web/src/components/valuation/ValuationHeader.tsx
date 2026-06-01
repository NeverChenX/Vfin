interface ValuationHeaderProps {
  ticker: string;
  companyName: string;
  market?: string;
  reportingCurrency: string;
  latestPeriod: string;
}

export function ValuationHeader({
  ticker,
  companyName,
  market,
  reportingCurrency,
  latestPeriod,
}: ValuationHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-gray-200 pb-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {companyName}{' '}
          <span className="ml-2 text-base font-normal text-gray-500">({ticker})</span>
        </h1>
        <div className="mt-1 text-sm text-gray-500">
          {market ? `${market} · ` : ''}
          报表币种 {reportingCurrency} · 最新报表期 {latestPeriod}
        </div>
      </div>
      <a
        href={`/research/${encodeURIComponent(ticker)}`}
        className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
      >
        ← 回研究页
      </a>
    </div>
  );
}
