'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface SearchHit {
  symbol: string;
  name: string;
  market?: string;
  code?: string;
  typeLabel?: string;
}

interface SearchApiResponse {
  // gateway 返回结构: {"items":[{symbol,name,market,...}]}
  items?: SearchHit[];
  data?: SearchHit[];
  results?: SearchHit[];
}

const DEBOUNCE_MS = 200;

export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q.trim()) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/hq/search?q=${encodeURIComponent(q.trim())}&limit=8`,
          { signal: ctrl.signal },
        );
        if (!res.ok) return;
        const json: SearchApiResponse = await res.json();
        const list = json.items ?? json.data ?? json.results ?? [];
        setHits(list.slice(0, 8));
        setActive(0);
      } catch (err: unknown) {
        if ((err as { name?: string }).name !== 'AbortError') {
          // network error: just clear hits silently
          setHits([]);
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const go = (symbol: string) => {
    setOpen(false);
    setQ('');
    router.push(`/trade/${symbol}`);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (hits[active]) go(hits[active].symbol);
      else if (q.trim()) {
        setOpen(false);
        router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative w-full max-w-[420px]">
      <input
        type="search"
        inputMode="search"
        placeholder="搜索股票代码 / 名称"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        // 移动端 16px 防止 iOS Safari 聚焦时自动放大
        className="h-9 w-full rounded border border-[var(--color-border-base)] bg-[var(--color-bg-elev2)] px-3 text-[16px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]/30 sm:h-8 sm:text-[12.5px]"
        aria-label="股票搜索"
      />
      {open && hits.length > 0 && (
        <div className="absolute left-0 right-0 top-[40px] z-50 max-h-[60vh] overflow-y-auto rounded border border-[var(--color-border-base)] bg-[var(--color-bg-elev2)] shadow-lg sm:top-[34px] sm:max-h-[360px]">
          {hits.map((h, i) => (
            <button
              key={`${h.symbol}-${i}`}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => go(h.symbol)}
              className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[12px] ${
                i === active
                  ? 'bg-[var(--color-bg-elev3)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elev3)]'
              }`}
            >
              <span className="num text-[12px] text-[var(--color-brand)]">{h.symbol}</span>
              <span className="flex-1 truncate">{h.name}</span>
              {h.market && (
                <span className="rounded bg-[var(--color-bg-elev1)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-tertiary)]">
                  {h.market}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
