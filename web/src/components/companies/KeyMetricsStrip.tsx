import { buildRatios, formatPctRatio } from '@/lib/finance/ratios';
import { buildCurrentMarketMetrics } from '@/components/companies/key-metrics-market-data';
import type { CompanyFinancials, KeyMetricsRow, PeriodValues } from '@/types/finance';
import type { QuoteSnapshot } from '@/types/market';
import type { SotpCurrency } from '@/types/valuation';

interface Props {
  company: CompanyFinancials;
  liveQuote?: QuoteSnapshot | null;
}

interface Metric {
  label: string;
  cfa?: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
  tone?: 'up' | 'down' | 'neutral';
}

export async function KeyMetricsStrip({ company, liveQuote }: Props) {
  const rows: KeyMetricsRow[] = buildRatios(company);
  const latest = rows[0];
  const currentMarket = company.valuation?.currentMarketData;
  const currentMetrics = buildCurrentMarketMetrics(company, liveQuote);
  const reportValidated = company._validation?.passed === true;
  const latestIncome = latestStatement(company.statements.IS.periods);

  const pe = currentMetrics.peTtm;
  const pb = currentMetrics.pb;
  const dividendYield = pickRatio(rows, 'dividend_yield');
  const dividendStatus = pickDividendStatus(rows);
  const roe = pickRatio(rows, 'roe');
  const quotePrice = currentMetrics.price;
  const quoteYclose = liveQuote?.yclose;
  const quoteChange =
    quotePrice !== null && typeof quoteYclose === 'number' && Number.isFinite(quoteYclose) && quoteYclose > 0
      ? quotePrice - quoteYclose
      : null;
  const quoteChangePct = quoteChange !== null ? quoteChange / quoteYclose! : null;
  const marketMetrics: Metric[] = quotePrice !== null
    ? [
        {
          label: '最新价',
          value: formatPrice(quotePrice, marketCurrency(company)),
          hint: currentMetrics.asOf ? `实时行情 ${currentMetrics.asOf}` : '实时行情',
          emphasis: true,
        },
        {
          label: '涨跌幅',
          value: formatPct(quoteChangePct),
          hint: quoteChange !== null ? `涨跌 ${formatPrice(quoteChange, marketCurrency(company))}` : '缺少昨收，无法计算涨跌幅',
          tone: ((quoteChangePct ?? 0) >= 0 ? 'up' : 'down') as Metric['tone'],
        },
      ].filter((m) => m.value !== '—')
    : currentMarket
    ? [
        {
          label: '最新价',
          value: formatPrice(currentMarket.price, currentMarket.currency),
          hint: `截至 ${currentMarket.asOf}`,
          emphasis: true,
        },
        {
          label: '涨跌幅',
          value: formatPct(currentMarket.changePct),
          hint: `涨跌 ${formatPrice(currentMarket.change, currentMarket.currency)}`,
          tone: ((currentMarket.changePct ?? 0) >= 0 ? 'up' : 'down') as Metric['tone'],
        },
        {
          label: '当前市值',
          value: formatMoneyMillions(currentMarket.marketCap, currentMarket.currency),
          hint: currentMarket.note,
          emphasis: true,
        },
      ].filter((m) => m.value !== '—')
    : [];

  const reportMetrics: Metric[] = [
    {
      label: 'PE',
      cfa: 'P/E',
      value: formatPlainRatio(pe),
      hint:
        currentMetrics.marketMultiplesValidationStatus === 'verified'
          ? `实时行情 PE；双源校验：${currentMetrics.sources?.join(' + ') || 'Tencent + Eastmoney'}`
          : currentMetrics.marketMultiplesValidationStatus === 'degraded_single_source'
            ? `实时行情 PE；单源降级：${currentMetrics.sources?.join(' + ') || '公开行情源'}`
          : currentMetrics.marketMultiplesValidationStatus === 'unavailable'
            ? '实时行情 PE 暂无可用真实数据'
            : '使用缓存 PE；实时行情暂不可用',
      emphasis: true,
    },
    {
      label: 'PB',
      cfa: 'P/B',
      value: formatPlainRatio(pb),
      hint:
        currentMetrics.marketMultiplesValidationStatus === 'verified'
          ? `实时行情 PB；双源校验：${currentMetrics.sources?.join(' + ') || 'Tencent + Eastmoney'}`
          : currentMetrics.marketMultiplesValidationStatus === 'degraded_single_source'
            ? `实时行情 PB；单源降级：${currentMetrics.sources?.join(' + ') || '公开行情源'}`
          : currentMetrics.marketMultiplesValidationStatus === 'unavailable'
            ? '实时行情 PB 暂无可用真实数据'
            : '使用缓存 PB；实时行情暂不可用',
    },
    {
      label: 'ROE',
      cfa: 'Return on Equity',
      value: formatPctRatio(roe),
      hint: '归母净利润 / 归母股东权益；取最新可计算报表期',
    },
    {
      label: '净利润',
      cfa: 'Net Income',
      value: formatStatementMoney(latestIncome?.values.ni_parent ?? latestIncome?.values.net_income ?? null, company),
      hint: latestIncome ? `最新报表期 ${formatPeriod(latestIncome.period)}` : '最新报表期',
      emphasis: true,
      tone: ((latestIncome?.values.ni_parent ?? latestIncome?.values.net_income ?? 0) >= 0 ? 'neutral' : 'down') as Metric['tone'],
    },
    {
      label: '股息率',
      cfa: 'Dividend Yield',
      value: formatDividendYield(dividendYield, dividendStatus),
      hint:
        dividendStatus === 'none'
          ? '公开行情源与官方财报显示当前未派息'
          : '公开行情源 dividend yield',
    },
  ];

  const metrics = [...marketMetrics, ...reportMetrics];

  if (metrics.length === 0) return null;

  const title = currentMetrics.asOf
    ? `当前行情 · ${currentMetrics.asOf}`
    : currentMarket
    ? `当前行情 · ${currentMarket.asOf}`
    : latest
      ? `关键指标 · ${latest.period.year}`
      : '关键指标';
  const badge =
    currentMetrics.marketMultiplesValidationStatus === 'verified'
      ? 'PE/PB 双源已校验'
      : currentMetrics.marketMultiplesValidationStatus === 'degraded_single_source'
        ? 'PE/PB 单源降级'
      : currentMetrics.marketMultiplesValidationStatus === 'unavailable' && liveQuote
        ? 'PE/PB 暂不可用'
        : currentMarket?.validationStatus === 'degraded_single_source'
      ? '市值单源未完全验证'
      : reportValidated
        ? '报表双源已校验'
        : null;

  return (
    <div className="mb-3 rounded border border-[var(--color-border-base)] bg-[var(--color-bg-elev2)] px-3 py-2">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
          {title}
        </span>
        <span className="font-mono text-[10px] text-[var(--color-text-tertiary)] opacity-70">Key Metrics</span>
        {badge && (
          <span className="ml-auto rounded-sm border border-[#F0B90B]/40 px-1.5 py-0.5 text-[10px] text-[#F0B90B]">
            {badge}
          </span>
        )}
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
                m.tone === 'up'
                  ? 'text-[13px] font-semibold text-[var(--color-up)]'
                  : m.tone === 'down'
                    ? 'text-[13px] font-semibold text-[var(--color-down)]'
                    : m.emphasis
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

const NUM = new Intl.NumberFormat('zh-CN');

function periodSortKey(p: PeriodValues['period']): number {
  const off = p.granularity === 'H' ? (p.index ?? 0) * 2 : p.granularity === 'Q' ? (p.index ?? 0) : 4;
  return p.year * 10 + off;
}

function latestStatement(periods: PeriodValues[]): PeriodValues | null {
  const sorted = [...periods].sort((a, b) => periodSortKey(b.period) - periodSortKey(a.period));
  return sorted[0] ?? null;
}

function formatPeriod(p: PeriodValues['period']): string {
  if (p.granularity === 'Y') return `${p.year} 年报`;
  if (p.granularity === 'H') return `${p.year} H${p.index ?? ''}`;
  return `${p.year} Q${p.index ?? ''}`;
}

function pickRatio(rows: KeyMetricsRow[], key: keyof KeyMetricsRow['values']): number | null {
  for (const row of rows) {
    const v = row.values[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

function pickDividendStatus(rows: KeyMetricsRow[]): 'none' | 'unknown' | null {
  for (const row of rows) {
    const v = row.values.dividend_status;
    if (v === 'none' || v === 'unknown') return v;
  }
  return null;
}

function formatPlainRatio(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toFixed(2);
}

function formatDividendYield(v: number | null | undefined, status: 'none' | 'unknown' | null): string {
  if (status === 'none') return '无派息';
  return formatPctRatio(v);
}

function formatPrice(v: number | null | undefined, currency: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${currency} ${v.toFixed(2)}`;
}

function marketCurrency(company: CompanyFinancials): SotpCurrency {
  if (company.market === 'US') return 'USD';
  if (company.market === 'HK') return 'HKD';
  return 'CNY';
}

function formatPct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${(v * 100).toFixed(1)}%`;
}

function formatMoneyMillions(v: number | null | undefined, currency: SotpCurrency): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (currency === 'USD') {
    return Math.abs(v) >= 1000 ? `USD ${(v / 1000).toFixed(2)} B` : `USD ${NUM.format(Math.round(v))} M`;
  }
  const yi = v / 100;
  return `${currency} ${NUM.format(Math.round(yi))} 亿`;
}

function formatStatementMoney(v: number | null | undefined, company: CompanyFinancials): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const currency = company.currency === 'USD' ? 'USD' : company.currency === 'HKD' ? 'HKD' : 'CNY';
  if (company.unit === 'yuan') {
    return `${currency} ${formatYi(v / 100_000_000)} 亿`;
  }
  if (company.unit === 'wan') {
    return `${currency} ${formatYi(v / 10_000)} 亿`;
  }
  return `${currency} ${formatYi(v)} 亿`;
}

function formatYi(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 100) return NUM.format(Math.round(v));
  if (abs >= 10) return v.toFixed(1);
  return v.toFixed(2);
}
