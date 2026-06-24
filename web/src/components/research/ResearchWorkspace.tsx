'use client';

import { useCallback, useEffect, useState } from 'react';
import { ResearchToolbar, defaultPeriodsCount } from '@/components/shell/ResearchToolbar';
import { StatementTabs } from '@/components/shell/StatementTabs';
import { StatementTable } from '@/components/statement/StatementTable';
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
  basePath?: string;
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
export function ResearchWorkspace({ company, ticker, basePath, initial }: Props) {
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
    const base = basePath ?? `/research/${encodeURIComponent(ticker)}`;
    const url = qs ? `${base}${base.includes('?') ? '&' : '?'}${qs}` : base;
    window.history.replaceState(null, '', url);
  }, [statementId, granularity, periodsCount, overlays, unit, ticker, basePath]);

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
