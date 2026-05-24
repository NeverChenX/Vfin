'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { fetchAllLimited, fetchJSONSafe, startVisibilityPoll, QUOTE_POLL_MS } from '@/lib/poll';
import { ensurePortfolioSynced } from '@/lib/sync-once';
import type { WatchlistItem, QuoteSnapshot, WatchlistApiResponse } from '@/types/market';

interface LeftWatchlistPanelProps {
  /** 当前选中的 ticker（高亮 + 滚到可视区） */
  activeSymbol?: string;
  /** 切换股票时跳转到哪种页面：trade（行情） 或 research（财报）。默认 trade。 */
  mode?: 'trade' | 'research';
}


/**
 * 左侧自选股面板 — 在 /research 和首页之外的页面提供持续可见的 watchlist 上下文。
 * 跟 /hq-classic 经典版的 #LeftPanel 视觉一致：分组、紧凑、自动滚选中行。
 */
export function LeftWatchlistPanel({ activeSymbol, mode = 'trade' }: LeftWatchlistPanelProps) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, QuoteSnapshot>>({});
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      await ensurePortfolioSynced();
      const j = await fetchJSONSafe<WatchlistApiResponse>('/api/hq/watchlist');
      if (mounted) setItems(j?.items ?? []);
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    return startVisibilityPoll(async (signal) => {
      const res = await fetchAllLimited(items, (it) =>
        fetchJSONSafe<QuoteSnapshot>(`/api/hq/stock?symbol=${encodeURIComponent(it.symbol)}`, { signal }),
      );
      if (signal.aborted) return;
      setQuotes((p) => {
        const n = { ...p };
        res.forEach((q, i) => { if (q) n[items[i].symbol] = q; });
        return n;
      });
    }, QUOTE_POLL_MS);
  }, [items]);

  const grouped = useMemo(() => {
    const m = new Map<string, WatchlistItem[]>();
    for (const it of items) {
      const cat = it.category || '自选股';
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat)!.push(it);
    }
    return m;
  }, [items]);

  const rawCats = Array.from(grouped.keys());
  const cats = grouped.has('自选股')
    ? ['自选股', ...rawCats.filter((c) => c !== '自选股')]
    : rawCats;

  return (
    <aside className="flex h-full min-h-0 w-[220px] shrink-0 flex-col overflow-hidden border-r border-[var(--color-border-base)] bg-[var(--color-bg-elev1)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border-base)] px-3 py-2">
        <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">
          自选股
          <span className="ml-1.5 num text-[10px] text-[var(--color-text-tertiary)]">{items.length}</span>
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {cats.length === 0 ? (
          <div className="px-3 py-6 text-center text-[11px] text-[var(--color-text-tertiary)]">
            自选股为空
          </div>
        ) : (
          cats.map((cat) => {
            const list = grouped.get(cat)!;
            const collapsed = !!collapsedCats[cat];
            return (
              <div key={cat}>
                {cats.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setCollapsedCats((p) => ({ ...p, [cat]: !p[cat] }))}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-[10.5px] uppercase tracking-wider text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-elev2)]"
                  >
                    <span>{collapsed ? '▸' : '▾'} {cat}</span>
                    <span className="num text-[10px]">{list.length}</span>
                  </button>
                )}
                {!collapsed && (
                  <ul>
                    {list.map((it) => (
                      <WatchRow
                        key={it.symbol}
                        item={it}
                        quote={quotes[it.symbol]}
                        active={it.symbol === activeSymbol}
                        mode={mode}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

function WatchRow({
  item, quote, active, mode,
}: {
  item: WatchlistItem;
  quote?: QuoteSnapshot;
  active: boolean;
  mode: 'trade' | 'research';
}) {
  const hasQuote = !!quote?.price && quote.price > 0;
  const price = quote?.price ?? 0;
  const yclose = quote?.yclose ?? quote?.open ?? price;
  const change = price - yclose;
  const pct = yclose ? (change / yclose) * 100 : 0;
  const colorCls = !hasQuote ? 'text-flat' : change > 0 ? 'text-up' : change < 0 ? 'text-down' : 'text-flat';
  const name = quote?.name?.trim() || item.displayName?.trim() || item.symbol;
  const href = mode === 'research' ? `/research/${item.symbol}` : `/trade/${item.symbol}`;

  // 之前用 inline ref callback 在每次父重渲染（5s quotes 更新）都跑一次 scrollIntoView → 布局重排
  // 现在只在 active 状态变化时跑一次
  const liRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!active || !liRef.current) return;
    try { liRef.current.scrollIntoView({ block: 'nearest', behavior: 'auto' }); }
    catch { /* old browsers */ }
  }, [active]);

  return (
    <li
      ref={liRef}
      className={`${active ? 'bg-[var(--color-bg-elev3)] border-l-2 border-[var(--color-brand)]' : 'border-l-2 border-transparent'}`}
    >
      <Link href={href} className="flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-[var(--color-bg-elev2)]" prefetch={false}>
        <div className="min-w-0 flex-1">
          <div className={`truncate text-[12px] ${active ? 'text-[var(--color-text-primary)] font-semibold' : 'text-[var(--color-text-primary)]'}`}>
            {name}
          </div>
          <div className="num truncate text-[10px] text-[var(--color-text-tertiary)]">
            {item.symbol.toUpperCase()}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`num text-[11.5px] ${colorCls}`}>
            {hasQuote ? price.toFixed(2) : '--'}
          </div>
          <div className={`num text-[10px] ${colorCls}`}>
            {hasQuote ? (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '--'}
          </div>
        </div>
      </Link>
    </li>
  );
}
