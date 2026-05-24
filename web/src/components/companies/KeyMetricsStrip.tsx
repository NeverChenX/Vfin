import { buildRatios, formatPctRatio, formatRatio } from '@/lib/finance/ratios';
import type { CompanyFinancials, KeyMetricsRow } from '@/types/finance';

interface Props {
  company: CompanyFinancials;
}

interface Metric {
  label: string;
  cfa?: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}

function formatCap(v: number | null | undefined, currency: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const unit = currency === 'HKD' ? '港' : currency === 'USD' ? '美' : '元';
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)} 万亿${unit}`;
  if (abs >= 1e8) return `${(v / 1e8).toFixed(2)} 亿${unit}`;
  if (abs >= 1e4) return `${(v / 1e4).toFixed(2)} 万${unit}`;
  return `${v.toFixed(0)} ${unit}`;
}

export function KeyMetricsStrip({ company }: Props) {
  const rows: KeyMetricsRow[] = buildRatios(company);
  // 取最新年度（按 buildRatios 排序，最新在最前）
  const latest = rows.find((r) => r.period.granularity === 'Y') ?? rows[0];
  if (!latest) return null;

  const v = latest.values;
  const metricsCurrency = v.market_cap_currency ?? company.currency;

  const metrics: Metric[] = [
    {
      label: '市值',
      cfa: 'Market Cap',
      value: formatCap(v.market_cap, metricsCurrency),
      hint: `按 ${metricsCurrency} 计`,
      emphasis: true,
    },
    {
      label: 'P/E (TTM)',
      cfa: 'PE',
      value: formatRatio(v.pe_ttm),
      emphasis: true,
    },
    {
      label: 'P/B',
      cfa: 'PB',
      value: formatRatio(v.pb),
      emphasis: true,
    },
    {
      label: 'ROE',
      cfa: 'Return on Equity',
      value: formatPctRatio(v.roe),
      hint: '归母净利润 / 归母股东权益',
      emphasis: true,
    },
    {
      label: 'ROA',
      cfa: 'Return on Assets',
      value: formatPctRatio(v.roa),
      hint: '净利润 / 总资产',
    },
    {
      label: '毛利率',
      cfa: 'Gross Margin',
      value: formatPctRatio(v.gross_margin),
    },
    {
      label: '净利率',
      cfa: 'Net Margin',
      value: formatPctRatio(v.net_margin),
    },
    {
      label: '股息率',
      cfa: 'Div. Yield',
      value: formatPctRatio(v.dividend_yield),
    },
  ];

  const yLabel = String(latest.period.year);

  return (
    <div className="mb-3 rounded border border-[var(--color-border-base)] bg-[var(--color-bg-elev2)] px-3 py-2">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
          关键指标 · {yLabel}
        </span>
        <span className="font-mono text-[10px] text-[var(--color-text-tertiary)] opacity-70">Key Metrics</span>
      </div>
      <div className="grid grid-cols-4 gap-x-4 gap-y-2 md:grid-cols-8">
        {metrics.map((m) => (
          <div key={m.label} title={m.hint}>
            <div className="flex items-baseline gap-1 text-[10px] text-[var(--color-text-tertiary)]">
              <span>{m.label}</span>
              {m.cfa && <span className="font-mono opacity-60">{m.cfa}</span>}
            </div>
            <div
              className={`num ${
                m.emphasis
                  ? 'text-[14px] font-semibold text-[var(--color-text-primary)]'
                  : 'text-[13px] text-[var(--color-text-secondary)]'
              }`}
            >
              {m.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
