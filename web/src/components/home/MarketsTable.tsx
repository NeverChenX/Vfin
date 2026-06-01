'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { buildDisplayName, isAShare } from '@/lib/symbol-utils';
import { fetchJSONSafe, fetchAllLimited, startVisibilityPoll, QUOTE_POLL_MS } from '@/lib/poll';
import { ensurePortfolioSynced } from '@/lib/sync-once';
import { periodLabelFromDate } from '@/lib/finance/period';
import type { WatchlistItem, QuoteSnapshot, WatchlistApiResponse } from '@/types/market';
import { MiniSparkline } from './MiniSparkline';

export interface CompanyMeta {
  ticker: string;
  dataAsOf: string;
  expectedAsOf?: string;
  isStale: boolean;
  fetchedAt?: string;
  updatedAt?: string;
  // 真实"财报公告/披露日"，仅美股（SEC EDGAR `filed`）可用；
  // A 股 / 港股暂无 → 前端降级显示"同步 X 天前"
  latestFiledAt?: string;
}

interface Props {
  companies?: CompanyMeta[];
}

type SortKey = 'pct' | 'amount' | 'price' | null;

function candidateKeys(symbol: string): string[] {
  const s = symbol.trim();
  const out = new Set<string>([s, s.toLowerCase(), s.toUpperCase()]);
  if (/\.(sh|sz|bj|hk|us)$/i.test(s)) {
    const bare = s.replace(/\.[a-z]+$/i, '');
    out.add(bare);
    out.add(bare.toUpperCase());
    out.add(bare.toLowerCase());
  }
  return Array.from(out);
}

export function MarketsTable({ companies = [] }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, QuoteSnapshot>>({});
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeMarket, setActiveMarket] = useState<'all' | 'A' | 'HK' | 'US'>('all');
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filter, setFilter] = useState('');
  // 同步状态：symbol → 'pending' | 'success' | 'error: ...'
  const [syncState, setSyncState] = useState<Record<string, string>>({});
  const [syncToast, setSyncToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const companyByTicker = useMemo(() => {
    const map = new Map<string, CompanyMeta>();
    for (const c of companies) {
      for (const k of candidateKeys(c.ticker)) map.set(k, c);
    }
    return map;
  }, [companies]);

  // 单次 helper：把 ticker `01811.hk` / `TSLA.us` 等映射到 CompanyMeta
  const lookupCompany = (symbol: string): CompanyMeta | undefined => {
    return (
      companyByTicker.get(symbol) ||
      companyByTicker.get(symbol.toLowerCase()) ||
      companyByTicker.get(symbol.replace(/\.[a-z]+$/i, '')) ||
      companyByTicker.get(symbol.replace(/\.[a-z]+$/i, '').toUpperCase())
    );
  };

  const refresh = async () => {
    try {
      const json = await fetchJSONSafe<WatchlistApiResponse>('/api/hq/watchlist');
      setItems(json?.items ?? []);
      setErr(null);
    } catch (e: unknown) {
      setErr((e as Error).message ?? 'load failed');
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    // 全 tab 单例：保证整个会话只 sync-portfolio 一次
    ensurePortfolioSynced().finally(() => refresh());
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    return startVisibilityPoll(async (signal) => {
      const results = await fetchAllLimited(items, (it) =>
        fetchJSONSafe<QuoteSnapshot>(
          `/api/hq/stock?symbol=${encodeURIComponent(it.symbol)}`,
          { signal },
        ),
      );
      if (signal.aborted) return;
      setQuotes((prev) => {
        const next = { ...prev };
        results.forEach((q, i) => { if (q) next[items[i].symbol] = q; });
        return next;
      });
    }, QUOTE_POLL_MS);
  }, [items]);

  // 稳定 callback：避免每次 quotes 更新（5s）就让 Row 收到新引用从而 memo 失效
  const onRemove = useCallback(async (symbol: string) => {
    await fetch(`/api/hq/watchlist/${encodeURIComponent(symbol)}`, { method: 'DELETE' });
    refresh();
  }, []);

  // 同步：调 /api/fetch-company 抓取 / 刷新该股票的静态财报数据
  const onSync = useCallback(async (symbol: string, name?: string) => {
    const bare = symbol.replace(/\.[a-z]+$/i, '');
    setSyncState((p) => ({ ...p, [symbol]: 'pending' }));
    try {
      const res = await fetch('/api/fetch-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: bare, force: true }),
      });
      const data: { ticker?: string; message?: string; error?: string; source?: string } = await res.json();
      if (!res.ok) {
        const msg = data.error || `HTTP ${res.status}`;
        setSyncState((p) => ({ ...p, [symbol]: 'error' }));
        setSyncToast({ kind: 'err', text: `${name || symbol}：${msg}` });
        return;
      }
      setSyncState((p) => ({ ...p, [symbol]: 'success' }));
      setSyncToast({ kind: 'ok', text: `${data.ticker || bare} 已同步${data.source ? `（源：${data.source}）` : ''}` });
      // 重新拉服务端 RSC（companies 数据是 server-rendered 进来的）
      router.refresh();
    } catch (e: unknown) {
      setSyncState((p) => ({ ...p, [symbol]: 'error' }));
      setSyncToast({ kind: 'err', text: `${name || symbol}：${(e as Error).message || '网络错误'}` });
    }
  }, [router]);

  // 自动关闭 toast
  useEffect(() => {
    if (!syncToast) return;
    const t = setTimeout(() => setSyncToast(null), 4500);
    return () => clearTimeout(t);
  }, [syncToast]);

  // 全局统计：基于 watchlist 全集（不受分类/市场过滤影响），用于顶部状态条
  const overallStats = useMemo(() => {
    let synced = 0, stale = 0, missing = 0;
    for (const it of items) {
      const c = lookupCompany(it.symbol);
      if (!c) missing++;
      else if (c.isStale) stale++;
      else synced++;
    }
    return { total: items.length, synced, stale, missing };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, companyByTicker]);

  // ── 分类拆分 ────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const m = new Map<string, WatchlistItem[]>();
    for (const it of items) {
      const cat = it.category || '自选股';
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat)!.push(it);
    }
    return m;
  }, [items]);

  const rawCategories = useMemo(() => Array.from(grouped.keys()), [grouped]);
  const categories = grouped.has('自选股')
    ? ['自选股', ...rawCategories.filter((c) => c !== '自选股')]
    : rawCategories;
  const currentCat =
    (activeCategory && grouped.has(activeCategory) && activeCategory) ||
    (grouped.has('自选股') ? '自选股' : categories[0]);
  const baseList = grouped.get(currentCat) ?? [];

  // ── 市场分布统计（用于二级 Tab 计数 + 隐藏空市场） ────────
  const marketCounts = useMemo(() => {
    const c = { A: 0, HK: 0, US: 0, all: baseList.length };
    for (const it of baseList) {
      const lower = it.symbol.toLowerCase();
      if (/\.(sh|sz|bj)$/.test(lower)) c.A++;
      else if (/\.hk$/.test(lower)) c.HK++;
      else if (/\.us$/.test(lower)) c.US++;
    }
    return c;
  }, [baseList]);

  // 切换分类后，若当前 activeMarket 在新分类中 0 条，自动回退 'all'
  // 避免「我的持仓全是 HK，切到自选股仍选美股 → 空表」的死路
  const effectiveMarket: 'all' | 'A' | 'HK' | 'US' =
    activeMarket === 'all' || marketCounts[activeMarket] > 0 ? activeMarket : 'all';

  // ── 过滤 + 排序 ────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let arr = baseList;
    // 市场子分类
    if (effectiveMarket !== 'all') {
      arr = arr.filter((it) => {
        const lower = it.symbol.toLowerCase();
        if (effectiveMarket === 'A')  return /\.(sh|sz|bj)$/.test(lower);
        if (effectiveMarket === 'HK') return /\.hk$/.test(lower);
        if (effectiveMarket === 'US') return /\.us$/.test(lower);
        return true;
      });
    }
    if (q) {
      arr = arr.filter((it) => {
        const quote = quotes[it.symbol];
        const name = (quote?.name || it.displayName || '').toLowerCase();
        return it.symbol.toLowerCase().includes(q) || name.includes(q);
      });
    }
    if (sortKey) {
      arr = [...arr].sort((a, b) => {
        const qa = quotes[a.symbol];
        const qb = quotes[b.symbol];
        const va = valueOf(qa, sortKey);
        const vb = valueOf(qb, sortKey);
        return sortDir === 'asc' ? va - vb : vb - va;
      });
    }
    return arr;
  }, [baseList, effectiveMarket, filter, quotes, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(k);
      setSortDir('desc');
    }
  };

  // ── render ─────────────────────────────────────────────────
  if (!loaded) {
    return <div className="px-4 py-16 text-center text-[var(--color-text-tertiary)]">加载自选股…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--color-border-base)] bg-[var(--color-bg-elev1)] px-6 py-16 text-center text-[var(--color-text-tertiary)]">
        <p className="text-[14px]">自选股为空</p>
        <p className="mt-2 text-[12px]">用顶部搜索框找股票并加入自选</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[var(--color-border-base)] bg-[var(--color-bg-elev1)]">
      {/* 财报数据同步状态条 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--color-border-base)] px-3 py-2 text-[11.5px] sm:px-4">
        <span className="font-semibold text-[var(--color-text-secondary)]">财报数据</span>
        <span className="text-[var(--color-text-tertiary)]">
          总数 <span className="num text-[var(--color-text-primary)]">{overallStats.total}</span>
        </span>
        <span className="text-[var(--color-text-tertiary)]">
          · 已同步 <span className="num text-[var(--color-up)]">{overallStats.synced}</span>
        </span>
        <span className="text-[var(--color-text-tertiary)]">
          · 待更新 <span className="num text-[var(--color-down)]">{overallStats.stale}</span>
        </span>
        <span className="text-[var(--color-text-tertiary)]">
          · 无数据 <span className="num text-[var(--color-text-disabled)]">{overallStats.missing}</span>
        </span>
        {(overallStats.stale > 0 || overallStats.missing > 0) && (
          <span className="ml-auto text-[10.5px] text-[var(--color-text-tertiary)]">
            操作列点 <b className="text-[var(--color-brand)]">抓取</b> / <b className="text-[var(--color-down)]">更新</b> 触发同步
          </span>
        )}
      </div>

      {/* 分类 Tab + 搜索 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border-base)] px-2 py-2 sm:px-4">
        <div className="flex flex-1 min-w-0 items-center gap-1 overflow-x-auto">
          {categories.map((cat) => {
            const active = cat === currentCat;
            const count = grouped.get(cat)!.length;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => { setActiveCategory(cat); setSortKey(null); }}
                className={[
                  'shrink-0 rounded-md px-3 py-1.5 text-[13px] transition-colors',
                  active
                    ? 'bg-[var(--color-bg-elev3)] text-[var(--color-text-primary)] font-semibold'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elev2)] hover:text-[var(--color-text-primary)]',
                ].join(' ')}
              >
                {cat}
                <span className={`num ml-1.5 text-[11px] ${active ? 'text-[var(--color-brand)]' : 'text-[var(--color-text-tertiary)]'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="代码 / 名称过滤"
          className="h-8 w-full max-w-[200px] rounded border border-[var(--color-border-base)] bg-[var(--color-bg-elev2)] px-2.5 text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-brand)] focus:outline-none sm:w-[200px]"
          aria-label="过滤"
        />
      </div>

      {/* 二级：市场子分类（A股 / 港股 / 美股 / 全部） */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--color-border-base)] px-2 py-1.5 sm:px-4">
        {(
          [
            { key: 'all', label: '全部',  count: marketCounts.all },
            { key: 'A',   label: 'A 股',  count: marketCounts.A },
            { key: 'HK',  label: '港股',  count: marketCounts.HK },
            { key: 'US',  label: '美股',  count: marketCounts.US },
          ] as const
        ).filter((m) => m.key === 'all' || m.count > 0).map((m) => {
          const active = effectiveMarket === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setActiveMarket(m.key)}
              className={[
                'shrink-0 rounded px-2.5 py-1 text-[11.5px] transition-colors',
                active
                  ? 'bg-[var(--color-brand)] text-[var(--color-bg-base)] font-semibold'
                  : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-elev2)] hover:text-[var(--color-text-primary)]',
              ].join(' ')}
            >
              {m.label}
              <span className={`num ml-1 text-[10.5px] ${active ? 'text-[var(--color-bg-base)]/70' : 'text-[var(--color-text-disabled)]'}`}>
                {m.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px]">
          <thead>
            <tr className="border-b border-[var(--color-border-base)] text-[11px] text-[var(--color-text-tertiary)]">
              <Th align="left" w="180px">名称 / 代码</Th>
              <Th align="right" w="100px" sortable active={sortKey==='price'} dir={sortDir} onClick={() => toggleSort('price')}>最新价</Th>
              <Th align="right" w="100px" sortable active={sortKey==='pct'} dir={sortDir} onClick={() => toggleSort('pct')}>今日 涨跌幅</Th>
              <Th align="right" w="90px" cls="hidden md:table-cell">今日 最高</Th>
              <Th align="right" w="90px" cls="hidden md:table-cell">今日 最低</Th>
              <Th align="right" w="110px" sortable active={sortKey==='amount'} dir={sortDir} onClick={() => toggleSort('amount')} cls="hidden lg:table-cell">今日 成交额</Th>
              <Th align="left"  w="130px" cls="hidden lg:table-cell">财报数据</Th>
              <Th align="center" w="130px" cls="hidden sm:table-cell">近 30 日</Th>
              <Th align="right" w="100px">操作</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => (
              <Row
                key={it.symbol}
                item={it}
                quote={quotes[it.symbol]}
                company={lookupCompany(it.symbol)}
                onRemove={onRemove}
                onSync={onSync}
                syncStatus={syncState[it.symbol]}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-[12px] text-[var(--color-text-tertiary)]">
                  无匹配结果
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {err && (
        <div className="border-t border-[var(--color-border-base)] px-3 py-1 text-[11px] text-[var(--color-down)]">
          {err}
        </div>
      )}

      {/* Sync toast (右下角) */}
      {syncToast && (
        <div
          role="status"
          className={`fixed bottom-4 right-4 z-50 max-w-[360px] rounded-md border px-3 py-2 text-[12px] shadow-lg ${
            syncToast.kind === 'ok'
              ? 'border-[var(--color-up)]/40 bg-[var(--color-bg-elev2)] text-[var(--color-up)]'
              : 'border-[var(--color-down)]/40 bg-[var(--color-bg-elev2)] text-[var(--color-down)]'
          }`}
        >
          {syncToast.text}
          <button
            type="button"
            onClick={() => setSyncToast(null)}
            className="ml-3 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function valueOf(q: QuoteSnapshot | undefined, key: NonNullable<SortKey>): number {
  if (!q) return -Infinity;
  if (key === 'price') return q.price ?? 0;
  if (key === 'amount') return q.amount ?? 0;
  if (key === 'pct') {
    const base = q.yclose ?? q.open ?? 0;
    if (!base || !q.price) return 0;
    return ((q.price - base) / base) * 100;
  }
  return 0;
}

function Th({
  children, align, w, cls = '', sortable, active, dir, onClick,
}: {
  children: React.ReactNode;
  align: 'left' | 'right' | 'center';
  w?: string;
  cls?: string;
  sortable?: boolean;
  active?: boolean;
  dir?: 'asc' | 'desc';
  onClick?: () => void;
}) {
  const alignCls = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  const base = `px-3 py-2.5 font-normal whitespace-nowrap ${alignCls} ${cls}`;
  if (sortable) {
    return (
      <th style={w ? { width: w } : undefined} className={base}>
        <button
          type="button"
          onClick={onClick}
          className={`inline-flex items-center gap-1 hover:text-[var(--color-text-primary)] ${active ? 'text-[var(--color-text-primary)]' : ''}`}
        >
          {children}
          <span className={`text-[9px] ${active ? 'text-[var(--color-brand)]' : 'text-[var(--color-text-disabled)]'}`}>
            {active ? (dir === 'asc' ? '▲' : '▼') : '↕'}
          </span>
        </button>
      </th>
    );
  }
  return <th style={w ? { width: w } : undefined} className={base}>{children}</th>;
}

interface RowProps {
  item: WatchlistItem;
  quote?: QuoteSnapshot;
  company?: CompanyMeta;
  onRemove: (symbol: string) => void;
  onSync: (symbol: string, name?: string) => void;
  syncStatus?: string;
}

// 稳定包装 onRemove 调用，避免每个 Row 一个 inline arrow（会击破 memo）
const Row = memo(function RowImpl({
  item, quote, company, onRemove, onSync, syncStatus,
}: RowProps) {
  const handleRemove = () => onRemove(item.symbol);
  const hasQuote = !!quote?.price && quote.price > 0;
  const price = quote?.price ?? 0;
  // yclose 严格要求真实存在。不允许 ?? open ?? price 兜底 —— open 是当日开盘价
  // ≠ 昨收，price 兜底会让 change 永远 = 0，渲染成假的"+0.00%"。
  // 没有 yclose 就显示 `--`（用户看到 -- 会去查，看到 0% 会误判持平）。
  const yclose = quote?.yclose;
  const hasYclose = typeof yclose === 'number' && yclose > 0;
  const hasChange = hasQuote && hasYclose;
  const change = hasChange ? price - yclose! : 0;
  const pct = hasChange ? (change / yclose!) * 100 : 0;
  const dir: 'up' | 'down' | 'flat' = !hasChange ? 'flat' : change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  const colorCls = dir === 'up' ? 'text-up' : dir === 'down' ? 'text-down' : 'text-flat';
  const { primary, secondary } = buildDisplayName(item.symbol, quote?.name);
  const aShare = isAShare(item.symbol);
  const showsSymbolAsName = primary === item.symbol.toUpperCase();
  const marketTag = marketTagOf(item.symbol);

  return (
    <tr className="group border-b border-[var(--color-border-base)] transition-colors last:border-b-0 hover:bg-[var(--color-bg-elev2)]">
      <td className="px-3 py-2.5">
        <Link href={`/trade/${item.symbol}`} className="flex items-center gap-2 min-w-0">
          {/* 市场标签（A股/港股/美股），按市场配色 */}
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9.5px] font-semibold leading-[14px] ${marketTagClass(marketTag)}`}
            title={marketTagFull(marketTag)}
          >
            {marketTag}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className={`truncate text-[13px] font-medium ${showsSymbolAsName ? 'text-[var(--color-text-tertiary)]' : 'text-[var(--color-text-primary)]'}`}>
                {primary}
              </span>
              {!aShare && secondary && (
                <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">{secondary}</span>
              )}
            </div>
            <div className="num truncate text-[10.5px] text-[var(--color-text-tertiary)]">
              {item.symbol.toUpperCase()}
            </div>
          </div>
        </Link>
      </td>
      <td className={`px-3 py-2.5 num text-right text-[13px] ${colorCls}`}>
        {hasQuote ? price.toFixed(2) : '--'}
      </td>
      <td className="px-3 py-2.5 num text-right">
        {hasChange ? (
          <span
            className={`inline-flex items-center justify-end gap-1 rounded-md px-2 py-0.5 text-[12.5px] font-semibold ${
              dir === 'up' ? 'bg-up/10 text-up' : dir === 'down' ? 'bg-down/10 text-down' : 'text-flat'
            }`}
            style={dir === 'up' ? { backgroundColor: 'rgba(14,203,129,0.10)' } : dir === 'down' ? { backgroundColor: 'rgba(246,70,93,0.10)' } : undefined}
          >
            {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
          </span>
        ) : (
          <span className="text-[var(--color-text-disabled)]">--</span>
        )}
      </td>
      <td className="hidden px-3 py-2.5 num text-right text-[12.5px] text-[var(--color-text-secondary)] md:table-cell">
        {quote?.high ? quote.high.toFixed(2) : '--'}
      </td>
      <td className="hidden px-3 py-2.5 num text-right text-[12.5px] text-[var(--color-text-secondary)] md:table-cell">
        {quote?.low ? quote.low.toFixed(2) : '--'}
      </td>
      <td className="hidden px-3 py-2.5 num text-right text-[12.5px] text-[var(--color-text-secondary)] lg:table-cell">
        {fmtAmount(quote?.amount)}
      </td>
      <td className="hidden px-3 py-2.5 text-[11px] lg:table-cell">
        <FinancialMeta company={company} />
      </td>
      <td className="hidden px-3 py-1.5 sm:table-cell">
        <div className="flex items-center justify-center">
          <MiniSparkline symbol={item.symbol} dir={dir} />
        </div>
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <SyncButton
          item={item}
          quote={quote}
          company={company}
          onSync={onSync}
          syncStatus={syncStatus}
        />
        {company ? (
          <Link
            href={`/research/${item.symbol}`}
            className="ml-2 inline-block rounded bg-[var(--color-brand)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-bg-base)] hover:bg-[var(--color-brand-hover)]"
            title="财报研究"
          >
            财报
          </Link>
        ) : (
          <span
            className="ml-2 inline-block cursor-not-allowed rounded bg-[var(--color-bg-elev3)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-text-disabled)]"
            title="尚无静态财报数据，请先抓取"
            aria-disabled="true"
          >
            财报
          </span>
        )}
        <Link
          href={`/trade/${item.symbol}`}
          className="ml-2 inline-block rounded bg-[var(--color-brand)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-bg-base)] hover:bg-[var(--color-brand-hover)]"
        >
          行情
        </Link>
        <button
          type="button"
          onClick={handleRemove}
          className="ml-2 text-[11px] text-[var(--color-text-tertiary)] opacity-0 transition-opacity hover:text-[var(--color-down)] group-hover:opacity-100"
          title="删除"
        >
          ✕
        </button>
      </td>
    </tr>
  );
});

// 市场分类标签
function marketTagOf(symbol: string): 'A股' | '港股' | '美股' | '其他' {
  const s = symbol.toLowerCase();
  if (/\.(sh|sz|bj)$/.test(s)) return 'A股';
  if (/\.hk$/.test(s)) return '港股';
  if (/\.us$/.test(s)) return '美股';
  return '其他';
}
function marketTagFull(tag: string): string {
  return tag === 'A股' ? 'A 股（沪/深/北）' : tag === '港股' ? '港股 HKEX' : tag === '美股' ? '美股 US' : '其他市场';
}
function marketTagClass(tag: string): string {
  // 三大市场统一金色徽标（保留品牌色一致性，避免与红绿涨跌色混淆）
  if (tag === 'A股' || tag === '港股' || tag === '美股') {
    return 'border border-[#F0B90B]/40 bg-[#F0B90B]/10 text-[#F0B90B]';
  }
  return 'border border-[var(--color-border-base)] bg-[var(--color-bg-elev2)] text-[var(--color-text-tertiary)]';
}

function SyncButton({
  item, quote, company, onSync, syncStatus,
}: {
  item: WatchlistItem;
  quote?: QuoteSnapshot;
  company?: CompanyMeta;
  onSync: (symbol: string, name?: string) => void;
  syncStatus?: string;
}) {
  const isPending = syncStatus === 'pending';
  const recentSuccess = syncStatus === 'success';
  const recentError = syncStatus === 'error';

  // 状态决定按钮形态：缺失 / 过期 / 新鲜
  let label: string;
  let cls: string;
  let title: string;
  if (!company) {
    label = '抓取';
    cls = 'border border-[var(--color-brand)]/50 text-[var(--color-brand)] hover:bg-[var(--color-brand)]/10';
    title = '该股票尚无财报数据，点击从数据源抓取';
  } else if (company.isStale) {
    label = '更新';
    cls = 'border border-[var(--color-down)]/40 text-[var(--color-down)] hover:bg-[var(--color-down)]/10';
    title = `财报已过期（期望 ${company.expectedAsOf || '?'}），点击更新`;
  } else {
    // 同步状态：fresh — 不显示按钮（避免干扰），保留 hover 同步入口
    label = '↻';
    cls = 'text-[var(--color-text-tertiary)] opacity-0 group-hover:opacity-100 hover:text-[var(--color-brand)]';
    title = '强制重新抓取（已是最新）';
  }

  if (isPending) {
    label = '抓取中…';
    cls = 'border border-[var(--color-border-strong)] text-[var(--color-text-tertiary)] cursor-not-allowed';
  } else if (recentSuccess) {
    label = '✓';
    cls = 'text-[var(--color-up)]';
  } else if (recentError) {
    label = '× 重试';
    cls = 'border border-[var(--color-down)]/40 text-[var(--color-down)] hover:bg-[var(--color-down)]/10';
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => onSync(item.symbol, quote?.name)}
      title={title}
      className={`inline-block rounded px-2 py-1 text-[11px] transition-colors ${cls}`}
    >
      {label}
    </button>
  );
}

function FinancialMeta({ company }: { company?: CompanyMeta }) {
  if (!company) return <span className="text-[var(--color-text-disabled)]">—</span>;
  const periodLabel = company.dataAsOf ? periodLabelFromDate(company.dataAsOf) : '—';
  const fetched = company.fetchedAt || company.updatedAt;
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="num inline-flex items-center gap-1"
        title={
          company.dataAsOf
            ? `财报期间末日：${company.dataAsOf}（≠ 公告/发布时间）`
            : undefined
        }
      >
        <span className="text-[10px] text-[var(--color-text-tertiary)]">数据期间</span>
        <span className={company.isStale ? 'text-[var(--color-down)]' : 'text-[var(--color-text-primary)]'}>
          {periodLabel}
        </span>
        {company.isStale && (
          <span
            className="rounded-sm border border-[var(--color-down)]/40 px-1 text-[9px] leading-[14px] text-[var(--color-down)]"
            style={{ backgroundColor: 'rgba(246,70,93,0.1)' }}
            title={`期望最新期：${company.expectedAsOf ?? '—'}`}
          >
            过期
          </span>
        )}
      </span>
      {company.latestFiledAt ? (
        <span
          className="num text-[10px] text-[var(--color-text-tertiary)]"
          title={`财报公告日（SEC EDGAR filed）：${company.latestFiledAt}`}
        >
          公告 {fmtAgo(company.latestFiledAt)}
        </span>
      ) : fetched ? (
        <span
          className="num text-[10px] text-[var(--color-text-tertiary)]"
          title={`上次本地同步时间：${new Date(fetched).toLocaleString('zh-CN')}（A 股/港股暂无公告日数据源）`}
        >
          同步 {fmtAgo(fetched)}
        </span>
      ) : null}
    </div>
  );
}


function fmtAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const day = 86400000;
  if (diff < 0) return new Date(iso).toLocaleDateString();
  if (diff < 3600000) return `${Math.max(1, Math.floor(diff / 60000))} 分钟前`;
  if (diff < day) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

function fmtAmount(n: number | undefined): string {
  if (!n) return '--';
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(2)}万`;
  return n.toFixed(0);
}
