import type { ValuationConfig } from '@/types/valuation';
import { formatMoney, formatPct } from '@/lib/valuation/format';

interface Props {
  data: NonNullable<ValuationConfig['currentMarketData']>;
}

const N = new Intl.NumberFormat('zh-CN');

function formatPrice(v: number | null, currency: string): string {
  if (v === null || !Number.isFinite(v)) return '--';
  return `${currency} ${v.toFixed(2)}`;
}

function formatVolume(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '--';
  if (Math.abs(v) >= 100_000_000) return `${(v / 100_000_000).toFixed(2)} 亿股`;
  if (Math.abs(v) >= 10_000) return `${(v / 10_000).toFixed(0)} 万股`;
  return `${N.format(Math.round(v))} 股`;
}

export function CurrentMarketDataPanel({ data }: Props) {
  const degraded = data.validationStatus === 'degraded_single_source';

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">当前行情数据</h2>
          <p className="mt-1 text-xs text-gray-500">截至 {data.asOf}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
            degraded
              ? 'bg-amber-50 text-amber-700 ring-amber-200'
              : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
          }`}
        >
          {degraded ? '单源市值 · 未完全验证' : '已双源验证'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="最新价" value={formatPrice(data.price, data.currency)} />
        <Metric
          label="涨跌幅"
          value={formatPct(data.changePct)}
          tone={(data.changePct ?? 0) >= 0 ? 'up' : 'down'}
        />
        <Metric label="成交量" value={formatVolume(data.volume)} />
        <Metric label="当前市值" value={formatMoney(data.marketCap, data.currency)} />
      </div>

      {data.note && <p className="mt-3 text-xs text-amber-700">{data.note}</p>}
      <p className="mt-2 text-[11px] text-gray-500">来源：{data.sources.join(' / ')}</p>
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'up' | 'down';
}) {
  return (
    <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div
        className={`mt-1 text-base font-semibold tabular-nums ${
          tone === 'up' ? 'text-emerald-700' : tone === 'down' ? 'text-red-700' : 'text-gray-900'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
