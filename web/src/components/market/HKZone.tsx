'use client';

import { useEffect, useState } from 'react';
import { fetchAllLimited, fetchJSONSafe, startVisibilityPoll, QUOTE_POLL_MS } from '@/lib/poll';
import { pctToTextClass } from './color-mapping';
import type { Quote } from './types';

interface HKIndex {
  symbol: string;
  label: string;
}

const HK_INDICES: ReadonlyArray<HKIndex> = [
  { symbol: 'HSTECH.hk', label: '恒生科技' },
  { symbol: 'HSCEI.hk',  label: '国企指数' },
];

export function HKZone() {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  useEffect(() => startVisibilityPoll(async (signal) => {
    const res = await fetchAllLimited(HK_INDICES, (i) =>
      fetchJSONSafe<Quote>(`/api/hq/stock?symbol=${encodeURIComponent(i.symbol)}`, { signal }),
    );
    if (signal.aborted) return;
    setQuotes((prev) => {
      const next = { ...prev };
      res.forEach((q, i) => { if (q) next[HK_INDICES[i].symbol] = q; });
      return next;
    });
  }, QUOTE_POLL_MS), []);

  return (
    <div className="rounded-md border border-[var(--color-border-base)] bg-[var(--color-bg-elev1)] p-3 sm:p-4">
      <div className="mb-2 text-[11px] uppercase tracking-wider text-[var(--color-text-tertiary)]">港股专区</div>
      <div className="grid grid-cols-3 gap-2">
        {HK_INDICES.map((i) => <HKCard key={i.symbol} cfg={i} quote={quotes[i.symbol]} />)}
        <HKConnectPlaceholder />
      </div>
    </div>
  );
}

function HKCard({ cfg, quote }: { cfg: HKIndex; quote?: Quote }) {
  const hasQuote = quote?.price !== undefined && quote.price !== null && quote.price > 0;
  const price = quote?.price ?? 0;
  const yclose = quote?.yclose ?? price;
  const pct = hasQuote && yclose ? ((price - yclose) / yclose) * 100 : 0;
  const colorCls = pctToTextClass(hasQuote ? pct : null);
  const sign = pct > 0 ? '+' : '';
  return (
    <div className="rounded-sm bg-[var(--color-bg-elev2)] p-2">
      <div className="text-[11px] text-[var(--color-text-secondary)]">{cfg.label}</div>
      <div className={`num text-[14px] font-bold ${colorCls}`}>
        {hasQuote ? price.toFixed(2) : '--'}
      </div>
      <div className={`num text-[10px] ${colorCls}`}>
        {hasQuote ? `${sign}${pct.toFixed(2)}%` : '--'}
      </div>
    </div>
  );
}

function HKConnectPlaceholder() {
  return (
    <div className="flex flex-col rounded-sm border border-dashed border-[var(--color-border-base)] bg-[var(--color-bg-elev2)] p-2">
      <div className="text-[11px] text-[var(--color-text-secondary)]">港股通净流入</div>
      <div className="num mt-auto text-[12px] text-[var(--color-text-tertiary)]">暂不可用</div>
      <div className="text-[9px] text-[var(--color-text-disabled)]">Phase 2 接入</div>
    </div>
  );
}
