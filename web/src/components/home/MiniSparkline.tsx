'use client';

import { useEffect, useState } from 'react';
import { fetchJSONSafe } from '@/lib/poll';

interface KLineItem {
  date?: string;
  close: number;
}

interface KLineResp {
  items?: KLineItem[];
}

interface Props {
  symbol: string;
  /** 用于配色判定：>=0 绿，<0 红。不传则按头尾自判。 */
  dir?: 'up' | 'down' | 'flat';
  width?: number;
  height?: number;
}

// 客户端 kline 共享缓存：同一 symbol 的 30 日日线在所有 Sparkline 实例间复用，
// 5 分钟 TTL，避免列表 N 行各自 fetch（gateway 也缓存了 60s，再叠一层省网络/CPU）。
const SPARK_TTL_MS = 5 * 60_000;
type SparkEntry = { values: number[] | null; promise: Promise<number[]> | null; t: number };
const sparkCache = new Map<string, SparkEntry>();

async function loadSpark(symbol: string, signal?: AbortSignal): Promise<number[]> {
  const cached = sparkCache.get(symbol);
  const now = Date.now();
  if (cached && cached.values && now - cached.t < SPARK_TTL_MS) return cached.values;
  if (cached?.promise) return cached.promise;

  const p = (async () => {
    const d = await fetchJSONSafe<KLineResp>(
      `/api/hq/kline?symbol=${encodeURIComponent(symbol)}&period=day&count=30`,
      { signal, timeoutMs: 6000 },
    );
    const items = d?.items ?? [];
    // 过滤 close <= 0：停牌日 / 数据缺失会让 close=0，参与 min/max 归一化后会画出
    // 直插到底的尖刺，把"短期回调"画成"崩盘"。金融图必须丢弃这些点。
    const values = items
      .map((i) => Number(i.close))
      .filter((n) => Number.isFinite(n) && n > 0);
    sparkCache.set(symbol, { values, promise: null, t: Date.now() });
    return values;
  })();
  sparkCache.set(symbol, { values: cached?.values ?? null, promise: p, t: now });
  return p;
}

/** 24h sparkline；按 30 日日线绘制。币安主页同款。 */
export function MiniSparkline({ symbol, dir, width = 110, height = 36 }: Props) {
  const [values, setValues] = useState<number[] | null>(() => sparkCache.get(symbol)?.values ?? null);

  useEffect(() => {
    let aborted = false;
    const ctrl = new AbortController();
    loadSpark(symbol, ctrl.signal).then((v) => {
      if (!aborted) setValues(v);
    }).catch(() => { /* timeout / abort — keep skeleton */ });
    return () => { aborted = true; ctrl.abort(); };
  }, [symbol]);

  if (values === null) {
    return (
      <svg width={width} height={height} aria-hidden="true">
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="var(--color-border-base)" strokeWidth="1" strokeDasharray="2 3" />
      </svg>
    );
  }

  if (values.length < 2) {
    return <svg width={width} height={height} aria-hidden="true" />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padY = 3;
  const innerH = height - padY * 2;

  const points = values.map((v, i) => ({
    x: (i / (values.length - 1)) * width,
    y: padY + (1 - (v - min) / range) * innerH,
  }));

  const trendUp = values[values.length - 1] >= values[0];
  const effDir = dir ?? (trendUp ? 'up' : 'down');
  const stroke = effDir === 'up' ? '#0ECB81' : effDir === 'down' ? '#F6465D' : '#848E9C';
  const fill   = effDir === 'up' ? 'rgba(14,203,129,0.18)' : effDir === 'down' ? 'rgba(246,70,93,0.18)' : 'rgba(132,142,156,0.18)';

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const first = points[0];
  const areaPath = `${path} L${last.x.toFixed(1)},${height - padY} L${first.x.toFixed(1)},${height - padY} Z`;

  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={areaPath} fill={fill} stroke="none" />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
