import { notFound } from 'next/navigation';
import { getCompany } from '@/data/companies';
import { computeSotp } from '@/lib/valuation/sotp';
import {
  getLatestAnnualPeriod,
  deriveLatestRevenue,
  deriveNetCashConservative,
  deriveRevenueSeries,
  deriveNetIncomeSeries,
  deriveAverageFcfAndRevenue,
  cagr,
} from '@/lib/valuation/derive';
import { deriveDefaultGrowthRates } from '@/lib/valuation/dcf';
import { ValuationHeader } from '@/components/valuation/ValuationHeader';
import { MethodologyPanel } from '@/components/valuation/MethodologyPanel';
import { FinancialFactsPanel } from '@/components/valuation/FinancialFactsPanel';
import { CashBalancePanel } from '@/components/valuation/CashBalancePanel';
import { DcfPanel } from '@/components/valuation/DcfPanel';
import { ValuationVerdictCards } from '@/components/valuation/ValuationVerdictCards';
import { SegmentContributionBar } from '@/components/valuation/SegmentContributionBar';
import { SegmentDetailTable } from '@/components/valuation/SegmentDetailTable';
import { SensitivityStrip } from '@/components/valuation/SensitivityStrip';
import { DataCaveats } from '@/components/valuation/DataCaveats';
import type { SotpCurrency } from '@/types/valuation';

type Params = Promise<{ ticker: string }>;

function formatPeriod(p: { year: number; granularity: 'Y' | 'H' | 'Q'; index?: 1 | 2 | 3 | 4 } | null): string {
  if (!p) return '--';
  if (p.granularity === 'Y') return `${p.year} 年报`;
  if (p.granularity === 'H') return `${p.year} ${p.index === 1 ? 'H1' : 'H2'}`;
  return `${p.year} Q${p.index ?? '?'}`;
}

/** 标准差 / 均值 — CV 越大波动越大 */
function cv(xs: number[]): number | null {
  const valid = xs.filter((x) => Number.isFinite(x));
  if (valid.length < 2) return null;
  const m = valid.reduce((s, x) => s + x, 0) / valid.length;
  if (m === 0) return null;
  const variance = valid.reduce((s, x) => s + (x - m) ** 2, 0) / valid.length;
  return Math.sqrt(variance) / Math.abs(m);
}

export default async function ValuationPage(props: { params: Params }) {
  const { ticker } = await props.params;
  const company = getCompany(ticker);
  if (!company) notFound();

  const latestPeriod = getLatestAnnualPeriod(company);
  const cfg = company.valuation;

  // ─── 派生 DCF 默认假设 ─────────────────────────────────────────
  const baseRevDerive = deriveLatestRevenue(company);        // 百万
  const netCashDerive = deriveNetCashConservative(company);  // 百万
  const revSeries = deriveRevenueSeries(company);
  const niSeries = deriveNetIncomeSeries(company);
  const fcfAvg = deriveAverageFcfAndRevenue(company, 3);

  const revValues = revSeries.points.map((p) => p.value).filter((v): v is number => v !== null);
  const defaultGrowths = deriveDefaultGrowthRates(revValues, 5);

  // 公司特征推断
  const revCagr5y = cagr(revSeries);
  const niCv = cv(niSeries.points.map((p) => p.value).filter((v): v is number => v !== null));
  const isGrowthStage = (revCagr5y ?? 0) > 0.10;
  const isStableProfit = niCv !== null && niCv < 0.5;
  const isCashFlowReliable = (fcfAvg.fcfMargin ?? 0) > 0.02; // FCF margin 持续 > 2% 视为可预测
  const isMultiSegment = !!cfg?.segments?.length || company.industry === '综合';
  const isCyclical = false; // 简化：周期股需领域知识，暂不自动识别

  // SOTP 复用（仅当用户配置后显示）
  const sotpResult =
    cfg && cfg.marketCapOverride !== null && cfg.marketCapOverride !== undefined
      ? computeSotp(cfg, cfg.marketCapOverride)
      : null;

  const currency: SotpCurrency =
    company.currency === 'USD' && company.unit === 'yuan'
      ? 'CNY'  // 修正 fetcher bug
      : (['CNY', 'HKD', 'USD'].includes(company.currency) ? (company.currency as SotpCurrency) : 'CNY');

  const dcfReady =
    baseRevDerive?.value !== null &&
    baseRevDerive?.value !== undefined &&
    defaultGrowths !== null &&
    fcfAvg.fcfMargin !== null &&
    netCashDerive?.value !== null &&
    netCashDerive?.value !== undefined;

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <ValuationHeader
        ticker={ticker}
        companyName={company.name}
        market={company.market}
        reportingCurrency={currency}
        latestPeriod={formatPeriod(latestPeriod)}
      />

      <DataCompletenessBar
        hasFinancials={latestPeriod !== null}
        dcfReady={dcfReady}
        hasMarketCap={cfg?.marketCapOverride != null}
        hasSegments={!!cfg?.segments?.length}
      />

      {/* 1. 估值方法论 */}
      <section className="mt-4">
        <MethodologyPanel
          companyTraits={{
            isMultiSegment,
            isStableProfit,
            isGrowthStage,
            isCyclical,
            isCashFlowReliable,
          }}
        />
      </section>

      <SectionDivider title="第一步：财务质量诊断（基础前提）" />

      {/* 2. 财务事实 */}
      <section className="mt-3">
        <FinancialFactsPanel company={company} />
      </section>

      {/* 3. 净现金 / 资产负债 */}
      <section className="mt-4">
        <CashBalancePanel company={company} />
      </section>

      <SectionDivider title="第二步：DCF 内在价值估算（绝对估值）" />

      {/* 4. DCF Panel — 核心 */}
      <section className="mt-3">
        {dcfReady ? (
          <DcfPanel
            defaultBaseRevenue={baseRevDerive!.value!}
            defaultGrowthRates={defaultGrowths!}
            defaultFcfMargin={fcfAvg.fcfMargin!}
            defaultNetCash={netCashDerive!.value!}
            currency={currency}
            paramsRationale={{
              baseRevenue: `派生自 ${baseRevDerive!.asOf} rev_total`,
              growthRates: `默认 = 近 3 年 CAGR ${((defaultGrowths![0] ?? 0) * 100).toFixed(0)}% (激进) · 5 年 CAGR ${((revCagr5y ?? 0) * 100).toFixed(1)}% (保守) — 自行选档`,
              fcfMargin: `${fcfAvg.years} 年均 ${((fcfAvg.fcfMargin ?? 0) * 100).toFixed(1)}% (FCF 波动大需均值)`,
              netCash: `保守口径 ${netCashDerive!.asOf} · 实际或更高 (有息负债被合并到 other_cl)`,
            }}
          />
        ) : (
          <DcfUnavailable
            missing={[
              baseRevDerive?.value === null ? 'IS 缺 rev_total' : null,
              defaultGrowths === null ? '营收历史不足，无法派生增长率' : null,
              fcfAvg.fcfMargin === null ? 'CF 缺数据，无法派生 FCF margin' : null,
              netCashDerive?.value === null ? 'BS 字段不完整，无法派生净现金' : null,
            ].filter((x): x is string => x !== null)}
          />
        )}
      </section>

      <SectionDivider title="第三步：相对估值（需配置外部数据）" />

      {/* 5. 相对估值 + SOTP（用户配置后） */}
      <section className="mt-3">
        {sotpResult && cfg ? (
          <div className="space-y-4">
            <ValuationVerdictCards result={sotpResult} />
            {cfg.segments.length > 0 && (
              <>
                <SegmentContributionBar result={sotpResult} />
                <SegmentDetailTable result={sotpResult} />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <SensitivityStrip result={sotpResult} />
                  </div>
                  <DataCaveats cfg={cfg} />
                </div>
              </>
            )}
          </div>
        ) : (
          <RelativeValuationPlaceholder ticker={ticker} />
        )}
      </section>
    </div>
  );
}

function SectionDivider({ title }: { title: string }) {
  return (
    <div className="mt-8 flex items-center gap-3">
      <h2 className="shrink-0 text-base font-bold text-gray-900">{title}</h2>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  );
}

function DataCompletenessBar({
  hasFinancials,
  dcfReady,
  hasMarketCap,
  hasSegments,
}: {
  hasFinancials: boolean;
  dcfReady: boolean;
  hasMarketCap: boolean;
  hasSegments: boolean;
}) {
  const items: { label: string; ok: boolean; hint?: string }[] = [
    { label: '财务报表 (IS/BS/CF)', ok: hasFinancials, hint: '从 JSON 派生事实' },
    {
      label: 'DCF 可计算',
      ok: dcfReady,
      hint: dcfReady ? '默认假设已从历史派生' : '缺关键派生项（见下面 DCF 区域提示）',
    },
    {
      label: '当前市值',
      ok: hasMarketCap,
      hint: hasMarketCap ? undefined : '在 valuation.marketCapOverride 填入（需 sourceUrl + asOf）',
    },
    {
      label: '业务分部 + peer (SOTP)',
      ok: hasSegments,
      hint: hasSegments ? undefined : '多业务公司可在 valuation.segments 配置分拆估值',
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
    </div>
  );
}

function DcfUnavailable({ missing }: { missing: string[] }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      <div className="font-medium">DCF 暂无法派生</div>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
        {missing.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
      <div className="mt-2 text-[11px] text-amber-800">
        请检查公司 JSON 的{' '}
        <code className="rounded bg-amber-100 px-1">statements.IS / BS / CF</code>{' '}
        是否完整。
      </div>
    </div>
  );
}

function RelativeValuationPlaceholder({ ticker }: { ticker: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 text-sm text-gray-700">
      <div className="font-medium">相对估值未配置</div>
      <p className="mt-2 text-xs text-gray-600">
        相对估值（PE / PS / PB 同业对比 + 多业务 SOTP）依赖外部数据：
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-gray-600">
        <li>
          <strong>当前市值</strong>（股价 × 总股本，按报表币种换算）→ 填入{' '}
          <code className="rounded bg-gray-100 px-1">valuation.marketCapOverride</code>
        </li>
        <li>
          <strong>业务分部</strong>（来自公司年报附注）+ 同业 peer 实时倍数 → 填入{' '}
          <code className="rounded bg-gray-100 px-1">valuation.segments[]</code>
        </li>
        <li>每个外部数字必须附 <code>sourceUrl</code> + <code>asOf</code>（项目零容错铁律）</li>
      </ul>
      <p className="mt-2 text-[11px] text-gray-500">
        配置文件：
        <code className="rounded bg-gray-100 px-1">web/src/data/companies/{ticker}.json</code>
      </p>
    </div>
  );
}
