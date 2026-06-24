import { computeSotp } from '@/lib/valuation/sotp';
import { getLatestPeriod } from '@/lib/valuation/derive';
import { ValuationHeader } from '@/components/valuation/ValuationHeader';
import { ValuationVerdictCards } from '@/components/valuation/ValuationVerdictCards';
import { SegmentContributionBar } from '@/components/valuation/SegmentContributionBar';
import { SegmentDetailTable } from '@/components/valuation/SegmentDetailTable';
import { SensitivityStrip } from '@/components/valuation/SensitivityStrip';
import { DataCaveats } from '@/components/valuation/DataCaveats';
import { FetchFinancialsButton } from '@/components/valuation/FetchFinancialsButton';
import type { CompanyFinancials } from '@/types/finance';
import type { SotpCurrency } from '@/types/valuation';

interface ValuationWorkspaceProps {
  ticker: string;
  company: CompanyFinancials;
  backHref?: string;
  backLabel?: string;
}

function formatPeriod(p: { year: number; granularity: 'Y' | 'H' | 'Q'; index?: 1 | 2 | 3 | 4 } | null): string {
  if (!p) return '--';
  if (p.granularity === 'Y') return `${p.year} 年报`;
  if (p.granularity === 'H') return `${p.year} ${p.index === 1 ? 'H1' : 'H2'}`;
  return `${p.year} Q${p.index ?? '?'}`;
}

export async function ValuationWorkspace({
  ticker,
  company,
  backHref,
  backLabel,
}: ValuationWorkspaceProps) {
  const latestPeriod = getLatestPeriod(company);
  const manualCfg = company.valuation;
  const cfg = manualCfg ?? null;

  const sotpResult =
    cfg
      ? computeSotp(
          cfg,
          cfg.marketCapOverride,
        )
      : null;
  const hasComputedSotp = sotpResult?.segments.some((s) => !s.excluded && s.impliedValue !== null) ?? false;
  const displaySotpResult = sotpResult
    ? {
        ...sotpResult,
        segments: sotpResult.segments.map((s) => ({
          ...s,
          segment: {
            ...s.segment,
            metricAsOf: '',
            source: undefined,
            rationale: '',
            peers: s.segment.peers.map((p) => ({
              ...p,
              asOf: '',
              source: '',
            })),
          },
        })),
      }
    : null;
  const caveatsCfg = cfg
    ? {
        ...cfg,
        segments: [],
      }
    : null;

  const currency: SotpCurrency =
    company.currency === 'USD' && company.unit === 'yuan'
      ? 'CNY'
      : (['CNY', 'HKD', 'USD'].includes(company.currency) ? (company.currency as SotpCurrency) : 'CNY');

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <ValuationHeader
        ticker={ticker}
        companyName={company.name}
        market={company.market}
        reportingCurrency={currency}
        latestPeriod={formatPeriod(latestPeriod)}
        backHref={backHref}
        backLabel={backLabel}
      />

      <section className="mt-5">
        {sotpResult && cfg ? (
          <div className="space-y-4">
            {hasComputedSotp ? (
              <ValuationVerdictCards result={displaySotpResult ?? sotpResult} />
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                已从年报解析出业务板块事实数据；目前还没有抓到可用于计算的 peer 同口径指标和估值数据。后续即使只能找到单源真实 peer 数据，也会降级显示并标注“未完全验证”。
              </div>
            )}
            {cfg.segments.length > 0 && (
              <>
                <SegmentDetailTable result={displaySotpResult ?? sotpResult} />
                {hasComputedSotp && (
                  <>
                    <SegmentContributionBar result={displaySotpResult ?? sotpResult} />
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div className="md:col-span-2">
                        <SensitivityStrip result={displaySotpResult ?? sotpResult} />
                      </div>
                      <DataCaveats cfg={caveatsCfg ?? cfg} />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        ) : (
          <RelativeValuationPlaceholder ticker={ticker} company={company} />
        )}
      </section>
    </div>
  );
}

function RelativeValuationPlaceholder({ ticker, company }: { ticker: string; company: CompanyFinancials }) {
  const hasFinancialStatements = (['IS', 'BS', 'CF'] as const).every(
    (statementId) => company.statements[statementId].periods.length > 0,
  );
  const validationPassed = company._validation?.passed === true;

  return (
    <div className="space-y-4">
      <FetchFinancialsButton ticker={ticker} />
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 text-sm text-gray-700">
        <div className="font-medium">分部估值数据待补充</div>
        <p className="mt-2 text-xs text-gray-600">
          当前页面是 {company.name}（{ticker}）。点击“抓取财报”会刷新这家公司本地 JSON，不需要再输入代码。
        </p>
        {hasFinancialStatements && (
          <p className="mt-2 text-xs text-gray-600">
            本地已经有三张财报结构；如果只找到单源真实数据，也会显示并标注未完全验证，不再因为缺少第二源直接隐藏。
          </p>
        )}
        {!validationPassed && (
          <p className="mt-2 text-xs text-amber-700">
            当前财报数据未通过双源交叉验证；系统会显示真实数据，但必须标注为未完全验证，不能包装成已验证结论。
          </p>
        )}
        <p className="mt-2 text-xs text-gray-600">
          下一步需要接入 peer 指标和估值数据；如果三次查找仍无法完成双源交叉验证，就按单源降级状态展示。
        </p>
        <p className="mt-2 text-[11px] text-gray-500">
          配置文件：
          <code className="rounded bg-gray-100 px-1">web/src/data/companies/{ticker}.json</code>
        </p>
      </div>
    </div>
  );
}
