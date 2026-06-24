import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { MarketBadge } from '@/components/shell/MarketBadge';
import { KeyMetricsStrip } from '@/components/companies/KeyMetricsStrip';
import { ResearchWorkspace } from '@/components/research/ResearchWorkspace';
import { ValuationWorkspace } from '@/components/valuation/ValuationWorkspace';
import { getCompany } from '@/data/companies';
import { enrichCompanyWithLiveMarketData } from '@/lib/market/live-company-market';
import { fetchLiveQuoteSnapshot } from '@/lib/market/live-quote';
import type {
  AnalysisOverlay,
  CompanyFinancials,
  DisplayUnit,
  PeriodGranularity,
  StatementId,
} from '@/types/finance';

type Params = Promise<{ ticker: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type DetailTab = 'kline' | 'financials' | 'valuation';

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parseTab(v: unknown): DetailTab {
  return v === 'financials' || v === 'valuation' ? v : 'kline';
}

function parseStatement(v: unknown): StatementId {
  return v === 'IS' || v === 'CF' ? v : 'BS';
}

function parseGranularity(v: unknown): PeriodGranularity {
  return v === 'H' || v === 'Q' ? v : 'Y';
}

function parseUnit(v: unknown): DisplayUnit {
  return v === 'yi' || v === 'wan' || v === 'yuan' ? v : 'auto';
}

function parsePeriodsCount(v: unknown, g: PeriodGranularity): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : NaN;
  if (Number.isFinite(n) && n > 0 && n <= 20) return n;
  return g === 'Y' ? 5 : g === 'H' ? 4 : 8;
}

function parseOverlays(v: unknown): AnalysisOverlay[] {
  if (v === undefined || v === null) return ['yoy'];
  if (typeof v !== 'string') return [];
  if (v === '') return [];
  const out: AnalysisOverlay[] = [];
  for (const t of v.split(',')) {
    if (t === 'yoy' || t === 'qoq' || t === 'common') out.push(t);
  }
  return out;
}

function tabHref(ticker: string, tab: DetailTab): string {
  return `/company/${encodeURIComponent(ticker)}?tab=${tab}`;
}

function inferMarket(ticker: string): CompanyFinancials['market'] | undefined {
  const lower = ticker.toLowerCase();
  if (/\.(sh|sz|bj)$/.test(lower)) return 'A';
  if (/\.hk$/.test(lower)) return 'HK';
  if (/\.us$/.test(lower)) return 'US';
  return undefined;
}

export default async function CompanyDetailPage(props: { params: Params; searchParams: SearchParams }) {
  const { ticker } = await props.params;
  const sp = await props.searchParams;
  const tab = parseTab(one(sp.tab));
  const storedCompany = getCompany(ticker);
  const [company, liveQuote] = await Promise.all([
    storedCompany ? enrichCompanyWithLiveMarketData(storedCompany) : Promise.resolve(undefined),
    fetchLiveQuoteSnapshot(ticker),
  ]);
  if (!company && tab !== 'kline') notFound();

  const granularity = parseGranularity(one(sp.period));

  return (
    <AppShell ticker={ticker}>
      <div
        className={`flex flex-col bg-[var(--color-bg-base)] ${
          tab === 'kline' ? 'h-[calc(100dvh-48px)] max-h-[calc(100dvh-48px)] overflow-hidden' : 'min-h-[calc(100vh-48px)]'
        }`}
      >
        <CompanyDetailHeader ticker={ticker} tab={tab} company={company} liveQuote={liveQuote} />

        <div className={tab === 'kline' ? 'min-h-0 flex-1 overflow-hidden' : 'flex-1 overflow-y-auto bg-[var(--color-bg-base)]'}>
          {tab === 'kline' && (
            <iframe
              title={`${company?.name ?? ticker} K线图`}
              src={`/hq-classic?symbol=${encodeURIComponent(ticker)}&embedded=1`}
              className="block h-full min-h-0 w-full border-0"
              scrolling="no"
            />
          )}

          {tab === 'financials' && company && (
            <ResearchWorkspace
              company={company}
              ticker={ticker}
              basePath={tabHref(ticker, 'financials')}
              initial={{
                statementId: parseStatement(one(sp.statement)),
                granularity,
                periodsCount: parsePeriodsCount(one(sp.periods), granularity),
                overlays: parseOverlays(one(sp.show)),
                unit: parseUnit(one(sp.unit)),
              }}
            />
          )}

          {tab === 'valuation' && company && (
            <ValuationWorkspace
              ticker={company.ticker}
              company={company}
              backHref={tabHref(company.ticker, 'financials')}
              backLabel="← 回财报"
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

function CompanyDetailHeader({
  ticker,
  tab,
  company,
  liveQuote,
}: {
  ticker: string;
  tab: DetailTab;
  company?: CompanyFinancials;
  liveQuote?: Awaited<ReturnType<typeof fetchLiveQuoteSnapshot>>;
}) {
  const tabs: Array<{ id: DetailTab; label: string }> = [
    { id: 'kline', label: 'K线图' },
    { id: 'financials', label: '财报' },
    { id: 'valuation', label: '估值' },
  ];

  return (
    <section className="border-b border-[var(--color-border-base)] bg-[var(--color-bg-elev1)] px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h1 className="truncate text-[18px] font-semibold text-[var(--color-text-primary)]">
              {company?.name ?? ticker.toUpperCase()}
            </h1>
            <span className="font-mono text-[12px] text-[var(--color-text-tertiary)]">
              {company?.ticker || ticker}
            </span>
            {(company?.market || inferMarket(ticker)) && <MarketBadge market={(company?.market || inferMarket(ticker))!} />}
            {company?.industry && (
              <span className="rounded-sm border border-[var(--color-border-base)] bg-[var(--color-bg-elev2)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-secondary)]">
                {company.industry}
              </span>
            )}
          </div>
          {company?.nameEn && company.nameEn !== company.name && (
            <div className="text-[12px] text-[var(--color-text-tertiary)]">{company.nameEn}</div>
          )}
        </div>

        <nav className="flex shrink-0 items-center rounded-md border border-[var(--color-border-base)] bg-[var(--color-bg-elev2)] p-1">
          {tabs.map((item) => {
            const active = item.id === tab;
            return (
              <Link
                key={item.id}
                href={tabHref(ticker, item.id)}
                className={`rounded px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  active
                    ? 'bg-[var(--color-brand)] text-[var(--color-bg-base)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elev3)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {company && (
        <div className="mt-3">
          <KeyMetricsStrip company={company} liveQuote={liveQuote} />
        </div>
      )}
    </section>
  );
}

export const metadata = {
  title: '公司详情 · VFin',
};

export const dynamic = 'force-dynamic';
