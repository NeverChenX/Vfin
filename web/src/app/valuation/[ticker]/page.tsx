import { notFound } from 'next/navigation';
import { getCompany } from '@/data/companies';
import { computeSotp } from '@/lib/valuation/sotp';
import { getLatestAnnualPeriod } from '@/lib/valuation/derive';
import { ValuationHeader } from '@/components/valuation/ValuationHeader';
import { FinancialFactsPanel } from '@/components/valuation/FinancialFactsPanel';
import { CashBalancePanel } from '@/components/valuation/CashBalancePanel';
import { ValuationVerdictCards } from '@/components/valuation/ValuationVerdictCards';
import { SegmentContributionBar } from '@/components/valuation/SegmentContributionBar';
import { SegmentDetailTable } from '@/components/valuation/SegmentDetailTable';
import { SensitivityStrip } from '@/components/valuation/SensitivityStrip';
import { DataCaveats } from '@/components/valuation/DataCaveats';

type Params = Promise<{ ticker: string }>;

function formatPeriod(p: { year: number; granularity: 'Y' | 'H' | 'Q'; index?: 1 | 2 | 3 | 4 } | null): string {
  if (!p) return '--';
  if (p.granularity === 'Y') return `${p.year} 年报`;
  if (p.granularity === 'H') return `${p.year} ${p.index === 1 ? 'H1' : 'H2'}`;
  return `${p.year} Q${p.index ?? '?'}`;
}

export default async function ValuationPage(props: { params: Params }) {
  const { ticker } = await props.params;
  const company = getCompany(ticker);
  if (!company) notFound();

  const latestPeriod = getLatestAnnualPeriod(company);
  const cfg = company.valuation;
  const sotpResult =
    cfg && cfg.marketCapOverride !== null && cfg.marketCapOverride !== undefined
      ? computeSotp(cfg, cfg.marketCapOverride)
      : null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <ValuationHeader
        ticker={ticker}
        companyName={company.name}
        market={company.market}
        reportingCurrency={company.currency}
        latestPeriod={formatPeriod(latestPeriod)}
      />

      <DataCompletenessBar
        hasFinancials={latestPeriod !== null}
        hasValuationCfg={!!cfg}
        hasMarketCap={cfg?.marketCapOverride != null}
        hasSegments={!!cfg?.segments?.length}
      />

      <section className="mt-4">
        <FinancialFactsPanel company={company} />
      </section>

      <section className="mt-4">
        <CashBalancePanel company={company} />
      </section>

      {sotpResult && cfg && (
        <>
          <SectionDivider title="估值合理性（基于用户配置的市值与同业倍数）" />
          <section className="mt-3">
            <ValuationVerdictCards result={sotpResult} />
          </section>
          {cfg.segments.length > 0 && (
            <>
              <section className="mt-4">
                <SegmentContributionBar result={sotpResult} />
              </section>
              <section className="mt-4">
                <SegmentDetailTable result={sotpResult} />
              </section>
              <section className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="md:col-span-2">
                  <SensitivityStrip result={sotpResult} />
                </div>
                <DataCaveats cfg={cfg} />
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function SectionDivider({ title }: { title: string }) {
  return (
    <div className="mt-8 flex items-center gap-3">
      <h2 className="shrink-0 text-sm font-semibold text-gray-900">{title}</h2>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  );
}

function DataCompletenessBar({
  hasFinancials,
  hasValuationCfg,
  hasMarketCap,
  hasSegments,
}: {
  hasFinancials: boolean;
  hasValuationCfg: boolean;
  hasMarketCap: boolean;
  hasSegments: boolean;
}) {
  const items: { label: string; ok: boolean; hint?: string }[] = [
    { label: '财务报表 (IS/BS)', ok: hasFinancials, hint: '从 JSON 派生事实' },
    {
      label: '市值配置',
      ok: hasMarketCap,
      hint: hasMarketCap ? undefined : '在 valuation.marketCapOverride 填入（需 sourceUrl + asOf）',
    },
    {
      label: '业务分部',
      ok: hasSegments,
      hint: hasSegments ? undefined : '在 valuation.segments 配置（多业务公司才需要）',
    },
    {
      label: '同业 peer 倍数',
      ok: hasValuationCfg && hasSegments,
      hint: '每段业务的 peers[] 需至少 1 个 peer + sourceUrl + asOf',
    },
  ];
  return (
    <div className="mt-5 rounded-lg border border-gray-200 bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
        数据完整性诊断
      </div>
      <ul className="space-y-1.5 text-xs">
        {items.map((it) => (
          <li key={it.label} className="flex items-start gap-2">
            <span
              className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                it.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'
              }`}
            >
              {it.ok ? '✓' : '○'}
            </span>
            <span className={it.ok ? 'text-gray-900' : 'text-gray-500'}>
              <span className="font-medium">{it.label}</span>
              {it.hint && (
                <span className={it.ok ? 'ml-2 text-gray-500' : 'ml-2'}>· {it.hint}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 border-t border-gray-100 pt-2 text-[11px] text-gray-500">
        模块原则：派生数据 100% 可追溯到报表字段；用户填入的数据必须含 sourceUrl + asOf；
        缺数据一律显示 <code className="rounded bg-gray-100 px-1">--</code>，不猜测。
      </div>
    </div>
  );
}
