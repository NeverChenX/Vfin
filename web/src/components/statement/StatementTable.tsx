import { Fragment } from 'react';
import { SubjectRow } from './SubjectRow';
import {
  filterByGranularity,
  takeLatest,
  periodLabel,
} from '@/lib/finance/period';
import { resolveDisplayUnit, unitLabel } from '@/lib/finance/format';
import { denomKeyForStatement } from '@/lib/finance/analysis';
import { STATEMENT_SCHEMAS } from '@/lib/finance/schemas';
import type {
  AnalysisOverlay,
  CompanyFinancials,
  DisplayUnit,
  PeriodGranularity,
  StatementId,
} from '@/types/finance';

interface StatementTableProps {
  company: CompanyFinancials;
  statementId: StatementId;
  granularity: PeriodGranularity;
  periodsCount: number;
  overlays: ReadonlySet<AnalysisOverlay>;
  displayUnit: DisplayUnit;
}

const OVERLAY_LABEL: Record<AnalysisOverlay, string> = {
  yoy: '同比',
  qoq: '环比',
  common: '占比',
};

export function StatementTable({
  company,
  statementId,
  granularity,
  periodsCount,
  overlays,
  displayUnit,
}: StatementTableProps) {
  const schema = STATEMENT_SCHEMAS[statementId];
  const { periods: rawPeriods } = company.statements[statementId];
  const allOfGran = filterByGranularity(rawPeriods, granularity);
  const shownAsc = takeLatest(allOfGran, periodsCount);
  const shownDesc = [...shownAsc].reverse(); // newest first
  const overlayList = (['yoy', 'qoq', 'common'] as AnalysisOverlay[]).filter((o) => overlays.has(o));
  const subColsPerPeriod = 1 + overlayList.length;
  const showSubHeader = overlayList.length > 0;

  if (shownDesc.length === 0) {
    return (
      <div className="rounded border border-dashed border-[var(--color-border-base)] bg-[var(--color-bg-elev2)] p-8 text-center text-sm text-[var(--color-text-tertiary)]">
        当前粒度下没有可用期间
      </div>
    );
  }

  // 自动单位：扫描所有展示数值
  let maxAbs = 0;
  for (const p of shownDesc) {
    for (const v of Object.values(p.values)) {
      if (v !== null && Number.isFinite(v)) {
        const abs = Math.abs(v);
        if (abs > maxAbs) maxAbs = abs;
      }
    }
  }
  const resolvedUnit = resolveDisplayUnit(displayUnit, maxAbs, company.unit);
  const denomKey = denomKeyForStatement(statementId);

  return (
    <div className="bg-[var(--color-bg-elev2)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-border-base)] px-1 py-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">{schema.zhName}</span>
          <span className="font-mono text-[10.5px] text-[var(--color-text-tertiary)]">{schema.cfaName}</span>
        </div>
        <div className="flex items-baseline gap-2 text-[10.5px] text-[var(--color-text-tertiary)]">
          <span>单位 <b className="font-semibold text-[var(--color-text-secondary)]">{unitLabel(resolvedUnit, company.currency)}</b></span>
          <span>·</span>
          <span>{shownDesc.length} 期</span>
          {overlayList.length > 0 && (
            <>
              <span>·</span>
              <span>{overlayList.map((o) => OVERLAY_LABEL[o]).join(' / ')}</span>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="dt" style={{ minWidth: 320 + 100 + shownDesc.length * subColsPerPeriod * 90 }}>
          <thead>
            <tr>
              <th
                scope="col"
                rowSpan={showSubHeader ? 2 : 1}
                className="sticky-col label-col left-0"
                style={{ minWidth: 220, width: 220 }}
              >
                科目 / Subject
              </th>
              <th
                scope="col"
                rowSpan={showSubHeader ? 2 : 1}
                className="sticky-col label-col sparkline-divider"
                style={{ left: 220, minWidth: 100, width: 100 }}
              >
                趋势
              </th>
              {shownDesc.map((p, idx) => (
                <th
                  key={periodLabel(p.period)}
                  scope="col"
                  colSpan={subColsPerPeriod}
                  data-latest={idx === 0 ? '1' : undefined}
                  data-latest-start={idx === 0 ? '1' : undefined}
                  data-period-start={idx === 0 ? undefined : '1'}
                  className="text-center"
                  style={{ minWidth: subColsPerPeriod * 84 }}
                >
                  <div className="whitespace-nowrap font-semibold text-[var(--color-text-secondary)]">
                    {periodLabel(p.period)}
                    <span className="ml-1 text-[10px] font-normal text-[var(--color-text-tertiary)]">
                      {p.period.granularity === 'Y' ? '年报' : p.period.granularity === 'H' ? '半年报' : '季报'}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
            {showSubHeader && (
              <tr>
                {shownDesc.map((p, idx) => {
                  const isLatest = idx === 0 ? '1' : undefined;
                  return (
                    <Fragment key={periodLabel(p.period) + ':sub'}>
                      <th
                        data-latest={isLatest}
                        data-latest-start={isLatest}
                        data-period-start={idx === 0 ? undefined : '1'}
                        className="data-col text-[var(--color-text-secondary)]"
                        style={{ minWidth: 84, width: 84 }}
                      >
                        原值
                      </th>
                      {overlays.has('yoy') && (
                        <th data-latest={isLatest} data-sub-col="yoy" className="data-col text-[var(--color-text-secondary)]" style={{ minWidth: 70, width: 70 }}>
                          同比
                        </th>
                      )}
                      {overlays.has('qoq') && (
                        <th data-latest={isLatest} data-sub-col="qoq" className="data-col text-[var(--color-text-secondary)]" style={{ minWidth: 70, width: 70 }}>
                          环比
                        </th>
                      )}
                      {overlays.has('common') && (
                        <th data-latest={isLatest} data-sub-col="common" className="data-col text-[var(--color-text-secondary)]" style={{ minWidth: 70, width: 70 }}>
                          占比
                        </th>
                      )}
                    </Fragment>
                  );
                })}
              </tr>
            )}
          </thead>
          <tbody>
            {schema.subjects.map((subj) => {
              const sparklineSeries = allOfGran.map((p) => p.values[subj.id] ?? null);
              return (
                <SubjectRow
                  key={subj.id}
                  subject={subj}
                  periodsShownDesc={shownDesc}
                  allOfGran={allOfGran}
                  overlays={overlays}
                  denomKey={denomKey}
                  sparklineSeries={sparklineSeries}
                  rawUnit={company.unit}
                  displayUnit={resolvedUnit}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
