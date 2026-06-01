'use client';

import { useEffect, useState } from 'react';
import { fetchAllLimited, fetchJSONSafe, startVisibilityPoll, QUOTE_POLL_MS } from '@/lib/poll';
import { MiniSparkline } from '@/components/home/MiniSparkline';
import { pctToTextClass } from './color-mapping';
import type { Quote } from './types';

interface IndexConfig {
  symbol: string;
  label: string;
  marketBadge: 'SH' | 'HK' | 'SZ' | 'US';
  forceLabel?: boolean;
}

const INDICES: ReadonlyArray<IndexConfig> = [
  { symbol: '000001.sh', label: '上证指数', marketBadge: 'SH' },
  { symbol: 'HSI.hk',    label: '恒生指数', marketBadge: 'HK', forceLabel: true },
  { symbol: '399006.sz', label: '创业板指', marketBadge: 'SZ' },
  { symbol: 'IXIC.us',   label: '纳斯达克', marketBadge: 'US' },
];

export function MarketIndexCards() {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  useEffect(() => startVisibilityPoll(async (signal) => {
    const res = await fetchAllLimited(INDICES, (idx) =>
      fetchJSONSafe<Quote>(`/api/hq/stock?symbol=${encodeURIComponent(idx.symbol)}`, { signal }),
    );
    if (signal.aborted) return;
    setQuotes((prev) => {
      const next = { ...prev };
      res.forEach((q, i) => { if (q) next[INDICES[i].symbol] = q; });
      return next;
    });
  }, QUOTE_POLL_MS), []);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      {INDICES.map((idx) => (
        <Card key={idx.symbol} cfg={idx} quote={quotes[idx.symbol]} />
      ))}
    </div>
  );
}

function Card({ cfg, quote }: { cfg: IndexConfig; quote?: Quote }) {
  const hasQuote = quote?.price !== undefined && quote.price !== null && quote.price > 0;
  const price = quote?.price ?? 0;
  // yclose 必须真实存在；不允许 ?? price 兜底（会让 change=0、pct=0% 误导成"持平"）。
  const yclose = quote?.yclose;
  const hasYclose = typeof yclose === 'number' && yclose > 0;
  const hasChange = hasQuote && hasYclose;
  const change = hasChange ? price - yclose! : 0;
  const pct = hasChange ? (change / yclose!) * 100 : 0;
  const dir: 'up' | 'down' | 'flat' = !hasChange ? 'flat' : change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  const colorCls = pctToTextClass(hasChange ? pct : null);
  const sign = change > 0 ? '+' : '';

  return (
    <div className="group rounded-md border border-[var(--color-border-base)] bg-[var(--color-bg-elev1)] p-3 transition-colors hover:border-[var(--color-border-strong)] sm:p-4">
      <div className="flex items-center justify-between">
        <span className="truncate text-[12px] font-semibold text-[var(--color-text-secondary)] sm:text-[13px]">
          {cfg.forceLabel ? cfg.label : (quote?.name?.trim() || cfg.label)}
        </span>
        <span className="shrink-0 rounded bg-[var(--color-bg-elev2)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--color-text-tertiary)]">
          {cfg.marketBadge}
        </span>
      </div>
      <div className={`num mt-1.5 text-[18px] font-bold leading-tight sm:text-[22px] ${colorCls}`}>
        {hasQuote ? fmtPrice(price) : '--'}
      </div>
      <div className={`num mt-0.5 text-[11px] sm:text-[12px] ${colorCls}`}>
        {hasChange ? `${sign}${change.toFixed(2)}  ${sign}${pct.toFixed(2)}%` : '--'}
      </div>
      <div className="mt-2 -mx-1">
        <MiniSparkline symbol={cfg.symbol} dir={dir} width={120} height={30} />
      </div>
    </div>
  );
}

function fmtPrice(n: number): string {
  if (n >= 10000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toFixed(2);
}
