import type { CompanyFinancials } from '@/types/finance';
import {
  deriveRevenueSeries,
  deriveNetIncomeSeries,
  deriveGrossMarginSeries,
  deriveNetMarginSeries,
  yoy,
  type DerivedSeries,
} from '@/lib/valuation/derive';

interface Props {
  company: CompanyFinancials;
}

/**
 * 数字格式化（仅 panel 内部使用）：
 *   - 单位 million_yuan：≥100 → "X.XX 亿元"，否则 "X 亿"
 *   - 单位 million_usd：≥1000 → "X.XX B"，否则 "X M"
 */
function fmt(v: number | null, unit: 'million_yuan' | 'million_usd'): string {
  if (v === null || !Number.isFinite(v)) return '--';
  if (unit === 'million_usd') {
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(2)} B`;
    return `${Math.round(v).toLocaleString('en-US')} M`;
  }
  // million_yuan → 亿
  const yi = v / 100;
  if (Math.abs(yi) >= 100) return `${Math.round(yi).toLocaleString('en-US')} 亿`;
  return `${yi.toFixed(2)} 亿`;
}

function fmtPct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '--';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${(v * 100).toFixed(1)}%`;
}

function unitLabel(unit: 'million_yuan' | 'million_usd'): string {
  return unit === 'million_yuan' ? '人民币' : '美元';
}

export function FinancialFactsPanel({ company }: Props) {
  const revSeries = deriveRevenueSeries(company);
  const niSeries = deriveNetIncomeSeries(company);
  const gmSeries = deriveGrossMarginSeries(company);
  const nmSeries = deriveNetMarginSeries(company);
  const revYoY = yoy(revSeries);
  const niYoY = yoy(niSeries);

  const periods = revSeries.points.map((p) => p.period.year);
  const unit = revSeries.unit;

  if (periods.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        无年报数据可供派生。请检查公司 JSON 的{' '}
        <code className="rounded bg-amber-100 px-1">statements.IS.periods</code>。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">财务事实</h2>
          <p className="mt-0.5 text-[11px] text-gray-500">
            派生自报表 · 单位{unitLabel(unit)}（元）· 全部数字可追溯到报表字段
          </p>
        </div>
        <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-blue-200">
          ✓ 100% 派生
        </span>
      </div>

      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2 text-left font-medium">指标</th>
            {periods.map((y) => (
              <th key={y} className="px-3 py-2 text-right font-medium tabular-nums">
                {y}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          <SeriesRow label="营业收入" series={revSeries} format={(v) => fmt(v, unit)} />
          <SeriesRow
            label="营收 YoY"
            seriesValues={revYoY}
            format={fmtPct}
            tone="muted"
          />
          <SeriesRow label="归母净利润" series={niSeries} format={(v) => fmt(v, unit)} />
          <SeriesRow
            label="净利 YoY"
            seriesValues={niYoY}
            format={fmtPct}
            tone="muted"
          />
          <SeriesRow
            label="毛利率"
            seriesValues={gmSeries}
            format={fmtPct}
          />
          <SeriesRow
            label="净利率"
            seriesValues={nmSeries}
            format={fmtPct}
          />
        </tbody>
      </table>

      <div className="border-t border-gray-100 bg-gray-50 px-5 py-2 text-[11px] text-gray-500">
        派生公式：营收 = rev_total · 净利 = ni_parent · 毛利率 = gross_profit / rev_total · 净利率 = ni_parent /
        rev_total · YoY = (本期 − 上期) / |上期|
      </div>
    </div>
  );
}

function SeriesRow({
  label,
  series,
  seriesValues,
  format,
  tone,
}: {
  label: string;
  series?: DerivedSeries;
  seriesValues?: ReadonlyArray<{ value: number | null }>;
  format: (v: number | null) => string;
  tone?: 'muted';
}) {
  const points = series ? series.points : seriesValues ?? [];
  const labelCls = tone === 'muted' ? 'text-gray-500' : 'text-gray-900';
  const cellCls = tone === 'muted' ? 'text-gray-500' : 'text-gray-900';
  return (
    <tr>
      <td className={`px-4 py-2 font-medium ${labelCls}`}>{label}</td>
      {points.map((p, i) => (
        <td key={i} className={`px-3 py-2 text-right tabular-nums ${cellCls}`}>
          {format(p.value)}
        </td>
      ))}
    </tr>
  );
}
