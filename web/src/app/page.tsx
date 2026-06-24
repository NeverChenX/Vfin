import { AppShell } from '@/components/shell/AppShell';
import { MarketIndexCards } from '@/components/market/MarketIndexCards';
import { SectorHeatmap } from '@/components/market/SectorHeatmap';
import { HKZone } from '@/components/market/HKZone';
import { CrossMarketStrip } from '@/components/market/CrossMarketStrip';
import { MarketsTable } from '@/components/home/MarketsTable';
import { getAllCompanies } from '@/data/companies';
import { periodLabelFromDate } from '@/lib/finance/period';

export default function Home() {
  const companies = getAllCompanies();
  const latestDataAsOf = companies
    .map((c) => c.dataAsOf)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1) ?? '';
  const latestLabel = latestDataAsOf ? periodLabelFromDate(latestDataAsOf) : '—';
  const latestCount = latestDataAsOf
    ? companies.filter((c) => c.dataAsOf === latestDataAsOf).length
    : 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-[1400px] px-3 py-4 sm:px-6 sm:py-6">
        <section className="mb-3 sm:mb-4">
          <div className="flex flex-wrap items-baseline justify-between gap-y-1">
            <h1 className="text-[18px] font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-[22px]">
              市场
            </h1>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-[var(--color-text-tertiary)] sm:text-[12px]">
              <span>
                最新财报 <span className="num font-semibold text-[var(--color-text-primary)]">{latestLabel}</span>
                {latestDataAsOf && <span className="num ml-1">({latestDataAsOf})</span>}
                {latestCount > 0 && <span className="num ml-1 text-[var(--color-brand)]">· {latestCount} 家</span>}
              </span>
              <span className="text-[var(--color-border-strong)]">|</span>
              <span>自动刷新 · {new Date().toLocaleDateString('zh-CN')}</span>
            </div>
          </div>
        </section>

        {/* L1 · 核心指数 + 30 日 sparkline */}
        <section className="mb-4">
          <MarketIndexCards />
        </section>

        {/* L2 · A 股行业热力图 */}
        <section className="mb-4">
          <SectorHeatmap />
        </section>

        {/* L3 · 港股专区 */}
        <section className="mb-4">
          <HKZone />
        </section>

        {/* L4 · 跨市场带 */}
        <section className="mb-4 sm:mb-6">
          <CrossMarketStrip />
        </section>

        {/* L5 · 自选股表 */}
        <section>
          <MarketsTable companies={companies} />
        </section>
      </div>
    </AppShell>
  );
}
