import { AppShell } from '@/components/shell/AppShell';
import { MarketsTable } from '@/components/home/MarketsTable';
import { getAllCompanies } from '@/data/companies';
import { periodLabelFromDate } from '@/lib/finance/period';

export default function AssetsPage() {
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
              资产列表
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

        <section>
          <MarketsTable companies={companies} />
        </section>
      </div>
    </AppShell>
  );
}

export const metadata = {
  title: '资产列表 · VFin',
};
