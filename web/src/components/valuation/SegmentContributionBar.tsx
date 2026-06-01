import type { SotpResult } from '@/types/valuation';
import { formatMoney, formatMultiple } from '@/lib/valuation/format';

interface Props {
  result: SotpResult;
}

interface Row {
  key: string;
  label: string;
  value: number;
  method: string;
  multiple: number | null;
  pct: number;
  color: string;
}

const COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-lime-500',
];

export function SegmentContributionBar({ result }: Props) {
  const rows: Row[] = [];
  const denominator = result.sotpTotal !== 0 ? result.sotpTotal : 1;

  let colorIdx = 0;
  for (const s of result.segments) {
    if (s.excluded || s.impliedValue === null) continue;
    rows.push({
      key: s.segment.id,
      label: s.segment.name,
      value: s.impliedValue,
      method: s.segment.method,
      multiple: s.peerMedian,
      pct: s.impliedValue / denominator,
      color: COLORS[colorIdx % COLORS.length],
    });
    colorIdx++;
  }

  if (result.netCash !== null && result.netCash !== 0) {
    rows.push({
      key: '__netcash__',
      label: '净现金',
      value: result.netCash,
      method: '—',
      multiple: null,
      pct: result.netCash / denominator,
      color: 'bg-slate-400',
    });
  }

  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.value)), 1);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-900">分部估值贡献</h2>
      <ul className="mt-4 space-y-2.5">
        {rows.map((r) => {
          const widthPct = Math.max(2, (Math.abs(r.value) / maxAbs) * 100);
          return (
            <li key={r.key} className="flex items-center gap-3 text-sm">
              <div className="w-24 shrink-0 truncate text-gray-700" title={r.label}>
                {r.label}
              </div>
              <div className="relative h-5 flex-1 rounded bg-gray-100">
                <div
                  className={`h-full rounded ${r.color}`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <div className="w-28 shrink-0 text-right tabular-nums text-gray-900">
                {formatMoney(r.value, result.currency)}
              </div>
              <div className="w-24 shrink-0 text-right text-xs text-gray-500">
                {r.method}
                {r.multiple !== null ? ` ${formatMultiple(r.multiple)}` : ''}
              </div>
              <div className="w-14 shrink-0 text-right text-xs text-gray-500 tabular-nums">
                {(r.pct * 100).toFixed(0)}%
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-sm font-medium">
        <span className="text-gray-700">SOTP 合计</span>
        <span className="tabular-nums text-gray-900">
          {formatMoney(result.sotpTotal, result.currency)}
        </span>
      </div>
    </div>
  );
}
