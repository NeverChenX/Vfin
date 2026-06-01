'use client';

import { useEffect, useState } from 'react';
import { fetchJSONSafe, startVisibilityPoll } from '@/lib/poll';
import { initialWidgetState, reduceWidgetState, type WidgetState } from './widget-state';
import type { BreadthData } from './types';

const POLL_MS = 30_000;

export function MarketBreadth() {
  const [state, setState] = useState<WidgetState<BreadthData>>(initialWidgetState());

  useEffect(() => startVisibilityPoll(async (signal) => {
    const data = await fetchJSONSafe<BreadthData>(`/api/hq/breadth?market=cn`, { signal });
    if (signal.aborted) return;
    setState((s) => reduceWidgetState(s, data ? { type: 'success', data } : { type: 'error' }));
  }, POLL_MS), []);

  if (state.kind === 'loading') {
    return <BreadthSkeleton />;
  }
  if (state.kind === 'error') {
    return <BreadthUnavailable />;
  }
  // success or stale
  const data = state.data;
  const upRatio = data.total > 0 ? data.up / data.total : 0;
  const flatRatio = data.total > 0 ? data.flat / data.total : 0;
  const downRatio = data.total > 0 ? data.down / data.total : 0;
  // 涨停/跌停比：limitDown=0 时不能拿原始 limitUp 当比例值（会出现 "42.0×" 这种误导）。
  // 两者皆 0（休市/早盘）显示 '--'；否则显示真实比例（红涨绿跌：>1 上、<1 下）。
  const hasLimitData = data.limitUp > 0 || data.limitDown > 0;
  const lhDisplay = !hasLimitData
    ? '--'
    : data.limitDown > 0
      ? (data.limitUp / data.limitDown).toFixed(1) + '×'
      : '∞';
  const lhClass = !hasLimitData
    ? 'text-[var(--color-text-disabled)]'
    : data.limitUp > data.limitDown ? 'text-up' : data.limitUp < data.limitDown ? 'text-down' : 'text-[var(--color-text-secondary)]';

  // 主指标：显示市场主旋律（涨>跌 → "X 涨"；跌>涨 → "X 跌"；持平 → "持平 X"）。
  // 旧版固定写"X 跌"会让"3844 涨 / 1473 跌"的强势上涨日仍显示红色"1473 跌"，
  // 用户瞄一眼会误判市场情绪。
  const winning: 'up' | 'down' | 'flat' = data.up > data.down ? 'up' : data.up < data.down ? 'down' : 'flat';
  const headlineCount = winning === 'up' ? data.up : winning === 'down' ? data.down : data.flat;
  const headlineLabel = winning === 'up' ? '涨' : winning === 'down' ? '跌' : '持平';
  const headlineColor = winning === 'up' ? 'text-up' : winning === 'down' ? 'text-down' : 'text-[var(--color-text-primary)]';

  return (
    <div className="rounded-md border border-[var(--color-border-base)] bg-[var(--color-bg-elev1)] p-3 sm:p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-wider text-[var(--color-text-tertiary)]">A 股市场宽度</span>
        <div className="flex items-baseline gap-2">
          {data.partial && (
            <span
              className="text-[10px] text-[var(--color-down)]"
              title={`仅采到 ${data.seen ?? '?'}/${data.total} 只，其余按比例外推`}
            >
              数据不完整
            </span>
          )}
          {state.kind === 'stale' && (
            <span className="text-[10px] text-[var(--color-text-tertiary)]">数据偏旧</span>
          )}
        </div>
      </div>
      <div className={`num text-[18px] font-bold ${headlineColor}`}>{headlineCount.toLocaleString()} {headlineLabel}</div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-[var(--color-bg-elev2)]">
        <div className="bg-up" style={{ width: `${upRatio * 100}%` }} />
        <div style={{ width: `${flatRatio * 100}%`, background: '#5E6673' }} />
        <div className="bg-down" style={{ width: `${downRatio * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px]">
        <span className="num text-up">↑ {data.up.toLocaleString()}</span>
        <span className="num text-[var(--color-text-tertiary)]">— {data.flat.toLocaleString()}</span>
        <span className="num text-down">↓ {data.down.toLocaleString()}</span>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-dashed border-[var(--color-border-base)] pt-2 text-[11px]">
        <span>涨停 <span className="num text-up font-semibold">{data.limitUp}</span></span>
        <span>跌停 <span className="num text-down font-semibold">{data.limitDown}</span></span>
        <span>比 <span className={`num font-semibold ${lhClass}`}>{lhDisplay}</span></span>
      </div>
    </div>
  );
}

function BreadthSkeleton() {
  return (
    <div className="rounded-md border border-[var(--color-border-base)] bg-[var(--color-bg-elev1)] p-3 sm:p-4">
      <div className="mb-2 text-[11px] uppercase tracking-wider text-[var(--color-text-tertiary)]">A 股市场宽度</div>
      <div className="h-5 w-24 animate-pulse rounded bg-[var(--color-bg-elev2)]" />
      <div className="mt-2 h-2 animate-pulse rounded-full bg-[var(--color-bg-elev2)]" />
      <div className="mt-3 h-3 animate-pulse rounded bg-[var(--color-bg-elev2)]" />
    </div>
  );
}

function BreadthUnavailable() {
  return (
    <div className="flex h-full min-h-[120px] flex-col items-center justify-center rounded-md border border-dashed border-[var(--color-border-base)] bg-[var(--color-bg-elev1)] p-3 text-center sm:p-4">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-tertiary)]">A 股市场宽度</div>
      <div className="mt-2 text-[12px] text-[var(--color-text-tertiary)]">暂不可用</div>
      <div className="mt-1 text-[10px] text-[var(--color-text-disabled)]">需 Phase 2 接入</div>
    </div>
  );
}
