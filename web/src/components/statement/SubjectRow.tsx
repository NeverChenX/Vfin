import { Fragment } from 'react';
import { NumberFormat } from './NumberFormat';
import { Sparkline } from './Sparkline';
import { HelpPopover } from './HelpPopover';
// QoQ 与 YoY 用同一个公式（(curr-prev)/|prev|），共用 yoyDelta
import { yoyDelta, commonSizeRatio } from '@/lib/finance/analysis';
import { formatPercent } from '@/lib/finance/format';
import { evalFormula } from '@/lib/finance/formula';
import { getExplain } from '@/lib/finance/subject-explains';
import {
  findSamePeriodPriorYear,
  findPreviousPeriod,
  periodLabel,
} from '@/lib/finance/period';
import type {
  AnalysisOverlay,
  PeriodValues,
  RawUnit,
  SubjectMeta,
} from '@/types/finance';

interface SubjectRowProps {
  subject: SubjectMeta;
  periodsShownDesc: PeriodValues[]; // newest first
  allOfGran: PeriodValues[]; // chronological asc (for yoy/qoq lookup)
  overlays: ReadonlySet<AnalysisOverlay>;
  denomKey: string;
  sparklineSeries: Array<number | null>;
  rawUnit: RawUnit;
  displayUnit: RawUnit;
}

export function SubjectRow({
  subject,
  periodsShownDesc,
  allOfGran,
  overlays,
  denomKey,
  sparklineSeries,
  rawUnit,
  displayUnit,
}: SubjectRowProps) {
  const explain = getExplain(subject.id);
  return (
    <tr data-level={subject.level} data-kind={subject.kind}>
      <th
        scope="row"
        className="sticky-col label-col left-0 whitespace-nowrap"
        style={{ width: 220 }}
      >
        <span>{subject.zh}</span>
        <span
          className="ml-1 font-mono text-[10px] opacity-60"
          title={subject.cfaFull ?? subject.cfa}
        >
          ({subject.cfa})
        </span>
        <HelpPopover explain={explain} subjectZh={subject.zh} subjectCfa={subject.cfa} />
      </th>

      <td className="sticky-col label-col sparkline-divider px-2" style={{ left: 220, width: 100 }}>
        <Sparkline values={sparklineSeries} />
      </td>

      {periodsShownDesc.map((p, idx) => {
        const resolveValue = (vals: Record<string, number | null>): number | null => {
          let v = vals[subject.id] ?? null;
          if (v === null && (subject.kind === 'subtotal' || subject.kind === 'total') && subject.formula) {
            v = evalFormula(subject.formula, vals);
          }
          return v;
        };
        const value = resolveValue(p.values);
        const yoyMatch = findSamePeriodPriorYear(allOfGran, p.period);
        const qoqMatch = findPreviousPeriod(allOfGran, p.period);
        const priorYoy = yoyMatch ? resolveValue(yoyMatch.values) : null;
        const priorQoq = qoqMatch ? resolveValue(qoqMatch.values) : null;
        const isLatest = idx === 0 ? '1' : undefined;
        const denomValue = p.values[denomKey] ?? null;

        return (
          <Fragment key={periodLabel(p.period)}>
            <td
              data-latest={isLatest}
              data-latest-start={isLatest}
              data-period-start={idx === 0 ? undefined : '1'}
            >
              <NumberFormat value={value} rawUnit={rawUnit} displayUnit={displayUnit} />
            </td>

            {overlays.has('yoy') && (
              <td data-latest={isLatest} data-sub-col="yoy">
                <Delta value={yoyDelta(value, priorYoy)} />
              </td>
            )}

            {overlays.has('qoq') && (
              <td data-latest={isLatest} data-sub-col="qoq">
                <Delta value={yoyDelta(value, priorQoq)} />
              </td>
            )}

            {overlays.has('common') && (
              <td data-latest={isLatest} data-sub-col="common">
                <CommonRatio value={commonSizeRatio(value, denomValue)} />
              </td>
            )}
          </Fragment>
        );
      })}
    </tr>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="num text-[var(--color-text-disabled)]">—</span>;
  const tone =
    value > 0 ? 'text-[var(--color-up)]' :
    value < 0 ? 'text-[var(--color-down)]' :
    'text-[var(--color-text-tertiary)]';
  return <span className={`num text-[11.5px] ${tone}`}>{formatPercent(value, { signed: true })}</span>;
}

function CommonRatio({ value }: { value: number | null }) {
  if (value === null) return <span className="num text-[var(--color-text-disabled)]">—</span>;
  return <span className="num text-[11.5px] text-[var(--color-text-secondary)]">{formatPercent(value)}</span>;
}
