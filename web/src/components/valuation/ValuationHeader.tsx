interface ValuationHeaderProps {
  ticker: string;
  companyName: string;
  market?: string;
  reportingCurrency: string;
  latestPeriod: string;
  backHref?: string;
  backLabel?: string;
}

export function ValuationHeader({
  ticker,
  companyName,
  market,
  reportingCurrency,
  latestPeriod,
  backHref,
  backLabel,
}: ValuationHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--color-border-base)] pb-4">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
          {companyName}{' '}
          <span className="ml-2 font-mono text-base font-normal text-[var(--color-brand)]">({ticker})</span>
        </h1>
        <div className="mt-1 text-sm text-[var(--color-text-tertiary)]">
          {market ? `${market} · ` : ''}
          报表币种 {reportingCurrency} · 最新报表期 {latestPeriod}
        </div>
      </div>
      {(backHref || backLabel) && (
        <a
          href={backHref ?? `/company/${encodeURIComponent(ticker)}?tab=financials`}
          className="rounded border border-[var(--color-border-base)] bg-[var(--color-bg-elev2)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
        >
          {backLabel ?? '← 回财报'}
        </a>
      )}
    </div>
  );
}
