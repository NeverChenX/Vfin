# 首页"市场"模块重设计 · Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把首页「市场」改成 5 层 Bento 布局（核心指数+sparkline / 行业热力图+市场宽度 / 港股专区 / 跨市场带 / 自选股表），用 Phase 1 现有 gateway 能力完成 frontend，没数据的位置显示"暂不可用"占位。

**Architecture:** 全部新组件放 `web/src/components/market/`；纯逻辑（颜色映射、widget state）抽出 `.ts` 文件方便 TDD；UI 组件保持 'use client'，沿用现有 `fetchAllLimited` / `startVisibilityPoll` / `fetchJSONSafe` poll 模式；不引入新依赖（vitest 已是 gateway 在用，给 web 也加一份）。

**Tech Stack:** Next.js 15、React 19、TypeScript、Tailwind 4、vitest（新加 devDep）；服务端走现有 `gateway/src/routes/market-routes.js` 提供的 `/api/hq/stock` 和 `/api/hq/kline`。

**Spec reference:** `docs/superpowers/specs/2026-05-26-market-dashboard-redesign-design.md`

---

## File Structure

### Create (web)

```
web/vitest.config.ts                            # 测试配置
web/src/components/market/
├── types.ts                                    # 共享类型
├── color-mapping.ts                            # pct → tailwind 颜色等级（纯函数）
├── color-mapping.test.ts                       # TDD
├── widget-state.ts                             # WidgetState 类型 + helpers
├── widget-state.test.ts                        # TDD
├── shenwan-symbols.ts                          # 申万一级行业 31 个 symbol + 名称
├── MarketIndexCards.tsx                        # L1
├── SectorHeatmap.tsx                           # L2-L
├── MarketBreadth.tsx                           # L2-R (Phase 1 = placeholder)
├── HKZone.tsx                                  # L3
└── CrossMarketStrip.tsx                        # L4
```

### Modify

```
web/package.json                                # 加 "test": "vitest run" + devDeps
web/src/app/page.tsx                            # 重构 5 层引用
```

### Delete

```
web/src/components/home/MarketCards.tsx         # 被 MarketIndexCards 取代
```

### Untouched (just imported)

```
web/src/components/home/MarketsTable.tsx        # L5 保留
web/src/components/home/MiniSparkline.tsx       # 复用
web/src/lib/poll.ts                             # 复用
```

---

## Task 1: 安装 vitest 给 web

**Files:**
- Modify: `web/package.json`
- Create: `web/vitest.config.ts`

- [ ] **Step 1: 安装 vitest（仅 web，最小化）**

Run:
```bash
cd web && pnpm add -D vitest@^3.1.4
```
Expected: 添加一个 devDependency，不引入其他包

- [ ] **Step 2: 创建 vitest 配置**

Create `web/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
```

- [ ] **Step 3: 加 npm script**

Modify `web/package.json` scripts 部分，加一行：
```json
{
  "scripts": {
    "test": "vitest run"
  }
}
```

- [ ] **Step 4: 验证空配置能跑**

Run: `cd web && pnpm test`
Expected: `No test files found` 类似输出（exit 0 或 exit 1 无所谓，重点是 vitest 自身没崩）

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/pnpm-lock.yaml web/vitest.config.ts
git commit -m "chore(web): add vitest for unit tests"
```

---

## Task 2: 共享类型 types.ts

**Files:**
- Create: `web/src/components/market/types.ts`

- [ ] **Step 1: 写类型**

Create `web/src/components/market/types.ts`:
```typescript
/**
 * 首页市场模块的共享类型。
 * 与 web/src/types/market.ts 的 QuoteSnapshot 兼容；这里聚焦 dashboard 视图需要的最小集合。
 */

export interface Quote {
  symbol: string;
  name?: string;
  price?: number;
  yclose?: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  amount?: number;
}

/** 行业 / 板块 cell */
export interface SectorItem {
  code: string;     // 申万指数 symbol，如 '801010.sh'
  name: string;     // '农林牧渔'
  pct: number | null; // null = 拿不到
}

/** 市场宽度数据（Phase 1 = 占位 / null） */
export interface BreadthData {
  total: number;
  up: number;
  flat: number;
  down: number;
  limitUp: number;
  limitDown: number;
}

/** 港股专区 */
export interface HKConnectData {
  southboundNet: number | null;     // 元
  southboundDays: number | null;
  northboundNet: number | null;
}

/** 跨市场带的一格 */
export interface CrossMarketItem {
  symbol: string;
  label: string;
  pct: number | null;
  price?: number;        // 对 FX/商品有意义
  highlight?: boolean;   // 重点标识（USDCNY / USDJPY）
}
```

- [ ] **Step 2: 验证 TypeScript 不报错**

Run: `cd web && pnpm tsc --noEmit`
Expected: 没有新增类型错误

- [ ] **Step 3: Commit**

```bash
git add web/src/components/market/types.ts
git commit -m "feat(market): add shared types for market dashboard widgets"
```

---

## Task 3: 颜色映射工具（TDD）

**Files:**
- Create: `web/src/components/market/color-mapping.ts`
- Test: `web/src/components/market/color-mapping.test.ts`

- [ ] **Step 1: 写失败测试**

Create `web/src/components/market/color-mapping.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { pctToHeatColor, pctToTextClass } from './color-mapping';

describe('pctToHeatColor', () => {
  it('returns brightest green for strongly positive pct (>=3)', () => {
    expect(pctToHeatColor(3.5)).toBe('#0ECB81');
    expect(pctToHeatColor(10)).toBe('#0ECB81');
  });

  it('returns brightest red for strongly negative pct (<= -3)', () => {
    expect(pctToHeatColor(-3.2)).toBe('#c33645');
    expect(pctToHeatColor(-10)).toBe('#c33645');
  });

  it('returns neutral gray for near-zero pct', () => {
    expect(pctToHeatColor(0)).toBe('#4a525e');
    expect(pctToHeatColor(0.05)).toBe('#4a525e');
    expect(pctToHeatColor(-0.05)).toBe('#4a525e');
  });

  it('returns mid-green for mildly positive pct', () => {
    expect(pctToHeatColor(1.0)).toBe('#2f9d6b');
    expect(pctToHeatColor(2.0)).toBe('#2f9d6b');
  });

  it('returns null-safe gray when pct is null', () => {
    expect(pctToHeatColor(null)).toBe('#2B3139');
  });
});

describe('pctToTextClass', () => {
  it('returns text-up for positive', () => {
    expect(pctToTextClass(1.2)).toBe('text-up');
  });
  it('returns text-down for negative', () => {
    expect(pctToTextClass(-0.5)).toBe('text-down');
  });
  it('returns text-flat for zero / null', () => {
    expect(pctToTextClass(0)).toBe('text-flat');
    expect(pctToTextClass(null)).toBe('text-flat');
  });
});
```

- [ ] **Step 2: Run test — should fail**

Run: `cd web && pnpm test -- color-mapping`
Expected: FAIL with "cannot find module './color-mapping'"

- [ ] **Step 3: Implement**

Create `web/src/components/market/color-mapping.ts`:
```typescript
/**
 * 把涨跌幅 pct（%）映射到 7 档热力色 + null（不可用）。
 * 色阶与设计文档第 2 节的 wireframe 一致。
 */

const HEAT_COLORS = {
  n3: '#c33645',  // <= -3
  n2: '#c95464',  // (-3, -2]
  n1: '#8b5060',  // (-2, -0.1)
  z:  '#4a525e',  // [-0.1, 0.1]
  p1: '#4d7a64',  // (0.1, 1)
  p2: '#2f9d6b',  // [1, 3)
  p3: '#0ECB81',  // >= 3
  unavailable: '#2B3139',
} as const;

export function pctToHeatColor(pct: number | null): string {
  if (pct === null || Number.isNaN(pct)) return HEAT_COLORS.unavailable;
  if (pct >= 3) return HEAT_COLORS.p3;
  if (pct >= 1) return HEAT_COLORS.p2;
  if (pct > 0.1) return HEAT_COLORS.p1;
  if (pct >= -0.1) return HEAT_COLORS.z;
  if (pct > -2) return HEAT_COLORS.n1;
  if (pct > -3) return HEAT_COLORS.n2;
  return HEAT_COLORS.n3;
}

export function pctToTextClass(pct: number | null): 'text-up' | 'text-down' | 'text-flat' {
  if (pct === null || Number.isNaN(pct) || pct === 0) return 'text-flat';
  return pct > 0 ? 'text-up' : 'text-down';
}
```

- [ ] **Step 4: Run test — should pass**

Run: `cd web && pnpm test -- color-mapping`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/components/market/color-mapping.ts web/src/components/market/color-mapping.test.ts
git commit -m "feat(market): add pct→color mapping for heatmap and text"
```

---

## Task 4: Widget state machine helpers（TDD）

**Files:**
- Create: `web/src/components/market/widget-state.ts`
- Test: `web/src/components/market/widget-state.test.ts`

- [ ] **Step 1: 写失败测试**

Create `web/src/components/market/widget-state.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { reduceWidgetState, initialWidgetState, type WidgetState } from './widget-state';

describe('widget-state machine', () => {
  it('starts in loading', () => {
    expect(initialWidgetState().kind).toBe('loading');
  });

  it('transitions loading → success on first successful payload', () => {
    const next = reduceWidgetState(initialWidgetState(), { type: 'success', data: { v: 1 } });
    expect(next.kind).toBe('success');
    expect((next as Extract<WidgetState<{v:number}>, {kind:'success'}>).data).toEqual({ v: 1 });
  });

  it('transitions loading → error if first 3 polls all fail', () => {
    let s = initialWidgetState<number>();
    s = reduceWidgetState(s, { type: 'error' });
    s = reduceWidgetState(s, { type: 'error' });
    expect(s.kind).toBe('loading'); // 还没达到 3 次
    s = reduceWidgetState(s, { type: 'error' });
    expect(s.kind).toBe('error');
  });

  it('transitions success → stale after 3 consecutive errors', () => {
    let s = initialWidgetState<number>();
    s = reduceWidgetState(s, { type: 'success', data: 42 });
    s = reduceWidgetState(s, { type: 'error' });
    s = reduceWidgetState(s, { type: 'error' });
    s = reduceWidgetState(s, { type: 'error' });
    expect(s.kind).toBe('stale');
    expect((s as Extract<WidgetState<number>, {kind:'stale'}>).data).toBe(42);
  });

  it('stale → success on successful payload (recovery)', () => {
    let s = initialWidgetState<number>();
    s = reduceWidgetState(s, { type: 'success', data: 1 });
    s = reduceWidgetState(s, { type: 'error' });
    s = reduceWidgetState(s, { type: 'error' });
    s = reduceWidgetState(s, { type: 'error' });
    expect(s.kind).toBe('stale');
    s = reduceWidgetState(s, { type: 'success', data: 2 });
    expect(s.kind).toBe('success');
  });

  it('resets error counter on each success', () => {
    let s = initialWidgetState<number>();
    s = reduceWidgetState(s, { type: 'success', data: 1 });
    s = reduceWidgetState(s, { type: 'error' });
    s = reduceWidgetState(s, { type: 'error' });
    s = reduceWidgetState(s, { type: 'success', data: 2 });
    s = reduceWidgetState(s, { type: 'error' });
    s = reduceWidgetState(s, { type: 'error' });
    expect(s.kind).toBe('success'); // 不应该 stale
  });
});
```

- [ ] **Step 2: Run test — should fail**

Run: `cd web && pnpm test -- widget-state`
Expected: FAIL with "cannot find module './widget-state'"

- [ ] **Step 3: Implement**

Create `web/src/components/market/widget-state.ts`:
```typescript
/**
 * Widget 四态机：loading → success ↔ stale → error。
 * 见 spec 第 6 节"四态显示规则"。
 *
 * 规则：
 *  - 任何成功 → kind: 'success', errorCount: 0
 *  - 错误累计 ≥ 3：从 loading 转 error；从 success/stale 转 stale（保留旧 data）
 *  - 错误累计 < 3：保留当前 kind 但更新 errorCount
 */

const STALE_THRESHOLD = 3;

export type WidgetState<T> =
  | { kind: 'loading'; errorCount: number }
  | { kind: 'success'; data: T; errorCount: number }
  | { kind: 'stale'; data: T; errorCount: number }
  | { kind: 'error'; errorCount: number };

export type WidgetAction<T> =
  | { type: 'success'; data: T }
  | { type: 'error' };

export function initialWidgetState<T>(): WidgetState<T> {
  return { kind: 'loading', errorCount: 0 };
}

export function reduceWidgetState<T>(
  state: WidgetState<T>,
  action: WidgetAction<T>,
): WidgetState<T> {
  if (action.type === 'success') {
    return { kind: 'success', data: action.data, errorCount: 0 };
  }
  const nextErrors = state.errorCount + 1;
  if (state.kind === 'loading') {
    return nextErrors >= STALE_THRESHOLD
      ? { kind: 'error', errorCount: nextErrors }
      : { kind: 'loading', errorCount: nextErrors };
  }
  if (state.kind === 'error') {
    return { kind: 'error', errorCount: nextErrors };
  }
  // success or stale
  if (nextErrors >= STALE_THRESHOLD) {
    return { kind: 'stale', data: state.data, errorCount: nextErrors };
  }
  return { kind: state.kind, data: state.data, errorCount: nextErrors };
}
```

- [ ] **Step 4: Run test — should pass**

Run: `cd web && pnpm test -- widget-state`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/components/market/widget-state.ts web/src/components/market/widget-state.test.ts
git commit -m "feat(market): add widget state machine (loading/success/stale/error)"
```

---

## Task 5: 申万一级行业 symbol 列表

**Files:**
- Create: `web/src/components/market/shenwan-symbols.ts`

- [ ] **Step 1: 写文件**

Create `web/src/components/market/shenwan-symbols.ts`:
```typescript
/**
 * 申万一级行业指数 31 个。
 * 代码格式：8010xx 等，归 sh 市场。
 * 命名按申万 2021 版（最新版有 31 类）。
 *
 * 用于 SectorHeatmap。Phase 1 客户端用 /api/hq/stock 并发拉这些 symbol，
 * 客户端聚合涨跌幅。如有效返回率 <80%，按 spec 第 4.3 节切换 Phase 2 服务端聚合。
 */

export interface ShenwanIndustry {
  code: string;  // 完整 symbol，如 '801010.sh'
  name: string;
}

export const SHENWAN_INDUSTRIES: ReadonlyArray<ShenwanIndustry> = [
  { code: '801010.sh', name: '农林牧渔' },
  { code: '801030.sh', name: '基础化工' },
  { code: '801040.sh', name: '钢铁' },
  { code: '801050.sh', name: '有色金属' },
  { code: '801080.sh', name: '电子' },
  { code: '801110.sh', name: '家用电器' },
  { code: '801120.sh', name: '食品饮料' },
  { code: '801130.sh', name: '纺织服饰' },
  { code: '801140.sh', name: '轻工制造' },
  { code: '801150.sh', name: '医药生物' },
  { code: '801160.sh', name: '公用事业' },
  { code: '801170.sh', name: '交通运输' },
  { code: '801180.sh', name: '房地产' },
  { code: '801200.sh', name: '商贸零售' },
  { code: '801210.sh', name: '社会服务' },
  { code: '801230.sh', name: '综合' },
  { code: '801710.sh', name: '建筑材料' },
  { code: '801720.sh', name: '建筑装饰' },
  { code: '801730.sh', name: '电力设备' },
  { code: '801740.sh', name: '国防军工' },
  { code: '801750.sh', name: '计算机' },
  { code: '801760.sh', name: '传媒' },
  { code: '801770.sh', name: '通信' },
  { code: '801780.sh', name: '银行' },
  { code: '801790.sh', name: '非银金融' },
  { code: '801880.sh', name: '汽车' },
  { code: '801890.sh', name: '机械设备' },
  { code: '801950.sh', name: '煤炭' },
  { code: '801960.sh', name: '石油石化' },
  { code: '801970.sh', name: '环保' },
  { code: '801980.sh', name: '美容护理' },
];
```

- [ ] **Step 2: TypeScript 验证**

Run: `cd web && pnpm tsc --noEmit`
Expected: 没有错误

- [ ] **Step 3: Commit**

```bash
git add web/src/components/market/shenwan-symbols.ts
git commit -m "feat(market): add Shenwan first-level industry index list"
```

---

## Task 6: L1 — MarketIndexCards（含 30 日 sparkline）

**Files:**
- Create: `web/src/components/market/MarketIndexCards.tsx`

`MiniSparkline` 已经存在（`web/src/components/home/MiniSparkline.tsx`），它接收 symbol 并自带 fetch 缓存。直接复用。

- [ ] **Step 1: 写组件**

Create `web/src/components/market/MarketIndexCards.tsx`:
```typescript
'use client';

import { useEffect, useState } from 'react';
import { fetchAllLimited, fetchJSONSafe, startVisibilityPoll, QUOTE_POLL_MS } from '@/lib/poll';
import { MiniSparkline } from '@/components/home/MiniSparkline';
import { pctToTextClass } from './color-mapping';
import type { Quote } from './types';

interface IndexConfig {
  symbol: string;
  label: string;
  marketBadge: 'SH' | 'HK' | 'SZ' | 'US';
  forceLabel?: boolean;
}

const INDICES: ReadonlyArray<IndexConfig> = [
  { symbol: '000001.sh', label: '上证指数', marketBadge: 'SH' },
  { symbol: 'HSI.hk',    label: '恒生指数', marketBadge: 'HK', forceLabel: true },
  { symbol: '399006.sz', label: '创业板指', marketBadge: 'SZ' },
  { symbol: 'IXIC.us',   label: '纳斯达克', marketBadge: 'US' },
];

export function MarketIndexCards() {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  useEffect(() => startVisibilityPoll(async (signal) => {
    const res = await fetchAllLimited(INDICES, (idx) =>
      fetchJSONSafe<Quote>(`/api/hq/stock?symbol=${encodeURIComponent(idx.symbol)}`, { signal }),
    );
    if (signal.aborted) return;
    setQuotes((prev) => {
      const next = { ...prev };
      res.forEach((q, i) => { if (q) next[INDICES[i].symbol] = q; });
      return next;
    });
  }, QUOTE_POLL_MS), []);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      {INDICES.map((idx) => (
        <Card key={idx.symbol} cfg={idx} quote={quotes[idx.symbol]} />
      ))}
    </div>
  );
}

function Card({ cfg, quote }: { cfg: IndexConfig; quote?: Quote }) {
  const hasQuote = quote?.price !== undefined && quote.price !== null && quote.price > 0;
  const price = quote?.price ?? 0;
  const yclose = quote?.yclose ?? price;
  const change = hasQuote ? price - yclose : 0;
  const pct = hasQuote && yclose ? (change / yclose) * 100 : 0;
  const dir: 'up' | 'down' | 'flat' = !hasQuote ? 'flat' : change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  const colorCls = pctToTextClass(hasQuote ? pct : null);
  const sign = change > 0 ? '+' : '';

  return (
    <div className="group rounded-md border border-[var(--color-border-base)] bg-[var(--color-bg-elev1)] p-3 transition-colors hover:border-[var(--color-border-strong)] sm:p-4">
      <div className="flex items-center justify-between">
        <span className="truncate text-[12px] font-semibold text-[var(--color-text-secondary)] sm:text-[13px]">
          {cfg.forceLabel ? cfg.label : (quote?.name?.trim() || cfg.label)}
        </span>
        <span className="shrink-0 rounded bg-[var(--color-bg-elev2)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--color-text-tertiary)]">
          {cfg.marketBadge}
        </span>
      </div>
      <div className={`num mt-1.5 text-[18px] font-bold leading-tight sm:text-[22px] ${colorCls}`}>
        {hasQuote ? fmtPrice(price) : '--'}
      </div>
      <div className={`num mt-0.5 text-[11px] sm:text-[12px] ${colorCls}`}>
        {hasQuote ? `${sign}${change.toFixed(2)}  ${sign}${pct.toFixed(2)}%` : '--'}
      </div>
      <div className="mt-2 -mx-1">
        <MiniSparkline symbol={cfg.symbol} dir={dir} width={120} height={30} />
      </div>
    </div>
  );
}

function fmtPrice(n: number): string {
  if (n >= 10000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toFixed(2);
}
```

- [ ] **Step 2: TypeScript 验证**

Run: `cd web && pnpm tsc --noEmit`
Expected: 没有错误

- [ ] **Step 3: 手动检视渲染**

Run: `cd web && pnpm dev`
打开浏览器 http://localhost:3000，应该看到：
- 旧 `MarketCards` 还在工作（暂未替换 page.tsx）
- 新组件文件已就位，等待 Task 11 集成

按 Ctrl+C 停止 dev。

- [ ] **Step 4: Commit**

```bash
git add web/src/components/market/MarketIndexCards.tsx
git commit -m "feat(market): MarketIndexCards (L1) — 4 indices + 30d sparkline"
```

---

## Task 7: L2-L — SectorHeatmap（申万行业热力图，客户端聚合）

**Files:**
- Create: `web/src/components/market/SectorHeatmap.tsx`

- [ ] **Step 1: 写组件**

Create `web/src/components/market/SectorHeatmap.tsx`:
```typescript
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
          <span className="text-[10px] text-[var(--color-text-tertiary)]">数据不完整</span>
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
```

- [ ] **Step 2: TypeScript 验证**

Run: `cd web && pnpm tsc --noEmit`
Expected: 没有错误

- [ ] **Step 3: Commit**

```bash
git add web/src/components/market/SectorHeatmap.tsx
git commit -m "feat(market): SectorHeatmap (L2-L) — Shenwan industry heatmap client aggregation"
```

---

## Task 8: L2-R — MarketBreadth（Phase 1 占位）

**Files:**
- Create: `web/src/components/market/MarketBreadth.tsx`

Phase 1 没有 gateway `/api/hq/breadth` endpoint。组件直接显示"暂不可用"占位，但布局空间和样式都按真实数据预留好，方便 Phase 2 接入。

- [ ] **Step 1: 写组件**

Create `web/src/components/market/MarketBreadth.tsx`:
```typescript
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
  const lhRatio = data.limitDown > 0 ? data.limitUp / data.limitDown : data.limitUp;

  return (
    <div className="rounded-md border border-[var(--color-border-base)] bg-[var(--color-bg-elev1)] p-3 sm:p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-wider text-[var(--color-text-tertiary)]">A 股市场宽度</span>
        {state.kind === 'stale' && (
          <span className="text-[10px] text-[var(--color-text-tertiary)]">数据偏旧</span>
        )}
      </div>
      <div className="num text-[18px] font-bold text-down">{data.down.toLocaleString()} 跌</div>
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
        <span>比 <span className="num text-up font-semibold">{lhRatio.toFixed(1)}×</span></span>
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
```

- [ ] **Step 2: TypeScript 验证**

Run: `cd web && pnpm tsc --noEmit`
Expected: 没有错误

- [ ] **Step 3: Commit**

```bash
git add web/src/components/market/MarketBreadth.tsx
git commit -m "feat(market): MarketBreadth (L2-R) with placeholder until Phase 2 endpoint"
```

---

## Task 9: L3 — HKZone

**Files:**
- Create: `web/src/components/market/HKZone.tsx`

Phase 1：HSTECH.hk + HSCEI.hk 用 `/api/hq/stock` 拉真实数据；港股通净流入显示"暂不可用"占位。

- [ ] **Step 1: 写组件**

Create `web/src/components/market/HKZone.tsx`:
```typescript
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
```

- [ ] **Step 2: TypeScript 验证**

Run: `cd web && pnpm tsc --noEmit`
Expected: 没有错误

- [ ] **Step 3: Commit**

```bash
git add web/src/components/market/HKZone.tsx
git commit -m "feat(market): HKZone (L3) — HSTECH/HSCEI live + 港股通 placeholder"
```

---

## Task 10: L4 — CrossMarketStrip

**Files:**
- Create: `web/src/components/market/CrossMarketStrip.tsx`

Phase 1：道指 / 纳指 / 标普 用 `.us` 后缀拉真实数据；日经 / DAX / FTSE / 黄金 / 原油 / USDCNY / USDJPY 显示占位（gateway 暂不支持）。

- [ ] **Step 1: 写组件**

Create `web/src/components/market/CrossMarketStrip.tsx`:
```typescript
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
```

- [ ] **Step 2: TypeScript 验证**

Run: `cd web && pnpm tsc --noEmit`
Expected: 没有错误

- [ ] **Step 3: Commit**

```bash
git add web/src/components/market/CrossMarketStrip.tsx
git commit -m "feat(market): CrossMarketStrip (L4) — US indices live, others placeholder"
```

---

## Task 11: 集成到 page.tsx + 删除老 MarketCards

**Files:**
- Modify: `web/src/app/page.tsx`
- Delete: `web/src/components/home/MarketCards.tsx`

- [ ] **Step 1: 重写 page.tsx**

Replace `web/src/app/page.tsx` content (full file):
```typescript
import { AppShell } from '@/components/shell/AppShell';
import { MarketIndexCards } from '@/components/market/MarketIndexCards';
import { SectorHeatmap } from '@/components/market/SectorHeatmap';
import { MarketBreadth } from '@/components/market/MarketBreadth';
import { HKZone } from '@/components/market/HKZone';
import { CrossMarketStrip } from '@/components/market/CrossMarketStrip';
import { MarketsTable } from '@/components/home/MarketsTable';
import { getAllCompanies } from '@/data/companies';
import { periodLabelFromDate } from '@/lib/finance/period';

export default function Home() {
  const companies = getAllCompanies();
  const latestDataAsOf = companies
    .map((c) => c.dataAsOf)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1) ?? '';
  const latestLabel = latestDataAsOf ? periodLabelFromDate(latestDataAsOf) : '—';
  const latestCount = latestDataAsOf
    ? companies.filter((c) => c.dataAsOf === latestDataAsOf).length
    : 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-[1400px] px-3 py-4 sm:px-6 sm:py-6">
        {/* 标题区 */}
        <section className="mb-3 sm:mb-4">
          <div className="flex flex-wrap items-baseline justify-between gap-y-1">
            <h1 className="text-[18px] font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-[22px]">
              市场
            </h1>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-[var(--color-text-tertiary)] sm:text-[12px]">
              <span>
                最新财报 <span className="num font-semibold text-[var(--color-text-primary)]">{latestLabel}</span>
                {latestDataAsOf && <span className="num ml-1">({latestDataAsOf})</span>}
                {latestCount > 0 && <span className="num ml-1 text-[var(--color-brand)]">· {latestCount} 家</span>}
              </span>
              <span className="text-[var(--color-border-strong)]">|</span>
              <span>自动刷新 · {new Date().toLocaleDateString('zh-CN')}</span>
            </div>
          </div>
        </section>

        {/* L1 · 核心指数 + 30 日 sparkline */}
        <section className="mb-4">
          <MarketIndexCards />
        </section>

        {/* L2 · A 股全景（双列：行业热力图 + 市场宽度）*/}
        <section className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
          <SectorHeatmap />
          <MarketBreadth />
        </section>

        {/* L3 · 港股专区 */}
        <section className="mb-4">
          <HKZone />
        </section>

        {/* L4 · 跨市场带 */}
        <section className="mb-4 sm:mb-6">
          <CrossMarketStrip />
        </section>

        {/* L5 · 自选股表 */}
        <section>
          <MarketsTable companies={companies} />
        </section>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: 删除老组件**

Run:
```bash
git rm web/src/components/home/MarketCards.tsx
```

- [ ] **Step 3: TypeScript + lint 验证**

Run:
```bash
cd web && pnpm tsc --noEmit && pnpm lint
```
Expected: 没有错误。如果有"未使用 import"等告警就修。

- [ ] **Step 4: Commit**

```bash
git add web/src/app/page.tsx
git commit -m "feat(market): integrate 5-layer Bento dashboard into homepage"
```

---

## Task 12: 手动 smoke test + 视觉收尾

**Files:** 无文件改动；仅验证

- [ ] **Step 1: 启动 gateway + web**

Two terminals:
```bash
cd gateway && pnpm dev
```
```bash
cd web && pnpm dev
```

- [ ] **Step 2: 打开 http://localhost:3000 检查**

逐层确认：
- [ ] L1 4 张指数卡正常显示 + sparkline 渲染
- [ ] L2-L 行业热力图 显示 ≥80% 行业有色块（如不达标，记录到 Phase 2 待办）
- [ ] L2-R 市场宽度 显示"暂不可用"占位（边框为 dashed）
- [ ] L3 港股专区 HSTECH / HSCEI 显示价格 + 港股通净流入显示"暂不可用"
- [ ] L4 跨市场带 美股 3 个有数据，其余 6 个显示"暂不可用"
- [ ] L5 自选股表 完整加载、分类筛选可用

- [ ] **Step 3: 移动断点检查**

DevTools 切到 375px、768px、1024px、1440px 各看一遍，记录布局破溃问题。

- [ ] **Step 4: 性能检查**

Lighthouse 跑一次 Desktop Performance：目标 ≥ 75（spec 第 12 节成功标准）。

- [ ] **Step 5: 若发现问题，单独 commit fix；若 OK 直接合到主干**

无需额外 commit；前面 11 个 commit 已可上线。

- [ ] **Step 6: 写一行 Phase 2 触发笔记**

如果 SectorHeatmap 的有效行业返回率 < 80%，在 spec 文件末尾追加：
```markdown

### Phase 2 触发记录
- 2026-MM-DD: 行业热力图客户端聚合有效率 X%，触发 Phase 2 服务端 endpoint。
```

---

## Self-Review（写完后自查）

### Spec coverage

| Spec 章节 | 实现 |
|----------|------|
| §2 L1 核心指数 + sparkline | Task 6 |
| §2 L2-L 行业热力图 | Task 5 + Task 7 |
| §2 L2-R 市场宽度 | Task 8（Phase 1 占位） |
| §2 L3 港股专区 | Task 9（指数 live + 港股通占位） |
| §2 L4 跨市场带 | Task 10（美股 live + 其余占位） |
| §2 L5 自选股表 | Task 11（保留原 MarketsTable） |
| §3 组件拆分 | Task 6-10 |
| §5 轮询频率 | 各 Task 实现：L1=5s, 行业=10s, 宽度=30s, 港股=5s, 跨市场=30s |
| §6 四态机 | Task 4 |
| §6 占位规则 | Task 8 / 9 / 10 实现 |
| §7 Phase 1 范围 | 全部 12 个 Task |

### Placeholder scan

无 "TBD" / "TODO" / "fill in"；所有代码块完整。Phase 2 占位是**设计上的占位 UI**（显式"暂不可用"），不是"待补充实现"。

### Type consistency

- `Quote` 接口在 Task 2 定义，Task 6/7/9/10 一致使用
- `SectorItem` 在 Task 2 定义，Task 7 用
- `BreadthData` 在 Task 2 定义，Task 8 用
- `CrossMarketItem` 在 Task 2 定义，Task 10 用
- `WidgetState` / `reduceWidgetState` 在 Task 4 定义，Task 8 用

### Scope check

Phase 1 全部前端（除 vitest 新 devDep），无 gateway / backend / DB 改动。Phase 2 应另起 plan（gateway endpoint + provider 扩展）。

---

## Out of scope（Phase 1 不做）

- `/api/hq/breadth` 新 endpoint —— Phase 2
- `/api/hq/hk-connect` 新 endpoint —— Phase 2
- `/api/hq/sectors` 服务端聚合 —— Phase 2（仅当 Task 12 触发）
- Sina provider 扩展 `.fx` / `.cm` 后缀 —— Phase 2
- symbol-normalizer 扩展 `.jp` / `.de` / `.uk` —— Phase 2
- Playwright E2E —— Phase 3
- 移动端 lazy-mount 优化 —— Phase 3
