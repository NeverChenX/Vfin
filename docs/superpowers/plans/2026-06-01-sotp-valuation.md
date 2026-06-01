# SOTP 估值评估模块 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 VFin 加一个独立的 SOTP 分部估值仪表盘 (`/valuation/[ticker]`)，判断一家公司当前估值是否合理。

**Architecture:** Server Component 取数据 → 纯函数 `computeSotp()` 算 → 展示组件接收已计算好的 `SotpResult`。所有 segment + peer 倍数手工维护在 `web/src/data/companies/*.json` 的新 `valuation` 字段。零网络往返。

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript · Tailwind v4 · Vitest (node env, src/**/*.test.ts) · SVG/CSS 自绘图表（不引入新依赖）

**Spec:** `docs/superpowers/specs/2026-06-01-sotp-valuation-design.md`

---

## File Structure

### 新建

| 路径 | 责任 |
|---|---|
| `web/src/types/valuation.ts` | 所有估值相关类型（`ValuationMethod`, `BusinessSegment`, `ValuationConfig`, `PeerMultiple`, `SegmentValuation`, `SotpResult`, `SotpCurrency`, `Verdict`） |
| `web/src/lib/valuation/verdict.ts` | `classifyVerdict(impliedUpsidePct)` → 5 档分类 + 文案 |
| `web/src/lib/valuation/__tests__/verdict.test.ts` | verdict 5 档边界单测 |
| `web/src/lib/valuation/sotp.ts` | `computeSegmentValuation()`, `computeSotp()` 纯函数 |
| `web/src/lib/valuation/__tests__/sotp.test.ts` | sotp 11 个核心单测（包括缺数据、单业务、多业务、净现金正负、单/偶 peer） |
| `web/src/lib/valuation/format.ts` | 大数本地化格式化：CNY/HKD 用"亿"，USD 用"B"；千分位 |
| `web/src/lib/valuation/__tests__/format.test.ts` | 格式化单测 |
| `web/src/app/valuation/[ticker]/page.tsx` | Server Component：取 company → 计算 SOTP → 渲染 |
| `web/src/components/valuation/ValuationHeader.tsx` | 顶部条：公司名/币种/返回研究页 |
| `web/src/components/valuation/ValuationVerdictCards.tsx` | 两张大卡：当前市值 vs SOTP 总估值 + verdict 徽标 |
| `web/src/components/valuation/SegmentContributionBar.tsx` | 横向叠加条形图（SVG/CSS） |
| `web/src/components/valuation/SegmentDetailTable.tsx` | 分部明细表，每行可展开看 peers |
| `web/src/components/valuation/SensitivityStrip.tsx` | ±20% peer 倍数敏感性条 |
| `web/src/components/valuation/DataCaveats.tsx` | 时点/局限说明区 |
| `web/src/components/valuation/EmptyState.tsx` | 公司未配 SOTP 数据时的友好降级 |

### 修改

| 路径 | 改动 |
|---|---|
| `web/src/types/finance.ts:86-104` | `CompanyFinancials` 加可选字段 `valuation?: ValuationConfig` |
| `web/src/data/companies/01810.json` | 加完整 `valuation`（4 段业务，多业务示范） |
| `web/src/data/companies/600519.json` | 加完整 `valuation`（单业务示范：白酒） |
| `web/src/data/companies/AAPL.json` | 加 `valuation`（多业务：硬件 + 服务） |
| `web/src/data/companies/TSLA.json` | 加 `valuation`（汽车 + 能源） |
| `web/src/data/companies/01811.json` | 加 `valuation`（智能家电 / 单业务退化） |
| `web/src/data/companies/003816.json` | 加 `valuation`（中广核 - 核电运营单业务） |
| `web/src/app/research/[ticker]/page.tsx` | 顶部右上角加 "估值评估 →" 链接按钮 |

### 不改

- Gateway 完全不动（无需新 API，纯数据在 JSON）
- `web/vitest.config.ts`（已用 `environment: 'node'`，纯逻辑测试匹配 `src/**/*.test.ts`）
- `web/scripts/check-data-completeness.mjs`（只校验报表核心字段，与新增 `valuation` 字段无关）

### 测试范围限制（MVP）

- ✅ 纯函数 (sotp / verdict / format) 全单测
- ❌ React 组件不写单测（需 jsdom + testing-library，新依赖，超 MVP 范围）
- ✅ 组件正确性通过手动 smoke 验证（每加一个组件就 `npm run dev` 看一次）

---

## Task 0: 准备工作

- [ ] **Step 0.1: 拉取最新 main，确认在分支上**

```bash
git status
# 应显示 On branch feat/market-dashboard-phase-2
# 若 spec/plan 已 commit，working tree clean
```

- [ ] **Step 0.2: 跑一遍现有测试确保 baseline 绿**

```bash
cd web && npm test 2>&1 | tail -20
```

预期：现有 2 个 test file (color-mapping, widget-state) 全部 pass。

---

## Task 1: 类型定义

**Files:**
- Create: `web/src/types/valuation.ts`
- Modify: `web/src/types/finance.ts:86-104` (加 `valuation?: ValuationConfig` 到 `CompanyFinancials`)

- [ ] **Step 1.1: 创建 `web/src/types/valuation.ts`**

```ts
export type ValuationMethod = 'PS' | 'PE' | 'EV_EBITDA';
export type SotpCurrency = 'CNY' | 'HKD' | 'USD';
export type Verdict = 'STRONG_UNDER' | 'MILD_UNDER' | 'FAIR' | 'MILD_OVER' | 'STRONG_OVER';

export interface PeerMultiple {
  name: string;
  ticker: string;
  multiple: number;
  asOf: string; // YYYY-MM-DD
  source: string;
}

export interface BusinessSegment {
  id: string;
  name: string;
  method: ValuationMethod;
  metricLabel: string;
  metricValue: number | null; // 百万，原币
  metricAsOf: string;
  peers: PeerMultiple[];
  rationale: string;
}

export interface ValuationConfig {
  sotpCurrency: SotpCurrency;
  sotpAsOf: string;
  netCash: number | null;
  netCashAsOf: string;
  marketCapOverride: number | null;
  segments: BusinessSegment[];
}

export interface SegmentValuation {
  segment: BusinessSegment;
  peerMedian: number | null;
  peerMean: number | null;
  peerCount: number;
  impliedValue: number | null;
  excluded: boolean;
  excludeReason?: string;
}

export interface SotpResult {
  segments: SegmentValuation[];
  segmentsTotal: number;
  excludedCount: number;
  netCash: number | null;
  sotpTotal: number;
  currentMarketCap: number;
  impliedUpsidePct: number;
  verdict: Verdict;
  currency: SotpCurrency;
  asOf: string;
}
```

- [ ] **Step 1.2: 修改 `web/src/types/finance.ts` 把 valuation 挂到 CompanyFinancials**

在文件顶部 import 区域加：

```ts
import type { ValuationConfig } from './valuation';
```

把 `CompanyFinancials` 接口（line 86-104）修改为：

```ts
export interface CompanyFinancials {
  ticker: string;
  name: string;
  nameEn?: string;
  shortName?: string;
  industry: string;
  market?: MarketCode;
  currency: Currency;
  unit: RawUnit;
  accountingStandard: AccountingStandard;
  statements: {
    IS: { periods: PeriodValues[] };
    BS: { periods: PeriodValues[] };
    CF: { periods: PeriodValues[] };
  };
  ratios?: KeyMetricsRow[];
  /** SOTP 分部估值配置；缺省时估值页显示 EmptyState */
  valuation?: ValuationConfig;
  /** 多源交叉校验报告。**无此字段或 passed=false 的 JSON 视为不可信，需重抓** */
  _validation?: ValidationReport;
}
```

> ⚠ 注意：`ValidationReport` 是原文件已有的类型 import，保持不变；只新增 valuation 这一行 + 顶部 import。

- [ ] **Step 1.3: 验证 TypeScript 编译通过**

```bash
cd web && npx tsc --noEmit
```

预期：无错误输出。

- [ ] **Step 1.4: Commit**

```bash
git add web/src/types/valuation.ts web/src/types/finance.ts
GIT_AUTHOR_NAME=Never GIT_AUTHOR_EMAIL=never@local \
GIT_COMMITTER_NAME=Never GIT_COMMITTER_EMAIL=never@local \
git commit -m "feat(valuation): 加 SOTP 估值类型定义"
```

---

## Task 2: verdict 分类（最简单先做）

**Files:**
- Create: `web/src/lib/valuation/verdict.ts`
- Create: `web/src/lib/valuation/__tests__/verdict.test.ts`

- [ ] **Step 2.1: 写失败测试**

`web/src/lib/valuation/__tests__/verdict.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { classifyVerdict, verdictLabel, verdictTone } from '../verdict';

describe('classifyVerdict', () => {
  it('returns STRONG_UNDER when upside > +20%', () => {
    expect(classifyVerdict(0.25)).toBe('STRONG_UNDER');
    expect(classifyVerdict(0.50)).toBe('STRONG_UNDER');
  });
  it('returns MILD_UNDER when upside in (+5%, +20%]', () => {
    expect(classifyVerdict(0.20)).toBe('MILD_UNDER');
    expect(classifyVerdict(0.10)).toBe('MILD_UNDER');
    expect(classifyVerdict(0.06)).toBe('MILD_UNDER');
  });
  it('returns FAIR when upside in [-5%, +5%]', () => {
    expect(classifyVerdict(0.05)).toBe('FAIR');
    expect(classifyVerdict(0)).toBe('FAIR');
    expect(classifyVerdict(-0.05)).toBe('FAIR');
  });
  it('returns MILD_OVER when upside in [-20%, -5%)', () => {
    expect(classifyVerdict(-0.06)).toBe('MILD_OVER');
    expect(classifyVerdict(-0.20)).toBe('MILD_OVER');
  });
  it('returns STRONG_OVER when upside < -20%', () => {
    expect(classifyVerdict(-0.21)).toBe('STRONG_OVER');
    expect(classifyVerdict(-0.50)).toBe('STRONG_OVER');
  });
});

describe('verdictLabel', () => {
  it('returns Chinese labels for all 5 verdicts', () => {
    expect(verdictLabel('STRONG_UNDER')).toBe('显著低估');
    expect(verdictLabel('MILD_UNDER')).toBe('合理偏低');
    expect(verdictLabel('FAIR')).toBe('合理');
    expect(verdictLabel('MILD_OVER')).toBe('合理偏高');
    expect(verdictLabel('STRONG_OVER')).toBe('显著高估');
  });
});

describe('verdictTone', () => {
  it('returns semantic tone for each verdict', () => {
    expect(verdictTone('STRONG_UNDER')).toBe('positive-strong');
    expect(verdictTone('MILD_UNDER')).toBe('positive');
    expect(verdictTone('FAIR')).toBe('neutral');
    expect(verdictTone('MILD_OVER')).toBe('negative');
    expect(verdictTone('STRONG_OVER')).toBe('negative-strong');
  });
});
```

- [ ] **Step 2.2: 运行测试，确认 fail**

```bash
cd web && npm test -- verdict 2>&1 | tail -20
```

预期：3 个 describe 全 fail（module not found / function undefined）。

- [ ] **Step 2.3: 写实现 `web/src/lib/valuation/verdict.ts`**

```ts
import type { Verdict } from '@/types/valuation';

/**
 * 把"隐含上行幅度"映射到 5 档分类。
 * 边界归属：≥+20% → STRONG_UNDER；(+5%,+20%) → MILD_UNDER；[-5%,+5%] → FAIR；
 *           (-20%,-5%) → MILD_OVER；≤-20% → STRONG_OVER
 *
 * 注：边界采用 spec 表里的口径 — +0.20 算 MILD_UNDER（因为 ">+20%" 才升档），
 * +0.21 才算 STRONG_UNDER；FAIR 闭区间 [-0.05, +0.05]；-0.20 算 MILD_OVER。
 */
export function classifyVerdict(impliedUpsidePct: number): Verdict {
  if (impliedUpsidePct > 0.20) return 'STRONG_UNDER';
  if (impliedUpsidePct > 0.05) return 'MILD_UNDER';
  if (impliedUpsidePct >= -0.05) return 'FAIR';
  if (impliedUpsidePct >= -0.20) return 'MILD_OVER';
  return 'STRONG_OVER';
}

export function verdictLabel(v: Verdict): string {
  switch (v) {
    case 'STRONG_UNDER': return '显著低估';
    case 'MILD_UNDER':   return '合理偏低';
    case 'FAIR':         return '合理';
    case 'MILD_OVER':    return '合理偏高';
    case 'STRONG_OVER':  return '显著高估';
  }
}

export type VerdictTone = 'positive-strong' | 'positive' | 'neutral' | 'negative' | 'negative-strong';

export function verdictTone(v: Verdict): VerdictTone {
  switch (v) {
    case 'STRONG_UNDER': return 'positive-strong';
    case 'MILD_UNDER':   return 'positive';
    case 'FAIR':         return 'neutral';
    case 'MILD_OVER':    return 'negative';
    case 'STRONG_OVER':  return 'negative-strong';
  }
}
```

- [ ] **Step 2.4: 重跑测试，确认通过**

```bash
cd web && npm test -- verdict 2>&1 | tail -20
```

预期：3 describes 全 pass。

- [ ] **Step 2.5: Commit**

```bash
git add web/src/lib/valuation/verdict.ts web/src/lib/valuation/__tests__/verdict.test.ts
GIT_AUTHOR_NAME=Never GIT_AUTHOR_EMAIL=never@local \
GIT_COMMITTER_NAME=Never GIT_COMMITTER_EMAIL=never@local \
git commit -m "feat(valuation): verdict 5 档分类 + 文案"
```

---

## Task 3: 大数格式化

**Files:**
- Create: `web/src/lib/valuation/format.ts`
- Create: `web/src/lib/valuation/__tests__/format.test.ts`

- [ ] **Step 3.1: 写失败测试**

`web/src/lib/valuation/__tests__/format.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { formatMoney, formatMultiple, formatPct } from '../format';

describe('formatMoney (input is millions of base currency)', () => {
  it('CNY/HKD: ≥10000 (百万) 用亿', () => {
    expect(formatMoney(720000, 'CNY')).toBe('CNY 7,200 亿');
    expect(formatMoney(1850, 'HKD')).toBe('HKD 18.50 亿');
  });
  it('CNY/HKD: <10000 (百万) 用万', () => {
    expect(formatMoney(50, 'CNY')).toBe('CNY 5,000 万');
    expect(formatMoney(0.5, 'CNY')).toBe('CNY 50 万');
  });
  it('USD: ≥1000 (百万) 用 B (billion)', () => {
    expect(formatMoney(2500, 'USD')).toBe('USD 2.50 B');
  });
  it('USD: <1000 (百万) 用 M', () => {
    expect(formatMoney(950, 'USD')).toBe('USD 950 M');
  });
  it('null/NaN/undefined → "--"', () => {
    expect(formatMoney(null, 'CNY')).toBe('--');
    expect(formatMoney(NaN, 'CNY')).toBe('--');
    expect(formatMoney(undefined as unknown as number, 'CNY')).toBe('--');
  });
  it('0 也显示为 0（金额可合法为 0，不该归并成 "--"）', () => {
    expect(formatMoney(0, 'CNY')).toBe('CNY 0 万');
  });
});

describe('formatMultiple', () => {
  it('1 位小数 + x', () => {
    expect(formatMultiple(1.67)).toBe('1.7x');
    expect(formatMultiple(20)).toBe('20.0x');
  });
  it('null → "--"', () => {
    expect(formatMultiple(null)).toBe('--');
  });
});

describe('formatPct', () => {
  it('百分比 1 位小数 + 正负号', () => {
    expect(formatPct(0.123)).toBe('+12.3%');
    expect(formatPct(-0.123)).toBe('-12.3%');
    expect(formatPct(0)).toBe('+0.0%');
  });
  it('null / NaN → "--"', () => {
    expect(formatPct(null)).toBe('--');
    expect(formatPct(NaN)).toBe('--');
  });
});
```

- [ ] **Step 3.2: 运行测试，确认 fail**

```bash
cd web && npm test -- format 2>&1 | tail -20
```

预期：3 个 describe 全 fail。

- [ ] **Step 3.3: 写实现 `web/src/lib/valuation/format.ts`**

```ts
import type { SotpCurrency } from '@/types/valuation';

const N = new Intl.NumberFormat('en-US');

/** 输入：百万为单位的金额 + 币种。null/NaN/undefined → "--" */
export function formatMoney(amountMillions: number | null | undefined, currency: SotpCurrency): string {
  if (amountMillions === null || amountMillions === undefined || !Number.isFinite(amountMillions)) {
    return '--';
  }
  if (currency === 'USD') {
    if (Math.abs(amountMillions) >= 1000) {
      return `USD ${(amountMillions / 1000).toFixed(2)} B`;
    }
    return `USD ${N.format(Math.round(amountMillions))} M`;
  }
  // CNY / HKD: 1 百万 = 100 万，10000 百万 = 1 亿
  if (Math.abs(amountMillions) >= 10000) {
    const yi = amountMillions / 10000;
    // ≥100 亿用整数（如 7,200 亿），<100 亿用 2 位小数（如 18.50 亿）
    if (Math.abs(yi) >= 100) {
      return `${currency} ${N.format(Math.round(yi))} 亿`;
    }
    return `${currency} ${yi.toFixed(2)} 亿`;
  }
  // 1 百万 = 100 万
  const wan = amountMillions * 100;
  return `${currency} ${N.format(Math.round(wan))} 万`;
}

export function formatMultiple(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return '--';
  return `${m.toFixed(1)}x`;
}

export function formatPct(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return '--';
  const sign = p >= 0 ? '+' : '';
  return `${sign}${(p * 100).toFixed(1)}%`;
}
```

- [ ] **Step 3.4: 重跑测试，确认通过**

```bash
cd web && npm test -- format 2>&1 | tail -20
```

预期：3 describes 全 pass。

- [ ] **Step 3.5: Commit**

```bash
git add web/src/lib/valuation/format.ts web/src/lib/valuation/__tests__/format.test.ts
GIT_AUTHOR_NAME=Never GIT_AUTHOR_EMAIL=never@local \
GIT_COMMITTER_NAME=Never GIT_COMMITTER_EMAIL=never@local \
git commit -m "feat(valuation): 大数 / 倍数 / 百分比格式化"
```

---

## Task 4: SOTP 核心计算（最重要 — 全单测）

**Files:**
- Create: `web/src/lib/valuation/sotp.ts`
- Create: `web/src/lib/valuation/__tests__/sotp.test.ts`

- [ ] **Step 4.1: 写失败测试**

`web/src/lib/valuation/__tests__/sotp.test.ts`（完整复制）：

```ts
import { describe, it, expect } from 'vitest';
import { computeSegmentValuation, computeSotp } from '../sotp';
import type { BusinessSegment, ValuationConfig } from '@/types/valuation';

function seg(overrides: Partial<BusinessSegment> = {}): BusinessSegment {
  return {
    id: 'test',
    name: 'Test Seg',
    method: 'PS',
    metricLabel: 'TTM Rev',
    metricValue: 1000, // 百万
    metricAsOf: '2025-12-31',
    peers: [
      { name: 'A', ticker: 'A', multiple: 2.0, asOf: '2025-12-31', source: 's' },
      { name: 'B', ticker: 'B', multiple: 4.0, asOf: '2025-12-31', source: 's' },
      { name: 'C', ticker: 'C', multiple: 3.0, asOf: '2025-12-31', source: 's' },
    ],
    rationale: '',
    ...overrides,
  };
}

function cfg(segments: BusinessSegment[], netCash: number | null = 500): ValuationConfig {
  return {
    sotpCurrency: 'CNY',
    sotpAsOf: '2025-12-31',
    netCash,
    netCashAsOf: '2025-12-31',
    marketCapOverride: null,
    segments,
  };
}

describe('computeSegmentValuation', () => {
  it('全数据齐全：peer 中位 = 3.0, impliedValue = 1000 * 3.0 = 3000', () => {
    const r = computeSegmentValuation(seg());
    expect(r.peerMedian).toBe(3.0);
    expect(r.peerMean).toBeCloseTo(3.0);
    expect(r.peerCount).toBe(3);
    expect(r.impliedValue).toBe(3000);
    expect(r.excluded).toBe(false);
  });

  it('偶数 peer → 中位 = 中间两个均值', () => {
    const r = computeSegmentValuation(seg({
      peers: [
        { name: 'A', ticker: 'A', multiple: 2.0, asOf: '2025', source: 's' },
        { name: 'B', ticker: 'B', multiple: 4.0, asOf: '2025', source: 's' },
      ],
    }));
    expect(r.peerMedian).toBe(3.0); // (2+4)/2
    expect(r.peerMean).toBe(3.0);
    expect(r.impliedValue).toBe(3000);
  });

  it('单 peer → 中位=均值=该 peer', () => {
    const r = computeSegmentValuation(seg({
      peers: [{ name: 'A', ticker: 'A', multiple: 5.0, asOf: '2025', source: 's' }],
    }));
    expect(r.peerMedian).toBe(5.0);
    expect(r.peerMean).toBe(5.0);
    expect(r.peerCount).toBe(1);
    expect(r.impliedValue).toBe(5000);
    expect(r.excluded).toBe(false);
  });

  it('metric=null → impliedValue=null, excluded=true', () => {
    const r = computeSegmentValuation(seg({ metricValue: null }));
    expect(r.impliedValue).toBeNull();
    expect(r.excluded).toBe(true);
    expect(r.excludeReason).toMatch(/指标/);
  });

  it('peers=[] → peerMedian=null, impliedValue=null, excluded=true', () => {
    const r = computeSegmentValuation(seg({ peers: [] }));
    expect(r.peerMedian).toBeNull();
    expect(r.peerMean).toBeNull();
    expect(r.peerCount).toBe(0);
    expect(r.impliedValue).toBeNull();
    expect(r.excluded).toBe(true);
    expect(r.excludeReason).toMatch(/对标/);
  });
});

describe('computeSotp', () => {
  it('单业务公司：sotp = metric × median + netCash', () => {
    const r = computeSotp(cfg([seg()], 500), 4000);
    expect(r.segmentsTotal).toBe(3000);
    expect(r.netCash).toBe(500);
    expect(r.sotpTotal).toBe(3500);
    expect(r.currentMarketCap).toBe(4000);
    expect(r.impliedUpsidePct).toBeCloseTo(-0.125); // (3500-4000)/4000
    expect(r.excludedCount).toBe(0);
    expect(r.verdict).toBe('MILD_OVER'); // -12.5% → MILD_OVER
  });

  it('多业务：加总等于各 segment + netCash', () => {
    const r = computeSotp(cfg([
      seg({ id: 's1', metricValue: 1000 }), // 3000
      seg({ id: 's2', metricValue: 2000 }), // 6000
    ], 1000), 9000);
    expect(r.segmentsTotal).toBe(9000);
    expect(r.sotpTotal).toBe(10000);
    expect(r.impliedUpsidePct).toBeCloseTo(0.1111, 3);
    expect(r.verdict).toBe('MILD_UNDER');
  });

  it('某 segment 缺数据 → 剔除，剩余仍加总', () => {
    const r = computeSotp(cfg([
      seg({ id: 's1' }),                              // 3000
      seg({ id: 's2', metricValue: null }),           // 剔除
      seg({ id: 's3', peers: [] }),                   // 剔除
    ], 0), 3000);
    expect(r.segmentsTotal).toBe(3000);
    expect(r.sotpTotal).toBe(3000);
    expect(r.excludedCount).toBe(2);
    expect(r.segments.filter((s) => s.excluded).length).toBe(2);
  });

  it('netCash=null 当 0 处理', () => {
    const r = computeSotp(cfg([seg()], null), 3000);
    expect(r.netCash).toBeNull();
    expect(r.sotpTotal).toBe(3000); // 3000 + 0
  });

  it('netCash 为负（净负债）正确扣减', () => {
    const r = computeSotp(cfg([seg()], -500), 2000);
    expect(r.sotpTotal).toBe(2500); // 3000 + (-500)
  });

  it('SOTP == 当前市值 → upside=0 → verdict=FAIR', () => {
    const r = computeSotp(cfg([seg()], 0), 3000);
    expect(r.impliedUpsidePct).toBe(0);
    expect(r.verdict).toBe('FAIR');
  });

  it('SOTP 显著高于市值 → STRONG_UNDER', () => {
    const r = computeSotp(cfg([seg({ metricValue: 5000 })], 0), 5000); // 15000
    // upside = (15000 - 5000) / 5000 = 2.0 → STRONG_UNDER
    expect(r.verdict).toBe('STRONG_UNDER');
  });

  it('SOTP 显著低于市值 → STRONG_OVER', () => {
    const r = computeSotp(cfg([seg({ metricValue: 100 })], 0), 1000); // sotp=300
    // upside = (300 - 1000) / 1000 = -0.7 → STRONG_OVER
    expect(r.verdict).toBe('STRONG_OVER');
  });

  it('不变式：sotpTotal === segmentsTotal + (netCash ?? 0)', () => {
    for (const nc of [null, 0, 500, -500]) {
      const r = computeSotp(cfg([seg()], nc), 4000);
      expect(r.sotpTotal).toBe(r.segmentsTotal + (nc ?? 0));
    }
  });

  it('全部 segment 被剔除 → sotpTotal = 0 + netCash', () => {
    const r = computeSotp(cfg([
      seg({ metricValue: null }),
      seg({ peers: [] }),
    ], 500), 1000);
    expect(r.segmentsTotal).toBe(0);
    expect(r.excludedCount).toBe(2);
    expect(r.sotpTotal).toBe(500);
  });

  it('保留 currency 与 asOf 透传', () => {
    const c = cfg([seg()]);
    const r = computeSotp(c, 4000);
    expect(r.currency).toBe('CNY');
    expect(r.asOf).toBe('2025-12-31');
  });
});
```

- [ ] **Step 4.2: 运行测试，确认全 fail**

```bash
cd web && npm test -- sotp 2>&1 | tail -20
```

预期：~15 个 it 全 fail（module not found）。

- [ ] **Step 4.3: 写实现 `web/src/lib/valuation/sotp.ts`**

```ts
import type {
  BusinessSegment,
  SegmentValuation,
  SotpResult,
  ValuationConfig,
} from '@/types/valuation';
import { classifyVerdict } from './verdict';

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n % 2 === 1) return sorted[(n - 1) / 2];
  return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

export function computeSegmentValuation(segment: BusinessSegment): SegmentValuation {
  const peerCount = segment.peers.length;
  const multiples = segment.peers.map((p) => p.multiple).filter((m) => Number.isFinite(m));
  const hasMetric = segment.metricValue !== null && Number.isFinite(segment.metricValue);
  const hasPeers = multiples.length > 0;

  const peerMedian = hasPeers ? median(multiples) : null;
  const peerMean = hasPeers ? mean(multiples) : null;

  let impliedValue: number | null = null;
  let excluded = false;
  let excludeReason: string | undefined;

  if (!hasMetric && !hasPeers) {
    excluded = true;
    excludeReason = '指标值与对标公司均缺失';
  } else if (!hasMetric) {
    excluded = true;
    excludeReason = '指标值缺失';
  } else if (!hasPeers) {
    excluded = true;
    excludeReason = '无对标公司倍数';
  } else {
    impliedValue = (segment.metricValue as number) * (peerMedian as number);
  }

  return { segment, peerMedian, peerMean, peerCount, impliedValue, excluded, excludeReason };
}

export function computeSotp(cfg: ValuationConfig, currentMarketCap: number): SotpResult {
  const segments = cfg.segments.map(computeSegmentValuation);
  const segmentsTotal = segments
    .filter((s) => !s.excluded && s.impliedValue !== null)
    .reduce((sum, s) => sum + (s.impliedValue as number), 0);
  const excludedCount = segments.filter((s) => s.excluded).length;
  const sotpTotal = segmentsTotal + (cfg.netCash ?? 0);
  const impliedUpsidePct = currentMarketCap !== 0
    ? (sotpTotal - currentMarketCap) / currentMarketCap
    : 0;
  return {
    segments,
    segmentsTotal,
    excludedCount,
    netCash: cfg.netCash,
    sotpTotal,
    currentMarketCap,
    impliedUpsidePct,
    verdict: classifyVerdict(impliedUpsidePct),
    currency: cfg.sotpCurrency,
    asOf: cfg.sotpAsOf,
  };
}
```

- [ ] **Step 4.4: 重跑测试，确认全通过**

```bash
cd web && npm test -- sotp 2>&1 | tail -25
```

预期：~15 个 it 全 pass。

- [ ] **Step 4.5: Commit**

```bash
git add web/src/lib/valuation/sotp.ts web/src/lib/valuation/__tests__/sotp.test.ts
GIT_AUTHOR_NAME=Never GIT_AUTHOR_EMAIL=never@local \
GIT_COMMITTER_NAME=Never GIT_COMMITTER_EMAIL=never@local \
git commit -m "feat(valuation): SOTP 核心计算 + 完整单测"
```

---

## Task 5: 小米 01810 valuation 数据（多业务示范，人工 3× 核对）

**Files:**
- Modify: `web/src/data/companies/01810.json`

> ⚠ **金融数据零容错铁律：每个数字至少跨 3 源核对，asOf 字段如实记录。**
>
> 建议核对来源（选 3 个）：东方财富 / 雪球 / 港交所披露易 / Stockanalysis.com / Yahoo Finance / Wind 终端
>
> 若任何数字三源不一致，宁可写 `null` + 在 `rationale` 注明，也不要瞎填。

- [ ] **Step 5.1: 在 01810.json 根对象末尾（在 `_validation` 之前）添加 `valuation` 字段**

实际数字应从公司 2024 财年年报 / 2025H1 中报 + 实时港股市值核对。下面是**结构示范**，最终数字以核对结果为准：

```jsonc
{
  // ... 现有字段 ...
  "valuation": {
    "sotpCurrency": "HKD",
    "sotpAsOf": "2025-06-30",
    "netCash": 49000,
    "netCashAsOf": "2025-06-30",
    "marketCapOverride": 723400,
    "segments": [
      {
        "id": "smartphone",
        "name": "智能手机",
        "method": "PS",
        "metricLabel": "TTM 营收 (HKD 百万)",
        "metricValue": 200000,
        "metricAsOf": "2025-06-30",
        "peers": [
          {
            "name": "Apple Inc.",
            "ticker": "AAPL",
            "multiple": 7.5,
            "asOf": "2025-06-30",
            "source": "Yahoo Finance"
          },
          {
            "name": "Samsung Electronics",
            "ticker": "005930.KS",
            "multiple": 1.2,
            "asOf": "2025-06-30",
            "source": "Stockanalysis.com"
          }
        ],
        "rationale": "硬件业务以销售额估值。Apple 高端品牌带显著溢价，Samsung 大众市场偏低估，小米介于两者之间，故用 peer 中位数作为基准。"
      },
      {
        "id": "iot",
        "name": "IoT 与生活消费品",
        "method": "PS",
        "metricLabel": "TTM 营收 (HKD 百万)",
        "metricValue": 90000,
        "metricAsOf": "2025-06-30",
        "peers": [
          { "name": "Anker Innovations", "ticker": "300866.SZ", "multiple": 2.4, "asOf": "2025-06-30", "source": "雪球" },
          { "name": "iRobot", "ticker": "IRBT", "multiple": 0.8, "asOf": "2025-06-30", "source": "Stockanalysis.com" }
        ],
        "rationale": "智能家电/可穿戴等消费电子，与 Anker 业务最接近。iRobot 处境特殊（被收购失败后估值低），仅作下限参考。"
      },
      {
        "id": "internet",
        "name": "互联网服务",
        "method": "PE",
        "metricLabel": "TTM 净利润 (HKD 百万)",
        "metricValue": 8000,
        "metricAsOf": "2025-06-30",
        "peers": [
          { "name": "Tencent", "ticker": "00700.HK", "multiple": 18, "asOf": "2025-06-30", "source": "Yahoo Finance" },
          { "name": "Meta", "ticker": "META", "multiple": 25, "asOf": "2025-06-30", "source": "Stockanalysis.com" }
        ],
        "rationale": "高毛利的广告与增值服务，按净利润给互联网行业 PE。MIUI 用户基数大但 ARPU 低于头部平台。"
      },
      {
        "id": "ev",
        "name": "智能电动汽车",
        "method": "PS",
        "metricLabel": "TTM 营收 (HKD 百万)",
        "metricValue": 20000,
        "metricAsOf": "2025-06-30",
        "peers": [
          { "name": "Tesla", "ticker": "TSLA", "multiple": 8.0, "asOf": "2025-06-30", "source": "Stockanalysis.com" },
          { "name": "Li Auto", "ticker": "LI", "multiple": 1.3, "asOf": "2025-06-30", "source": "雪球" },
          { "name": "NIO", "ticker": "NIO", "multiple": 1.0, "asOf": "2025-06-30", "source": "雪球" }
        ],
        "rationale": "新能源车业务，与新势力 (蔚小理) 同业可比。Tesla 给上限，蔚来给下限。"
      }
    ]
  }
}
```

> 📌 **数据核对清单**（实际填入时必须打勾）：
> - [ ] 每个 segment 的 `metricValue` 已与公司财报披露表对比（小米 2024 年报 / 2025H1 中报）
> - [ ] 每个 peer 的 `multiple` 已在 `asOf` 当日从 ≥1 公开源核对
> - [ ] `marketCapOverride` 已与港交所实时股价 × 总股本核对
> - [ ] `netCash` = 现金 + 短期投资 − 总有息负债（取自最新资产负债表）
> - [ ] 整体 `sotpCurrency: HKD` 与所有 metric/netCash/marketCap 单位一致

- [ ] **Step 5.2: 验证 JSON 合法 + TypeScript 类型通过**

```bash
cd web && node -e "JSON.parse(require('fs').readFileSync('src/data/companies/01810.json','utf-8')); console.log('OK')"
cd web && npx tsc --noEmit
```

预期：两者都无报错。

- [ ] **Step 5.3: prebuild 校验仍能通过（valuation 字段不影响 check-data-completeness）**

```bash
cd web && node scripts/check-data-completeness.mjs 01810
```

预期：✅ pass（脚本只查报表核心字段）。

- [ ] **Step 5.4: Commit**

```bash
git add web/src/data/companies/01810.json
GIT_AUTHOR_NAME=Never GIT_AUTHOR_EMAIL=never@local \
GIT_COMMITTER_NAME=Never GIT_COMMITTER_EMAIL=never@local \
git commit -m "data(01810): 小米 SOTP 分部估值配置（4 段业务）"
```

---

## Task 6: EmptyState 组件 + Valuation 路由骨架

**Files:**
- Create: `web/src/components/valuation/EmptyState.tsx`
- Create: `web/src/app/valuation/[ticker]/page.tsx`

- [ ] **Step 6.1: 写 `web/src/components/valuation/EmptyState.tsx`**

```tsx
interface EmptyStateProps {
  ticker: string;
  companyName: string;
}

export function EmptyState({ ticker, companyName }: EmptyStateProps) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h2 className="text-xl font-semibold text-gray-900">尚未配置 SOTP 估值数据</h2>
      <p className="mt-3 text-sm text-gray-600">
        <span className="font-medium">{companyName}</span>（{ticker}）暂未维护分部估值配置。
      </p>
      <p className="mt-2 text-sm text-gray-500">
        请在 <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">web/src/data/companies/{ticker}.json</code> 中添加
        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">valuation</code> 字段。
      </p>
      <p className="mt-1 text-xs text-gray-400">
        字段结构参考 <code>docs/superpowers/specs/2026-06-01-sotp-valuation-design.md</code> §3.1
      </p>
      <a
        href={`/research/${encodeURIComponent(ticker)}`}
        className="mt-8 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
      >
        ← 回研究页
      </a>
    </div>
  );
}
```

- [ ] **Step 6.2: 写 `web/src/app/valuation/[ticker]/page.tsx`（骨架，只接 EmptyState；后续 task 填充）**

```tsx
import { notFound } from 'next/navigation';
import { getCompany } from '@/data/companies';
import { computeSotp } from '@/lib/valuation/sotp';
import { EmptyState } from '@/components/valuation/EmptyState';

type Params = Promise<{ ticker: string }>;

export default async function ValuationPage(props: { params: Params }) {
  const { ticker } = await props.params;
  const company = getCompany(ticker);
  if (!company) notFound();

  if (!company.valuation) {
    return <EmptyState ticker={ticker} companyName={company.name} />;
  }

  const cfg = company.valuation;
  const marketCap = cfg.marketCapOverride;
  if (marketCap === null || marketCap === undefined) {
    // MVP: 暂不从 ratios 取，必须显式设 marketCapOverride
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h2 className="text-xl font-semibold text-gray-900">市值未配置</h2>
        <p className="mt-3 text-sm text-gray-600">
          {company.name}（{ticker}）的 <code>valuation.marketCapOverride</code> 缺失，无法计算 SOTP 对比。
        </p>
      </div>
    );
  }

  const result = computeSotp(cfg, marketCap);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-bold">{company.name}（{ticker}）— SOTP 估值评估</h1>
      <pre className="mt-6 overflow-x-auto rounded bg-gray-50 p-4 text-xs">
        {JSON.stringify(result, null, 2)}
      </pre>
      <a
        href={`/research/${encodeURIComponent(ticker)}`}
        className="mt-6 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
      >
        ← 回研究页
      </a>
    </div>
  );
}
```

> 这一步只是把骨架立起来，能跑通 server → compute → 渲染整个链路。后续 task 把 `<pre>` 替换为真正的组件。

- [ ] **Step 6.3: 手动 smoke**

```bash
cd web && npm run dev &
DEV_PID=$!
sleep 6
curl -s http://localhost:3000/valuation/01810 | grep -E "SOTP|sotpTotal|impliedUpsidePct" | head -5
kill $DEV_PID 2>/dev/null
```

预期：能看到 SOTP / sotpTotal / impliedUpsidePct 关键字（说明计算链路通了）。

也访问一下未配 valuation 的公司（如果有），应见 EmptyState。

- [ ] **Step 6.4: Commit**

```bash
git add web/src/components/valuation/EmptyState.tsx web/src/app/valuation/[ticker]/page.tsx
GIT_AUTHOR_NAME=Never GIT_AUTHOR_EMAIL=never@local \
GIT_COMMITTER_NAME=Never GIT_COMMITTER_EMAIL=never@local \
git commit -m "feat(valuation): 路由骨架 + EmptyState 降级"
```

---

## Task 7: ValuationHeader + ValuationVerdictCards

**Files:**
- Create: `web/src/components/valuation/ValuationHeader.tsx`
- Create: `web/src/components/valuation/ValuationVerdictCards.tsx`
- Modify: `web/src/app/valuation/[ticker]/page.tsx` (替换骨架的 `<pre>`)

- [ ] **Step 7.1: 写 `ValuationHeader.tsx`**

```tsx
import type { SotpCurrency } from '@/types/valuation';

interface ValuationHeaderProps {
  ticker: string;
  companyName: string;
  market?: string;
  currency: SotpCurrency;
  asOf: string;
}

export function ValuationHeader({ ticker, companyName, market, currency, asOf }: ValuationHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-gray-200 pb-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {companyName} <span className="ml-2 text-base font-normal text-gray-500">({ticker})</span>
        </h1>
        <div className="mt-1 text-sm text-gray-500">
          {market ? `${market} · ` : ''}{currency} · 数据截止 {asOf}
        </div>
      </div>
      <a
        href={`/research/${encodeURIComponent(ticker)}`}
        className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
      >
        ← 回研究页
      </a>
    </div>
  );
}
```

- [ ] **Step 7.2: 写 `ValuationVerdictCards.tsx`**

```tsx
import type { SotpResult } from '@/types/valuation';
import { formatMoney, formatPct } from '@/lib/valuation/format';
import { verdictLabel, verdictTone } from '@/lib/valuation/verdict';

interface ValuationVerdictCardsProps {
  result: SotpResult;
}

const TONE_BG: Record<string, string> = {
  'positive-strong': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'positive': 'bg-green-50 text-green-700 ring-green-200',
  'neutral': 'bg-gray-50 text-gray-700 ring-gray-200',
  'negative': 'bg-amber-50 text-amber-700 ring-amber-200',
  'negative-strong': 'bg-red-50 text-red-700 ring-red-200',
};

export function ValuationVerdictCards({ result }: ValuationVerdictCardsProps) {
  const tone = verdictTone(result.verdict);
  const label = verdictLabel(result.verdict);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="text-xs uppercase tracking-wide text-gray-500">当前市值</div>
        <div className="mt-2 text-2xl font-semibold text-gray-900">
          {formatMoney(result.currentMarketCap, result.currency)}
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-gray-500">SOTP 总估值</div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${TONE_BG[tone]}`}
          >
            {label}
          </span>
        </div>
        <div className="mt-2 text-2xl font-semibold text-gray-900">
          {formatMoney(result.sotpTotal, result.currency)}
        </div>
        <div className="mt-1 text-sm text-gray-600">
          隐含上行 <span className="font-medium">{formatPct(result.impliedUpsidePct)}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7.3: 修改 `page.tsx` 用组件替换骨架**

把 Task 6 里 `page.tsx` 中 `<h1>...<pre>{JSON.stringify(...)}</pre>...</h1>` 整块返回替换为：

```tsx
  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <ValuationHeader
        ticker={ticker}
        companyName={company.name}
        market={company.market}
        currency={result.currency}
        asOf={result.asOf}
      />
      <div className="mt-6">
        <ValuationVerdictCards result={result} />
      </div>
      {/* 后续 task 填：ContributionBar / DetailTable / Sensitivity / Caveats */}
    </div>
  );
```

并加 import：

```tsx
import { ValuationHeader } from '@/components/valuation/ValuationHeader';
import { ValuationVerdictCards } from '@/components/valuation/ValuationVerdictCards';
```

- [ ] **Step 7.4: 手动 smoke**

```bash
cd web && npm run dev &
DEV_PID=$!
sleep 6
curl -s http://localhost:3000/valuation/01810 | grep -E "SOTP 总估值|隐含上行|当前市值" | head -3
kill $DEV_PID 2>/dev/null
```

预期：能看到三个标签的文字。如有 verdict 文案错（如显示 STRONG_UNDER 原值），说明 verdictLabel 未连接，回查。

- [ ] **Step 7.5: Commit**

```bash
git add web/src/components/valuation/ValuationHeader.tsx \
        web/src/components/valuation/ValuationVerdictCards.tsx \
        web/src/app/valuation/\[ticker\]/page.tsx
GIT_AUTHOR_NAME=Never GIT_AUTHOR_EMAIL=never@local \
GIT_COMMITTER_NAME=Never GIT_COMMITTER_EMAIL=never@local \
git commit -m "feat(valuation): Header + 上方两张对比卡 + verdict 徽标"
```

---

## Task 8: SegmentContributionBar（横向叠加条）

**Files:**
- Create: `web/src/components/valuation/SegmentContributionBar.tsx`
- Modify: `web/src/app/valuation/[ticker]/page.tsx`

- [ ] **Step 8.1: 写组件**

```tsx
import type { SotpResult } from '@/types/valuation';
import { formatMoney, formatMultiple } from '@/lib/valuation/format';

interface Props {
  result: SotpResult;
}

const COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-lime-500',
];

export function SegmentContributionBar({ result }: Props) {
  const rows: { label: string; value: number; method: string; multiple: number | null; pct: number; color: string }[] = [];
  const denominator = result.sotpTotal !== 0 ? result.sotpTotal : 1;

  let colorIdx = 0;
  for (const s of result.segments) {
    if (s.excluded || s.impliedValue === null) continue;
    rows.push({
      label: s.segment.name,
      value: s.impliedValue,
      method: s.segment.method,
      multiple: s.peerMedian,
      pct: s.impliedValue / denominator,
      color: COLORS[colorIdx % COLORS.length],
    });
    colorIdx++;
  }

  if (result.netCash !== null && result.netCash !== 0) {
    rows.push({
      label: '净现金',
      value: result.netCash,
      method: '—',
      multiple: null,
      pct: result.netCash / denominator,
      color: 'bg-slate-400',
    });
  }

  const maxValue = Math.max(...rows.map((r) => Math.abs(r.value)), 1);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-900">分部估值贡献</h2>
      <ul className="mt-4 space-y-2.5">
        {rows.map((r) => {
          const widthPct = Math.max(2, (Math.abs(r.value) / maxValue) * 100);
          return (
            <li key={r.label} className="flex items-center gap-3 text-sm">
              <div className="w-20 shrink-0 truncate text-gray-700">{r.label}</div>
              <div className="relative h-5 flex-1 rounded bg-gray-100">
                <div
                  className={`h-full rounded ${r.color}`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <div className="w-24 shrink-0 text-right tabular-nums text-gray-900">
                {formatMoney(r.value, result.currency)}
              </div>
              <div className="w-20 shrink-0 text-right text-xs text-gray-500">
                {r.method}{r.multiple !== null ? ` ${formatMultiple(r.multiple)}` : ''}
              </div>
              <div className="w-14 shrink-0 text-right text-xs text-gray-500 tabular-nums">
                {(r.pct * 100).toFixed(0)}%
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-sm font-medium">
        <span className="text-gray-700">SOTP 合计</span>
        <span className="tabular-nums text-gray-900">{formatMoney(result.sotpTotal, result.currency)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 8.2: page.tsx 加入组件 + import**

在 `<ValuationVerdictCards />` 下方加：

```tsx
      <div className="mt-4">
        <SegmentContributionBar result={result} />
      </div>
```

import：

```tsx
import { SegmentContributionBar } from '@/components/valuation/SegmentContributionBar';
```

- [ ] **Step 8.3: smoke**

```bash
cd web && npm run dev &
DEV_PID=$!
sleep 6
curl -s http://localhost:3000/valuation/01810 | grep -E "分部估值贡献|SOTP 合计" | head -2
kill $DEV_PID 2>/dev/null
```

预期：两个标签文字均能匹配。

- [ ] **Step 8.4: Commit**

```bash
git add web/src/components/valuation/SegmentContributionBar.tsx \
        web/src/app/valuation/\[ticker\]/page.tsx
GIT_AUTHOR_NAME=Never GIT_AUTHOR_EMAIL=never@local \
GIT_COMMITTER_NAME=Never GIT_COMMITTER_EMAIL=never@local \
git commit -m "feat(valuation): 分部贡献横向条形图"
```

---

## Task 9: SegmentDetailTable（含 peer 详情）

**Files:**
- Create: `web/src/components/valuation/SegmentDetailTable.tsx`
- Modify: `web/src/app/valuation/[ticker]/page.tsx`

- [ ] **Step 9.1: 写组件**

```tsx
'use client';

import { useState } from 'react';
import type { SotpResult } from '@/types/valuation';
import { formatMoney, formatMultiple } from '@/lib/valuation/format';

interface Props {
  result: SotpResult;
}

export function SegmentDetailTable({ result }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-gray-900">分部明细</h2>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2 text-left font-medium">业务</th>
            <th className="px-3 py-2 text-left font-medium">方法</th>
            <th className="px-3 py-2 text-right font-medium">指标</th>
            <th className="px-3 py-2 text-right font-medium">Peer 中位 (n)</th>
            <th className="px-3 py-2 text-right font-medium">隐含估值</th>
            <th className="px-3 py-2 text-left font-medium">备注</th>
            <th className="w-6" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {result.segments.map((s) => {
            const isOpen = expanded === s.segment.id;
            return (
              <>
                <tr
                  key={s.segment.id}
                  className={`cursor-pointer hover:bg-gray-50 ${s.excluded ? 'text-gray-400' : 'text-gray-900'}`}
                  onClick={() => setExpanded(isOpen ? null : s.segment.id)}
                >
                  <td className="px-4 py-2.5 font-medium">{s.segment.name}</td>
                  <td className="px-3 py-2.5">{s.segment.method}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatMoney(s.segment.metricValue, result.currency)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatMultiple(s.peerMedian)} ({s.peerCount})
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {s.excluded ? '--' : formatMoney(s.impliedValue, result.currency)}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {s.excluded ? (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">
                        已剔除 · {s.excludeReason}
                      </span>
                    ) : ''}
                  </td>
                  <td className="px-2 text-xs text-gray-400">{isOpen ? '▾' : '▸'}</td>
                </tr>
                {isOpen && (
                  <tr key={`${s.segment.id}-detail`} className="bg-gray-50">
                    <td colSpan={7} className="px-6 py-3 text-xs text-gray-700">
                      <div className="mb-2 italic text-gray-600">{s.segment.rationale}</div>
                      <div className="text-[11px] text-gray-500">
                        指标时点 {s.segment.metricAsOf}
                      </div>
                      <ul className="mt-2 space-y-1">
                        {s.segment.peers.map((p) => (
                          <li key={p.ticker} className="flex items-center justify-between border-b border-gray-200 py-1">
                            <span className="text-gray-700">{p.name} <span className="text-gray-400">({p.ticker})</span></span>
                            <span className="flex items-center gap-3 text-gray-500">
                              <span className="tabular-nums">{formatMultiple(p.multiple)}</span>
                              <span className="text-[11px]">{p.asOf}</span>
                              <span className="text-[11px] text-gray-400">{p.source}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
      {result.excludedCount > 0 && (
        <div className="border-t border-gray-200 px-5 py-2 text-xs text-amber-700">
          ⚠ 已剔除 {result.excludedCount} 个业务（数据不全），SOTP 合计仅基于已计算业务。
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 9.2: page.tsx 接入**

在 ContributionBar 下方加：

```tsx
      <div className="mt-4">
        <SegmentDetailTable result={result} />
      </div>
```

import：

```tsx
import { SegmentDetailTable } from '@/components/valuation/SegmentDetailTable';
```

- [ ] **Step 9.3: smoke**

```bash
cd web && npm run dev &
DEV_PID=$!
sleep 6
curl -s http://localhost:3000/valuation/01810 | grep -E "分部明细|Peer 中位" | head -2
kill $DEV_PID 2>/dev/null
```

预期：能匹配到。

> ⚠ React fragment key 警告：`<>` 用作 fragment 在 map 中需要 key。把外层 `<>` 改成 `<React.Fragment key={s.segment.id}>...`，或者直接给第一行 `<tr key=...>` 已设 key 时把 fragment 移除（让 detail row 跟 main row 一起在 map 内紧挨返回 array）。修一下：

把 map 返回结构调整为 array：

```tsx
{result.segments.flatMap((s) => {
  const isOpen = expanded === s.segment.id;
  const rows = [
    <tr key={s.segment.id} ...> ... </tr>,
  ];
  if (isOpen) {
    rows.push(<tr key={`${s.segment.id}-detail`} ...>...</tr>);
  }
  return rows;
})}
```

修改后再 smoke 一次（避免 dev console 出 key 警告）。

- [ ] **Step 9.4: Commit**

```bash
git add web/src/components/valuation/SegmentDetailTable.tsx \
        web/src/app/valuation/\[ticker\]/page.tsx
GIT_AUTHOR_NAME=Never GIT_AUTHOR_EMAIL=never@local \
GIT_COMMITTER_NAME=Never GIT_COMMITTER_EMAIL=never@local \
git commit -m "feat(valuation): 分部明细表 + peer 展开"
```

---

## Task 10: SensitivityStrip + DataCaveats

**Files:**
- Create: `web/src/components/valuation/SensitivityStrip.tsx`
- Create: `web/src/components/valuation/DataCaveats.tsx`
- Modify: `web/src/app/valuation/[ticker]/page.tsx`

- [ ] **Step 10.1: `SensitivityStrip.tsx`**

```tsx
import type { SotpResult } from '@/types/valuation';
import { formatMoney } from '@/lib/valuation/format';

interface Props {
  result: SotpResult;
}

export function SensitivityStrip({ result }: Props) {
  // Bear/Bull: 所有 peer 中位 × 0.8 / × 1.2 → 等比缩放 segmentsTotal
  const bear = result.segmentsTotal * 0.8 + (result.netCash ?? 0);
  const bull = result.segmentsTotal * 1.2 + (result.netCash ?? 0);

  // 当前 SOTP 在 [bear, bull] 中的位置
  const span = bull - bear;
  const pos = span !== 0 ? ((result.sotpTotal - bear) / span) * 100 : 50;
  const cmPos = span !== 0 ? ((result.currentMarketCap - bear) / span) * 100 : 50;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">敏感性分析</h2>
        <span className="text-xs text-gray-500">peer 中位数 ±20%</span>
      </div>
      <div className="mt-5 relative">
        <div className="relative h-2 rounded-full bg-gradient-to-r from-red-200 via-gray-200 to-emerald-200" />
        {/* SOTP 基准 */}
        <div
          className="absolute -top-1 h-4 w-0.5 bg-gray-900"
          style={{ left: `${Math.max(0, Math.min(100, pos))}%` }}
          title="SOTP 基准"
        />
        {/* 当前市值 */}
        <div
          className="absolute -top-1 h-4 w-0.5 bg-blue-600"
          style={{ left: `${Math.max(0, Math.min(100, cmPos))}%` }}
          title="当前市值"
        />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-gray-600 tabular-nums">
        <div>
          <div className="text-gray-500">Bear (−20%)</div>
          <div className="font-medium text-gray-900">{formatMoney(bear, result.currency)}</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500">SOTP 基准</div>
          <div className="font-medium text-gray-900">{formatMoney(result.sotpTotal, result.currency)}</div>
        </div>
        <div className="text-right">
          <div className="text-gray-500">Bull (+20%)</div>
          <div className="font-medium text-gray-900">{formatMoney(bull, result.currency)}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-0.5 bg-gray-900" /> SOTP 基准
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-0.5 bg-blue-600" /> 当前市值
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 10.2: `DataCaveats.tsx`**

```tsx
import type { ValuationConfig } from '@/types/valuation';

interface Props {
  cfg: ValuationConfig;
}

export function DataCaveats({ cfg }: Props) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
      <div className="font-semibold">⚠ 数据时点 / 局限说明</div>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>SOTP 整体截止日: <span className="font-mono">{cfg.sotpAsOf}</span></li>
        {cfg.netCash !== null && (
          <li>净现金时点: <span className="font-mono">{cfg.netCashAsOf}</span>（口径：现金 + 短期投资 − 总有息负债）</li>
        )}
        <li>Peer 倍数 asOf 详见每行展开</li>
        <li>本模型 <strong>不</strong>包含：控股折价、未上市资产、税务影响、特殊持股结构</li>
        <li>结果仅供参考，不构成投资建议</li>
      </ul>
    </div>
  );
}
```

- [ ] **Step 10.3: page.tsx 加两个组件**

```tsx
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <SensitivityStrip result={result} />
        </div>
        <DataCaveats cfg={cfg} />
      </div>
```

imports：

```tsx
import { SensitivityStrip } from '@/components/valuation/SensitivityStrip';
import { DataCaveats } from '@/components/valuation/DataCaveats';
```

- [ ] **Step 10.4: smoke**

```bash
cd web && npm run dev &
DEV_PID=$!
sleep 6
curl -s http://localhost:3000/valuation/01810 | grep -E "敏感性分析|时点 / 局限" | head -2
kill $DEV_PID 2>/dev/null
```

预期：两个标签均能匹配。

- [ ] **Step 10.5: Commit**

```bash
git add web/src/components/valuation/SensitivityStrip.tsx \
        web/src/components/valuation/DataCaveats.tsx \
        web/src/app/valuation/\[ticker\]/page.tsx
GIT_AUTHOR_NAME=Never GIT_AUTHOR_EMAIL=never@local \
GIT_COMMITTER_NAME=Never GIT_COMMITTER_EMAIL=never@local \
git commit -m "feat(valuation): 敏感性条 + 数据时点/局限说明"
```

---

## Task 11: 研究页加跳转按钮

**Files:**
- Modify: `web/src/app/research/[ticker]/page.tsx`

- [ ] **Step 11.1: 在 ResearchWorkspace 之前加跳转按钮**

需要先看 page.tsx 的结构，找到合适插入点。该按钮应该靠近顶部 toolbar 区域。

最简方案：在 `<AppShell>` 内、`<div className="flex h-[calc(100vh-48px)]...">` 紧上方加一行：

```tsx
<div className="flex h-9 items-center justify-end border-b border-gray-100 bg-white px-4 text-sm">
  <a
    href={`/valuation/${encodeURIComponent(ticker)}`}
    className="rounded border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
  >
    估值评估 →
  </a>
</div>
```

注意：这条 9px 高度的 bar 会让下方 `h-[calc(100vh-48px)]` 实际超出视口 9px。把它改成 `h-[calc(100vh-48px-36px)]`（36px = h-9）以补偿。

> 替代方案：放在 ResearchWorkspace 内部（顶部 toolbar 里）。但 ResearchWorkspace 是 client 组件 + props 严格定义，改动面更大。这里走外层即可。

- [ ] **Step 11.2: smoke**

```bash
cd web && npm run dev &
DEV_PID=$!
sleep 6
curl -s http://localhost:3000/research/01810 | grep -E "估值评估" | head -1
kill $DEV_PID 2>/dev/null
```

预期：能匹配到 "估值评估" 字串。

手动点一下验证跳转到 `/valuation/01810`。

- [ ] **Step 11.3: Commit**

```bash
git add web/src/app/research/\[ticker\]/page.tsx
GIT_AUTHOR_NAME=Never GIT_AUTHOR_EMAIL=never@local \
GIT_COMMITTER_NAME=Never GIT_COMMITTER_EMAIL=never@local \
git commit -m "feat(research): 研究页加 \"估值评估 →\" 跳转按钮"
```

---

## Task 12: 茅台 600519 单业务示范

**Files:**
- Modify: `web/src/data/companies/600519.json`

- [ ] **Step 12.1: 加 valuation 字段（单 segment）**

```jsonc
{
  // ... 现有字段 ...
  "valuation": {
    "sotpCurrency": "CNY",
    "sotpAsOf": "2025-12-31",
    "netCash": 180000,
    "netCashAsOf": "2025-09-30",
    "marketCapOverride": 1750000,
    "segments": [
      {
        "id": "baijiu",
        "name": "高端白酒",
        "method": "PE",
        "metricLabel": "TTM 归母净利润 (CNY 百万)",
        "metricValue": 87000,
        "metricAsOf": "2025-09-30",
        "peers": [
          { "name": "五粮液", "ticker": "000858.SZ", "multiple": 18, "asOf": "2025-12-31", "source": "雪球" },
          { "name": "泸州老窖", "ticker": "000568.SZ", "multiple": 16, "asOf": "2025-12-31", "source": "雪球" },
          { "name": "山西汾酒", "ticker": "600809.SS", "multiple": 19, "asOf": "2025-12-31", "source": "雪球" }
        ],
        "rationale": "茅台业务高度集中于高端白酒，单段建模即可。同业取 A 股头部白酒 PE 中位数。"
      }
    ]
  }
}
```

> **数据填入前必做核对清单（同 Task 5.1 下方清单）**

- [ ] **Step 12.2: 验证 JSON + smoke**

```bash
cd web && node -e "JSON.parse(require('fs').readFileSync('src/data/companies/600519.json','utf-8')); console.log('OK')"
npm run dev &
DEV_PID=$!
sleep 6
curl -s http://localhost:3000/valuation/600519 | grep -E "SOTP 总估值|高端白酒" | head -2
kill $DEV_PID 2>/dev/null
```

预期：单段也能正常展示（UI 不应崩）。

- [ ] **Step 12.3: Commit**

```bash
git add web/src/data/companies/600519.json
GIT_AUTHOR_NAME=Never GIT_AUTHOR_EMAIL=never@local \
GIT_COMMITTER_NAME=Never GIT_COMMITTER_EMAIL=never@local \
git commit -m "data(600519): 茅台 SOTP 单业务示范"
```

---

## Task 13: 剩余 4 家公司 valuation 数据

**Files:**
- Modify: `web/src/data/companies/AAPL.json`
- Modify: `web/src/data/companies/TSLA.json`
- Modify: `web/src/data/companies/01811.json`
- Modify: `web/src/data/companies/003816.json`

> 每家公司**都按 Task 5 / Task 12 的核对清单**走一遍。结构参照下例。

- [ ] **Step 13.1: AAPL（硬件 + 服务 双段）**

```jsonc
"valuation": {
  "sotpCurrency": "USD",
  "sotpAsOf": "2025-09-30",
  "netCash": 65000,
  "netCashAsOf": "2025-09-30",
  "marketCapOverride": 3500000,
  "segments": [
    {
      "id": "products",
      "name": "Products (iPhone/Mac/iPad/Wearables)",
      "method": "PS",
      "metricLabel": "TTM Revenue (USD M)",
      "metricValue": 295000,
      "metricAsOf": "2025-09-30",
      "peers": [
        { "name": "Samsung Electronics", "ticker": "005930.KS", "multiple": 1.2, "asOf": "2025-09-30", "source": "Stockanalysis.com" },
        { "name": "Xiaomi", "ticker": "01810.HK", "multiple": 1.4, "asOf": "2025-09-30", "source": "Stockanalysis.com" }
      ],
      "rationale": "硬件大厂可比组。Apple 实际享受品牌溢价，median 仅作为基准。"
    },
    {
      "id": "services",
      "name": "Services (App Store / iCloud / Music)",
      "method": "PE",
      "metricLabel": "TTM Operating Income × (1-tax) (USD M)",
      "metricValue": 70000,
      "metricAsOf": "2025-09-30",
      "peers": [
        { "name": "Microsoft", "ticker": "MSFT", "multiple": 32, "asOf": "2025-09-30", "source": "Stockanalysis.com" },
        { "name": "Alphabet", "ticker": "GOOGL", "multiple": 25, "asOf": "2025-09-30", "source": "Stockanalysis.com" }
      ],
      "rationale": "高毛利服务业务，按净利给软件平台 PE。"
    }
  ]
}
```

- [ ] **Step 13.2: TSLA（汽车 + 能源 双段）**

```jsonc
"valuation": {
  "sotpCurrency": "USD",
  "sotpAsOf": "2025-09-30",
  "netCash": 25000,
  "netCashAsOf": "2025-09-30",
  "marketCapOverride": 900000,
  "segments": [
    {
      "id": "auto",
      "name": "Automotive",
      "method": "PS",
      "metricLabel": "TTM Revenue (USD M)",
      "metricValue": 80000,
      "metricAsOf": "2025-09-30",
      "peers": [
        { "name": "BYD", "ticker": "01211.HK", "multiple": 1.1, "asOf": "2025-09-30", "source": "雪球" },
        { "name": "Li Auto", "ticker": "LI", "multiple": 1.3, "asOf": "2025-09-30", "source": "Stockanalysis.com" }
      ],
      "rationale": "新能源车主业。同业取规模相近的中国/全球新能源车企。"
    },
    {
      "id": "energy",
      "name": "Energy / Storage",
      "method": "PS",
      "metricLabel": "TTM Revenue (USD M)",
      "metricValue": 8000,
      "metricAsOf": "2025-09-30",
      "peers": [
        { "name": "Enphase", "ticker": "ENPH", "multiple": 4.0, "asOf": "2025-09-30", "source": "Stockanalysis.com" },
        { "name": "First Solar", "ticker": "FSLR", "multiple": 5.5, "asOf": "2025-09-30", "source": "Stockanalysis.com" }
      ],
      "rationale": "储能与户用太阳能。同业取美股清洁能源中型代表。"
    }
  ]
}
```

- [ ] **Step 13.3: 01811（米家生态链 / 单业务）**

```jsonc
"valuation": {
  "sotpCurrency": "HKD",
  "sotpAsOf": "2025-06-30",
  "netCash": 2000,
  "netCashAsOf": "2025-06-30",
  "marketCapOverride": 28000,
  "segments": [
    {
      "id": "consumer-electronics",
      "name": "智能消费电子产品",
      "method": "PS",
      "metricLabel": "TTM 营收 (HKD 百万)",
      "metricValue": 15000,
      "metricAsOf": "2025-06-30",
      "peers": [
        { "name": "Anker Innovations", "ticker": "300866.SZ", "multiple": 2.4, "asOf": "2025-06-30", "source": "雪球" },
        { "name": "Roborock", "ticker": "688169.SS", "multiple": 3.2, "asOf": "2025-06-30", "source": "雪球" }
      ],
      "rationale": "可穿戴/小家电生态。同业取消费电子中型代表。"
    }
  ]
}
```

- [ ] **Step 13.4: 003816（中国广核 / 单业务 — 核电运营）**

```jsonc
"valuation": {
  "sotpCurrency": "CNY",
  "sotpAsOf": "2025-12-31",
  "netCash": -120000,
  "netCashAsOf": "2025-09-30",
  "marketCapOverride": 180000,
  "segments": [
    {
      "id": "nuclear",
      "name": "核电运营",
      "method": "PE",
      "metricLabel": "TTM 归母净利润 (CNY 百万)",
      "metricValue": 11000,
      "metricAsOf": "2025-09-30",
      "peers": [
        { "name": "中国核电", "ticker": "601985.SS", "multiple": 18, "asOf": "2025-12-31", "source": "雪球" },
        { "name": "长江电力", "ticker": "600900.SS", "multiple": 22, "asOf": "2025-12-31", "source": "雪球" }
      ],
      "rationale": "稳定现金流型公用事业。同业取 A 股核电 + 水电（同属稳定电力运营）。"
    }
  ]
}
```

> 注意：003816 净现金为**负**（核电资产负债率高，常见净负债状态），这是 sotp 计算需要正确处理的边界场景（已在 Task 4 单测覆盖）。

- [ ] **Step 13.5: 全部验证 JSON 合法**

```bash
cd web && for f in AAPL TSLA 01811 003816; do
  node -e "JSON.parse(require('fs').readFileSync('src/data/companies/${f}.json','utf-8')); console.log('${f} OK')"
done
node scripts/check-data-completeness.mjs
```

预期：4 个 OK + 全部公司 prebuild 校验通过。

- [ ] **Step 13.6: Smoke 每家**

```bash
cd web && npm run dev &
DEV_PID=$!
sleep 6
for t in AAPL TSLA 01811 003816; do
  echo "--- $t ---"
  curl -s "http://localhost:3000/valuation/$t" | grep -E "SOTP 总估值" | head -1
done
kill $DEV_PID 2>/dev/null
```

预期：4 家全部能显示 "SOTP 总估值"（说明 valuation 字段被正确读取且无渲染错误）。

- [ ] **Step 13.7: Commit**

```bash
git add web/src/data/companies/AAPL.json web/src/data/companies/TSLA.json \
        web/src/data/companies/01811.json web/src/data/companies/003816.json
GIT_AUTHOR_NAME=Never GIT_AUTHOR_EMAIL=never@local \
GIT_COMMITTER_NAME=Never GIT_COMMITTER_EMAIL=never@local \
git commit -m "data: AAPL/TSLA/01811/003816 SOTP 估值数据"
```

---

## Task 14: 最终自检 + 全量 smoke + 全量 build

- [ ] **Step 14.1: 完整测试套件**

```bash
cd web && npm test 2>&1 | tail -10
```

预期：所有测试（原有 + 新增 sotp/verdict/format）全 pass。

- [ ] **Step 14.2: TypeScript 全量检查**

```bash
cd web && npx tsc --noEmit 2>&1 | tail -10
```

预期：零错误。

- [ ] **Step 14.3: prebuild 数据校验**

```bash
cd web && node scripts/check-data-completeness.mjs
```

预期：✅ 全部公司通过。

- [ ] **Step 14.4: Production build**

```bash
cd web && npm run build 2>&1 | tail -20
```

预期：成功。如果有警告，记录下来评估是否需要修。

- [ ] **Step 14.5: Smoke 6 个 ticker × 估值页**

```bash
cd web && npm run dev &
DEV_PID=$!
sleep 8
for t in 01810 01811 600519 003816 AAPL TSLA; do
  status=$(curl -o /dev/null -s -w "%{http_code}" "http://localhost:3000/valuation/$t")
  echo "$t → HTTP $status"
done
kill $DEV_PID 2>/dev/null
```

预期：6 个 200。

- [ ] **Step 14.6: 数据三复核（最后一次人工核对）**

每家公司打开页面，对照原始来源（年报 / 雪球 / 港交所披露）核对：
- 当前市值是否合理（与实时股价 × 总股本对得上）
- 每个 segment metric 是否与披露口径一致
- 每个 peer 倍数是否与 source 一致
- 隐含 SOTP 与"市场普遍认知"是否在合理 ±50% 内（如显著背离，回查口径错误）

- [ ] **Step 14.7: 最终 commit**（如有补漏修改）

```bash
git status
# 若有变更：
git add -A
GIT_AUTHOR_NAME=Never GIT_AUTHOR_EMAIL=never@local \
GIT_COMMITTER_NAME=Never GIT_COMMITTER_EMAIL=never@local \
git commit -m "chore(valuation): 最终数据三复核修订"
```

- [ ] **Step 14.8: 更新 MEMORY.md 加一条该模块的指针（可选）**

如果 Hermes 觉得这是值得长期记住的项目状态（如"如何向 VFin 加新公司的 SOTP"），在 `/home/Neverchen/.claude/projects/-home-Neverchen-project-VFin/memory/` 加一个 project 记忆文件指针。

---

## Self-Review（写完计划后的快速自审）

### Spec coverage

| Spec 章节 | 由哪个 Task 实现 |
|---|---|
| §3.1 JSON `valuation` 字段 | Task 1 (类型) + Task 5/12/13 (数据填充) |
| §3.2 类型定义 | Task 1 |
| §3.3 verdict 5 档 | Task 2 |
| §4.1 单段估值 | Task 4 |
| §4.2 SOTP 加总 | Task 4 |
| §4.3 不变式 | Task 4 单测覆盖 |
| §5.1 ASCII 布局 | Task 6-10 组件 |
| §5.2 缺数据降级 | Task 4 (compute) + Task 6 (EmptyState) + Task 9 (excluded 标记) |
| §6 文件结构 | Task 1-11 逐一对应 |
| §7.1 单元测试 | Task 2/3/4 |
| §7.4 数据校验 | Task 5/12/13 的核对清单 + Task 14.6 |
| §10 决策记录 | 已在 spec，不另设 task |

无 spec 章节遗漏。

### Placeholder scan

- 无 "TBD"、"待补"
- 数据示例值在 Task 5/12/13 明确标注"实际数字以核对结果为准"，强制 3 源核对 → 这是必需的人工动作，不是 placeholder
- 所有 code block 均为完整可运行代码（无 "..." 省略）
- 每一步都给了完整命令和预期输出

### Type consistency

- `Verdict` 类型在 verdict.ts、sotp.ts、ValuationVerdictCards.tsx 中均一致
- `formatMoney` 签名 `(amount, currency)` 一致
- `SotpResult` 属性 `currentMarketCap` / `sotpTotal` / `impliedUpsidePct` / `verdict` / `currency` / `asOf` 在 sotp.ts 定义、组件消费、单测断言中拼写完全一致
- `BusinessSegment.peers[].asOf` 字段名一致（无 asof / asOf 混用）

### Scope check

14 个 task，每个 ≤30 分钟，总计估约 1 个工作日。属于单一 plan 合理范围，不需进一步拆分。

---

## Risks / Mitigations during execution

| 风险 | 缓解 |
|---|---|
| React 19 / Next 15 的 server/client 边界把 SegmentDetailTable 报红 | 已加 `'use client'` directive |
| Tailwind v4 的 class 与 v3 略有差异 | 使用稳定通用类（bg-*, text-*, rounded-*），无 v3 专属语法 |
| AAPL/TSLA 用 USD，01810/01811 用 HKD，单测要确保不串币种 | sotp.ts 不做任何换算，currency 仅透传；测试已断言 |
| dev server 启动慢导致 sleep 6 不够 | 失败时改成 sleep 12，或检查 `curl` 重试 3 次 |
| `<></>` fragment 在 map 中缺 key 报警告 | Task 9.3 已强调改成 flatMap + array |

---

## 执行模式

按用户授权 "你自己决定，不要问我了"，**采用 Inline Execution**（executing-plans skill），逐 task 完成 + smoke + commit，不在每个 task 之间等用户确认。**唯一例外**：

- 若 Task 4 单测出现非 trivial 失败（如不变式被打破）→ 停下来报告，不继续往后
- 若 prebuild / build 失败 → 停下来排查
- 若数据核对发现金额相差 >50% → 停下来报告，让用户决定是否人肉介入
