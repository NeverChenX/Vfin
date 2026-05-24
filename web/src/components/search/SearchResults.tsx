'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface SearchHit {
  symbol: string;
  name: string;
  market?: string;
  code?: string;
  typeLabel?: string;
}

interface SearchApiResponse {
  items?: SearchHit[];
  data?: SearchHit[];
  results?: SearchHit[];
}

interface Props {
  q: string;
}

export function SearchResults({ q }: Props) {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!q.trim()) {
      setHits([]);
      return;
    }
    setLoading(true);
    setErr(null);
    fetch(`/api/hq/search?q=${encodeURIComponent(q.trim())}&limit=30`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json();
      })
      .then((json: SearchApiResponse) => {
        setHits(json.items ?? json.data ?? json.results ?? []);
      })
      .catch((e: unknown) => setErr((e as Error).message ?? 'load failed'))
      .finally(() => setLoading(false));
  }, [q]);

  if (!q.trim()) {
    return <div className="px-6 py-12 text-center text-[var(--color-text-tertiary)]">请输入搜索关键词</div>;
  }
  if (loading) {
    return <div className="px-6 py-12 text-center text-[var(--color-text-tertiary)]">搜索中…</div>;
  }
  if (err) {
    return <div className="px-6 py-12 text-center text-[var(--color-down)]">{err}</div>;
  }
  if (hits.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-[var(--color-text-tertiary)]">
        没找到 “{q}” 相关结果
      </div>
    );
  }

  const grouped: Record<string, SearchHit[]> = {};
  for (const h of hits) {
    const m = (h.market ?? '其他').toUpperCase();
    (grouped[m] ??= []).push(h);
  }

  return (
    <div className="space-y-5">
      {Object.entries(grouped).map(([market, list]) => (
        <section key={market}>
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
            {market} · {list.length} 条
          </h2>
          <ul className="overflow-hidden rounded border border-[var(--color-border-base)]">
            {list.map((h) => (
              <li
                key={h.symbol}
                className="border-b border-[var(--color-border-base)] bg-[var(--color-bg-elev2)] hover:bg-[var(--color-bg-elev3)] last:border-b-0"
              >
                <Link
                  href={`/trade/${h.symbol}`}
                  className="flex items-center justify-between gap-3 px-4 py-2 text-[12.5px]"
                >
                  <span className="num text-[var(--color-brand)]">{h.symbol}</span>
                  <span className="flex-1 truncate text-[var(--color-text-primary)]">{h.name}</span>
                  {h.market && (
                    <span className="rounded bg-[var(--color-bg-elev1)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-tertiary)]">
                      {h.market}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
