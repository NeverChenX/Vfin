'use client';

import { useEffect, useState } from 'react';
import { fetchJSONSafe, startVisibilityPoll } from '@/lib/poll';
import { pctToHeatColor } from './color-mapping';
import { SHENWAN_INDUSTRIES } from './shenwan-symbols';
import type { SectorItem } from './types';

const POLL_MS = 30_000; // sectors-service 已在 gateway 缓存 30s，前端不必比它更密
const VALID_RATIO_THRESHOLD = 0.8;

// 数据源切换历史：
//   - 旧实现：前端并发 31 次 /api/hq/stock?symbol=801010.sh 之类申万指数代码，
//     而腾讯/新浪都不返回这些代码（v_pv_none_match），全部落 mock=0 → 全 "—"。
//   - 现实现：gateway /api/hq/sectors 走 push2delay 拉东财 BK 板块（申万一级 31 类
//     1:1 同名映射，闭市后返回收盘数据），一次请求拿齐 31 个，30s 缓存。
export function SectorHeatmap() {
  const [items, setItems] = useState<SectorItem[]>(
    SHENWAN_INDUSTRIES.map((s) => ({ code: s.code, name: s.name, pct: null }))
  );
  const [degraded, setDegraded] = useState(false);

  useEffect(() => startVisibilityPoll(async (signal) => {
    const json = await fetchJSONSafe<{ items: SectorItem[] }>(
      '/api/hq/sectors',
      { signal },
    );
    if (signal.aborted) return;
    const next = json?.items ?? [];
    if (next.length === 0) {
      setDegraded(true);
      return;
    }
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
