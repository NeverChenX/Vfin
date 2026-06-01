'use client';

import { useEffect, useState } from 'react';
import { fetchAllLimited, fetchJSONSafe, startVisibilityPoll } from '@/lib/poll';
import { pctToHeatColor } from './color-mapping';
import { SHENWAN_INDUSTRIES } from './shenwan-symbols';
import type { Quote, SectorItem } from './types';

const POLL_MS = 10_000; // 见 spec 第 5 节
const VALID_RATIO_THRESHOLD = 0.8;

export function SectorHeatmap() {
  const [items, setItems] = useState<SectorItem[]>(
    SHENWAN_INDUSTRIES.map((s) => ({ code: s.code, name: s.name, pct: null }))
  );
  const [degraded, setDegraded] = useState(false);

  useEffect(() => startVisibilityPoll(async (signal) => {
    const res = await fetchAllLimited(SHENWAN_INDUSTRIES, (s) =>
      fetchJSONSafe<Quote>(`/api/hq/stock?symbol=${encodeURIComponent(s.code)}`, { signal }),
    );
    if (signal.aborted) return;
    const next: SectorItem[] = SHENWAN_INDUSTRIES.map((s, i) => {
      const q = res[i];
      if (!q || q.price === undefined || q.yclose === undefined || !q.yclose) {
        return { code: s.code, name: s.name, pct: null };
      }
      return { code: s.code, name: s.name, pct: ((q.price - q.yclose) / q.yclose) * 100 };
    });
    const validCount = next.filter((x) => x.pct !== null).length;
    setDegraded(validCount / next.length < VALID_RATIO_THRESHOLD);
    setItems(next);
  }, POLL_MS), []);

  return (
    <div className="rounded-md border border-[var(--color-border-base)] bg-[var(--color-bg-elev1)] p-3 sm:p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-wider text-[var(--color-text-tertiary)]">A 股行业热度</span>
        {degraded && (
          <span
            className="text-[10px] text-[var(--color-down)]"
            title="申万一级行业指数（801xxx.sh）：腾讯/新浪不提供该代码的行情，仅 eastmoney push2 支持；当前网络拉不到 push2 → 全部行业显示 — 。换网络或接入 akshare/tushare 可解。"
          >
            数据源不可达
          </span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-1 sm:grid-cols-6 lg:grid-cols-8">
        {items.map((s) => (
          <div
            key={s.code}
            title={`${s.name} ${s.pct === null ? 'N/A' : (s.pct >= 0 ? '+' : '') + s.pct.toFixed(2) + '%'}`}
            className="rounded-sm px-1.5 py-1 text-white"
            style={{ background: pctToHeatColor(s.pct) }}
          >
            <div className="truncate text-[10px] font-medium leading-tight">{s.name}</div>
            <div className="num text-[9px] opacity-90">
              {s.pct === null ? '—' : `${s.pct >= 0 ? '+' : ''}${s.pct.toFixed(1)}%`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
