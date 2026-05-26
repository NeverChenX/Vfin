'use client';

import { useEffect, useState } from 'react';
import { fetchAllLimited, fetchJSONSafe, startVisibilityPoll } from '@/lib/poll';
import { pctToTextClass } from './color-mapping';
import type { Quote, CrossMarketItem } from './types';

const POLL_MS = 30_000;

interface SlotConfig {
  symbol: string;
  label: string;
  highlight?: boolean;
  /** Phase 1 可拉到数据 */
  liveInP1: boolean;
}

const SLOTS: ReadonlyArray<SlotConfig> = [
  // 美股 — Phase 1 可用
  { symbol: 'DJI.us',  label: '道指',   liveInP1: true },
  { symbol: 'IXIC.us', label: '纳指',   liveInP1: true },
  { symbol: 'INX.us',  label: '标普',   liveInP1: true },
  // 非美海外指数 — Phase 2
  { symbol: 'N225.jp', label: '日经',   liveInP1: false },
  { symbol: 'DAX.de',  label: 'DAX',    liveInP1: false },
  // 商品 — Phase 2
  { symbol: 'XAU.cm',  label: '黄金',   liveInP1: false },
  { symbol: 'CL.cm',   label: '原油',   liveInP1: false },
  // 汇率 — Phase 2，highlight
  { symbol: 'USDCNY.fx', label: 'USDCNY', highlight: true, liveInP1: false },
  { symbol: 'USDJPY.fx', label: 'USDJPY', highlight: true, liveInP1: false },
];

export function CrossMarketStrip() {
  const liveSlots = SLOTS.filter((s) => s.liveInP1);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  useEffect(() => startVisibilityPoll(async (signal) => {
    const res = await fetchAllLimited(liveSlots, (s) =>
      fetchJSONSafe<Quote>(`/api/hq/stock?symbol=${encodeURIComponent(s.symbol)}`, { signal }),
    );
    if (signal.aborted) return;
    setQuotes((prev) => {
      const next = { ...prev };
      res.forEach((q, i) => { if (q) next[liveSlots[i].symbol] = q; });
      return next;
    });
  }, POLL_MS), []);

  const items: CrossMarketItem[] = SLOTS.map((s) => {
    if (!s.liveInP1) {
      return { symbol: s.symbol, label: s.label, pct: null, highlight: s.highlight };
    }
    const q = quotes[s.symbol];
    if (!q || q.price === undefined || q.yclose === undefined || !q.yclose) {
      return { symbol: s.symbol, label: s.label, pct: null, highlight: s.highlight };
    }
    return {
      symbol: s.symbol,
      label: s.label,
      pct: ((q.price - q.yclose) / q.yclose) * 100,
      price: q.price,
      highlight: s.highlight,
    };
  });

  return (
    <div className="rounded-md border border-[var(--color-border-base)] bg-[var(--color-bg-elev1)] p-3 sm:p-4">
      <div className="mb-2 text-[11px] uppercase tracking-wider text-[var(--color-text-tertiary)]">全球指数 · 商品 · 汇率</div>
      <div className="flex gap-2 overflow-x-auto sm:grid sm:grid-cols-5 sm:overflow-visible lg:grid-cols-9">
        {items.map((it) => <Tile key={it.symbol} item={it} />)}
      </div>
    </div>
  );
}

function Tile({ item }: { item: CrossMarketItem }) {
  const available = item.pct !== null;
  const colorCls = pctToTextClass(item.pct);
  const sign = (item.pct ?? 0) > 0 ? '+' : '';
  const borderColor =
    item.highlight ? 'var(--color-brand)' :
    !available ? 'var(--color-border-strong)' :
    (item.pct ?? 0) >= 0 ? 'var(--color-up)' : 'var(--color-down)';
  return (
    <div
      className="min-w-[80px] shrink-0 rounded-sm bg-[var(--color-bg-elev2)] p-2"
      style={{ borderLeft: `2px solid ${borderColor}` }}
    >
      <div className="text-[10px] text-[var(--color-text-tertiary)]">{item.label}</div>
      {available ? (
        <div className={`num text-[13px] font-semibold ${colorCls}`}>
          {sign}{item.pct!.toFixed(2)}%
        </div>
      ) : (
        <div className="num text-[12px] text-[var(--color-text-tertiary)]">暂不可用</div>
      )}
    </div>
  );
}
