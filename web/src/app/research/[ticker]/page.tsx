import { notFound } from 'next/navigation';
import { getCompany } from '@/data/companies';
import { AppShell } from '@/components/shell/AppShell';
import { LeftWatchlistPanel } from '@/components/shell/LeftWatchlistPanel';
import { ResearchWorkspace } from '@/components/research/ResearchWorkspace';
import type {
  AnalysisOverlay,
  DisplayUnit,
  PeriodGranularity,
  StatementId,
} from '@/types/finance';

type Params = Promise<{ ticker: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// 不需要 force-dynamic：await searchParams 自动让此页面成为 dynamic 渲染
// 之后所有 UI 切换都在 ResearchWorkspace 内部 useState（零网络）。

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

export default async function ResearchPage(props: { params: Params; searchParams: SearchParams }) {
  const { ticker } = await props.params;
  const sp = await props.searchParams;
  const company = getCompany(ticker);
  if (!company) notFound();

  const granularity = parseGranularity(sp.period);

  return (
    <AppShell ticker={ticker}>
      <div className="flex h-[calc(100vh-48px)] min-h-[480px] overflow-hidden">
        <LeftWatchlistPanel activeSymbol={ticker} mode="research" />

        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="sticky top-0 z-10 flex h-9 items-center justify-end border-b border-[var(--color-border-base)] bg-[var(--color-bg-elev1)] px-4">
            <a
              href={`/company/${encodeURIComponent(ticker)}?tab=valuation`}
              className="rounded border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              估值评估 →
            </a>
          </div>
          <ResearchWorkspace
            company={company}
            ticker={ticker}
            initial={{
              statementId: parseStatement(sp.statement),
              granularity,
              periodsCount: parsePeriodsCount(sp.periods, granularity),
              overlays: parseOverlays(sp.show),
              unit: parseUnit(sp.unit),
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}

export const metadata = {
  title: '财报研究 · VFin',
};
