import { AppShell } from '@/components/shell/AppShell';
import { MarketCards } from '@/components/home/MarketCards';
import { MarketsTable } from '@/components/home/MarketsTable';
import { getAllCompanies } from '@/data/companies';
import { periodLabelFromDate } from '@/lib/finance/period';

// 移除 force-dynamic — Next 15 检测到 await cookies() / new Date() 会自动 dynamic 渲染，
// 显式声明反而阻断 React.cache 在同一请求内的去重

export default function Home() {
  const companies = getAllCompanies();

  // 全库最新财报期 = 所有公司里 dataAsOf 最大的那个
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
        {/* Hero: 市场指数卡组 */}
        <section className="mb-4 sm:mb-6">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-y-1">
            <h1 className="text-[18px] font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-[22px]">
              市场
            </h1>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-[var(--color-text-tertiary)] sm:text-[12px]">
              <span>
                最新财报{' '}
                <span className="num font-semibold text-[var(--color-text-primary)]">
                  {latestLabel}
                </span>
                {latestDataAsOf && (
                  <span className="num ml-1 text-[var(--color-text-tertiary)]">
                    ({latestDataAsOf})
                  </span>
                )}
                {latestCount > 0 && (
                  <span className="num ml-1 text-[var(--color-brand)]">
                    · {latestCount} 家
                  </span>
                )}
              </span>
              <span className="text-[var(--color-border-strong)]">|</span>
              <span>每 5 秒自动刷新 · {new Date().toLocaleDateString('zh-CN')}</span>
            </div>
          </div>
          <MarketCards />
        </section>

        {/* 主表格 */}
        <section>
          <MarketsTable companies={companies} />
        </section>
      </div>
    </AppShell>
  );
}
