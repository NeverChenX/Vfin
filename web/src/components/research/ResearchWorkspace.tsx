'use client';

import { useCallback, useEffect, useState } from 'react';
import { ResearchToolbar, defaultPeriodsCount } from '@/components/shell/ResearchToolbar';
import { StatementTabs } from '@/components/shell/StatementTabs';
import { StatementTable } from '@/components/statement/StatementTable';
import { MarketBadge } from '@/components/shell/MarketBadge';
import { KeyMetricsStrip } from '@/components/companies/KeyMetricsStrip';
import { STATEMENT_SCHEMAS } from '@/lib/finance/schemas';
import type {
  AnalysisOverlay,
  CompanyFinancials,
  DisplayUnit,
  PeriodGranularity,
  StatementId,
} from '@/types/finance';

interface Props {
  company: CompanyFinancials;
  ticker: string;
  initial: {
    statementId: StatementId;
    granularity: PeriodGranularity;
    periodsCount: number;
    overlays: ReadonlyArray<AnalysisOverlay>;
    unit: DisplayUnit;
  };
}

/**
 * 客户端工作台：所有 UI 切换都是 useState，0 网络往返。
 * 切 BS/IS/CF、改期间/单位、勾同比环比 → React 重渲染（< 16ms）。
 *
 * URL 同步用 history.replaceState（不触发 Next.js router），保留深链接能力。
 */
export function ResearchWorkspace({ company, ticker, initial }: Props) {
  const [statementId, setStatementId] = useState<StatementId>(initial.statementId);
  const [granularity, setGranularity] = useState<PeriodGranularity>(initial.granularity);
  const [periodsCount, setPeriodsCount] = useState<number>(initial.periodsCount);
  const [overlays, setOverlays] = useState<ReadonlySet<AnalysisOverlay>>(
    () => new Set(initial.overlays),
  );
  const [unit, setUnit] = useState<DisplayUnit>(initial.unit);

  // 把状态写回 URL（不触发 router/RSC）— 刷新或复制链接仍可还原
  useEffect(() => {
    const sp = new URLSearchParams();
    if (statementId !== 'BS') sp.set('statement', statementId);
    if (granularity !== 'Y') sp.set('period', granularity);
    if (periodsCount !== defaultPeriodsCount(granularity)) sp.set('periods', String(periodsCount));
    const overlayList = Array.from(overlays);
    const isDefaultOverlay = overlays.size === 1 && overlays.has('yoy');
    if (!isDefaultOverlay) sp.set('show', overlayList.join(','));
    if (unit !== 'auto') sp.set('unit', unit);

    const qs = sp.toString();
    const url = `/research/${encodeURIComponent(ticker)}${qs ? `?${qs}` : ''}`;
    window.history.replaceState(null, '', url);
  }, [statementId, granularity, periodsCount, overlays, unit, ticker]);

  // 切换 granularity 时若 periodsCount 不在新粒度的合法选项中，重置为默认
  const onGranularityChange = useCallback((g: PeriodGranularity) => {
    setGranularity(g);
    setPeriodsCount(defaultPeriodsCount(g));
  }, []);

  const onOverlayToggle = useCallback((o: AnalysisOverlay) => {
    setOverlays((prev) => {
      const next = new Set(prev);
      if (next.has(o)) next.delete(o);
      else next.add(o);
      return next;
    });
  }, []);

  return (
    <>
      <ResearchToolbar
        currentGranularity={granularity}
        currentPeriodsCount={periodsCount}
        currentOverlays={overlays}
        currentUnit={unit}
        onGranularityChange={onGranularityChange}
        onPeriodsCountChange={setPeriodsCount}
        onOverlayToggle={onOverlayToggle}
        onUnitChange={setUnit}
      />

      <StatementTabs
        currentStatement={statementId}
        statements={[
          { id: 'BS', zhName: STATEMENT_SCHEMAS.BS.zhName, cfaName: STATEMENT_SCHEMAS.BS.cfaName },
          { id: 'IS', zhName: STATEMENT_SCHEMAS.IS.zhName, cfaName: STATEMENT_SCHEMAS.IS.cfaName },
          { id: 'CF', zhName: STATEMENT_SCHEMAS.CF.zhName, cfaName: STATEMENT_SCHEMAS.CF.cfaName },
        ]}
        onSelect={setStatementId}
      />

      <div className="px-4 py-2">
        <header className="mb-2 flex flex-wrap items-baseline gap-2.5 border-b border-[var(--color-border-base)] pb-2">
          <a
            href={`/hq-classic?symbol=${encodeURIComponent(ticker)}`}
            className="rounded border border-[var(--color-border-base)] bg-[var(--color-bg-elev2)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
            title="切换到行情"
          >
            行情 →
          </a>
          <h1 className="text-[15px] font-bold tracking-tight text-[var(--color-text-primary)]">
            {company.name}
          </h1>
          {company.nameEn && company.nameEn !== company.name && (
            <span className="text-[12px] text-[var(--color-text-tertiary)]">{company.nameEn}</span>
          )}
          <span className="font-mono text-[11px] text-[var(--color-text-tertiary)]">{company.ticker}</span>
          <MarketBadge market={company.market} />
          <span className="rounded-sm border border-[var(--color-border-base)] bg-[var(--color-bg-elev2)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-secondary)]">
            {company.industry}
          </span>
          <span className="ml-auto font-mono text-[10.5px] text-[var(--color-text-tertiary)]">
            {company.accountingStandard} · {company.currency}
          </span>
        </header>

        <KeyMetricsStrip company={company} />

        <StatementTable
          company={company}
          statementId={statementId}
          granularity={granularity}
          periodsCount={periodsCount}
          overlays={overlays}
          displayUnit={unit}
        />
      </div>
    </>
  );
}
