# SOTP 估值评估模块 — 设计文档

**日期**: 2026-06-01
**作者**: Hermes（与 Never 协作）
**项目**: VFin
**分支**: feat/market-dashboard-phase-2（建议新开 feat/sotp-valuation）
**状态**: 设计已落定，待写实施计划

---

## 1. 问题陈述

VFin 现有 `/research/[ticker]` 已能展示一家公司的 BS/IS/CF 三大报表与 PE/PB/PS 等基础倍数，但缺少回答**"当前估值是否合理？"**的判断工具。

对于多元化公司（典型如小米：手机 + IoT + 互联网服务 + 智能电动汽车），**整体 PE/PS 估值毫无意义**——必须把每块业务**分别**与同业对标，再加总，才能得到一个有意义的内在价值参考。

本模块要交付一个独立功能：**Sum-of-the-parts（SOTP）分部估值仪表盘**。

- 多业务公司：拆段估值 → 加总 → 与当前市值对比 → 给出"低估/合理/高估"判断
- 单业务公司：同一流程退化，结果就是单段估值

---

## 2. 目标 / 非目标

### ✅ 目标（MVP）

1. 给现有 6 家公司中的多业务公司（至少小米 01810 完整跑通）展示 SOTP
2. 单业务公司也能跑同一流程（如茅台 600519、苹果 AAPL），UI 自然塌缩
3. 数字"对得上"：每一个数字都可以追溯到 segment 输入 + peer 倍数 + 公式
4. 缺数据时显示 `--`，绝不显示 0；缺 segment 时显式标注"已剔除 N 个无数据业务"
5. peer 倍数旁标 `asOf YYYY-MM-DD`，让用户知道数据时点
6. 纯函数 `computeSotp()` 必须有单元测试（≥ 80% 行覆盖 + 边界用例）
7. 入口从 `/research/[ticker]` 顶部一个明显按钮跳进来

### ❌ 非目标（MVP 之外）

- ❌ 全网爬数据/自动获取 peer 倍数
- ❌ 自动从财报 PDF 解析分部数据
- ❌ DCF 现金流模型
- ❌ 多币种自动换算（同一公司的 SOTP 强制单一币种）
- ❌ 历史 SOTP 时间序列回放
- ❌ 用户自定义 peer / 倍数（MVP 全部在 JSON 里手工维护）

---

## 3. 数据模型

### 3.1 公司 JSON 新增字段（`web/src/data/companies/<ticker>.json`）

```jsonc
{
  // ... 现有字段保持不变 ...

  "valuation": {
    "sotpCurrency": "HKD",          // 整个 SOTP 必须用同一币种
    "sotpAsOf": "2025-12-31",       // 整体 SOTP 的截止日期（财年/半年报）
    "netCash": 49000,               // 净现金（百万，原币）— 加回 SOTP，可为负
    "netCashAsOf": "2025-12-31",    // 净现金对应资产负债表时点
    "marketCapOverride": null,      // 可选：若 KeyMetricsRow.market_cap 不可用/币种不匹配，用此值（百万，原币）
    "segments": [
      {
        "id": "smartphone",
        "name": "智能手机",
        "method": "PS",             // "PS" | "PE" | "EV_EBITDA"
        "metricLabel": "TTM 营收",
        "metricValue": 191800,      // 百万，原币
        "metricAsOf": "2025-09-30",
        "peers": [
          {
            "name": "Apple",
            "ticker": "AAPL",
            "multiple": 7.5,
            "asOf": "2025-12-31",
            "source": "Yahoo Finance"   // 数据来源（用户可审计）
          },
          {
            "name": "Samsung Elec",
            "ticker": "005930.KS",
            "multiple": 1.2,
            "asOf": "2025-12-31",
            "source": "Bloomberg"
          }
        ],
        "rationale": "手机硬件业务，按销售额估值（PS）。Apple 高端品牌带溢价，Samsung 大众市场偏低估，小米介于两者之间。"
      }
      // ... 更多 segment
    ]
  }
}
```

### 3.2 类型 (`web/src/types/valuation.ts`)

```ts
export type ValuationMethod = 'PS' | 'PE' | 'EV_EBITDA';
export type SotpCurrency = 'CNY' | 'HKD' | 'USD';

export interface PeerMultiple {
  name: string;
  ticker: string;
  multiple: number;
  asOf: string;          // YYYY-MM-DD
  source: string;
}

export interface BusinessSegment {
  id: string;
  name: string;
  method: ValuationMethod;
  metricLabel: string;
  metricValue: number | null;   // 百万；null = 缺数据
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
  peerMedian: number | null;     // 倍数中位数；缺 peer 时为 null
  peerMean: number | null;
  peerCount: number;
  impliedValue: number | null;   // 百万；缺 metric/peer 时为 null
  excluded: boolean;             // 是否被剔出 SOTP 加总
  excludeReason?: string;
}

export interface SotpResult {
  segments: SegmentValuation[];
  segmentsTotal: number;         // 已计算 segment 加总（剔除 excluded）
  excludedCount: number;
  netCash: number | null;
  sotpTotal: number;             // segmentsTotal + (netCash ?? 0)
  currentMarketCap: number;      // 当前实际市值（百万）
  impliedUpsidePct: number;      // (sotpTotal - currentMarketCap) / currentMarketCap
  verdict: 'STRONG_UNDER' | 'MILD_UNDER' | 'FAIR' | 'MILD_OVER' | 'STRONG_OVER';
  currency: SotpCurrency;
  asOf: string;
}
```

### 3.3 判断档位（verdict）

| 隐含上行 (impliedUpsidePct) | verdict | 文案 |
|---|---|---|
| `> +20%` | `STRONG_UNDER` | 显著低估 |
| `+5% ~ +20%` | `MILD_UNDER` | 合理偏低 |
| `−5% ~ +5%` | `FAIR` | 合理 |
| `−20% ~ −5%` | `MILD_OVER` | 合理偏高 |
| `< −20%` | `STRONG_OVER` | 显著高估 |

---

## 4. 计算逻辑（`web/src/lib/valuation/sotp.ts`）

纯函数，无副作用，全单测覆盖。

```ts
export function computeSegmentValuation(seg: BusinessSegment): SegmentValuation;
export function computeSotp(
  cfg: ValuationConfig,
  currentMarketCap: number,
): SotpResult;
export function classifyVerdict(impliedUpsidePct: number): SotpResult['verdict'];
```

### 4.1 单段估值

```
peerMedian = median(peers.map(p => p.multiple))   // peers 为空 → null
impliedValue = metricValue * peerMedian            // 任一为 null → null & excluded=true
```

### 4.2 加总

```
segmentsTotal = sum(segments.filter(!excluded).map(s => s.impliedValue))
sotpTotal     = segmentsTotal + (netCash ?? 0)
impliedUpsidePct = (sotpTotal - currentMarketCap) / currentMarketCap
```

### 4.3 不变式（单测必查）

- `sotpTotal === segmentsTotal + (netCash ?? 0)` —— 加总必须精确等于
- 任一 segment 缺 metric **或** 缺 peer 时，必须 `excluded=true` 且 `impliedValue=null`
- `peerCount === peers.length`，即使全部用于计算
- `excludedCount === segments.filter(s => s.excluded).length`
- 货币一致性：`cfg.sotpCurrency` 决定整页币种；`currentMarketCap` 必须传同一币种
- 市值取数顺序：优先 `marketCapOverride`（若非 null）→ 否则 `KeyMetricsRow.market_cap`（最新期）；若取到的 `market_cap_currency` 与 `sotpCurrency` 不一致，`page.tsx` 必须报错并渲染降级提示（不做隐式换算）

---

## 5. UI 设计

### 5.1 页面 ASCII 布局

```
┌────────────────────────────────────────────────────────────────┐
│ 小米集团-W (01810.HK)   港股 │ HKD            [← 回研究页]    │
├────────────────────────────────────────────────────────────────┤
│  当前市值                  SOTP 总估值                          │
│  HKD 7,234 亿              HKD 8,120 亿                         │
│  28.04 HKD/股              31.48 HKD/股        ★ 合理偏低      │
│                            ────────────                         │
│                            隐含上行 +12.3%                       │
├────────────────────────────────────────────────────────────────┤
│ 分部估值贡献                                                     │
│ 手机    ██████████████████  3,200 亿  PS  ×1.67  (39%)         │
│ IoT     ██████████          1,850 亿  PS  ×2.16  (23%)         │
│ 互联网  ████████            1,440 亿  PE  ×20    (18%)         │
│ 汽车    ██████              1,140 亿  PS  ×6.0   (14%)         │
│ 净现金  ███                   490 亿                  (6%)      │
│                            ───────                              │
│                            8,120 亿  ←SOTP                      │
├────────────────────────────────────────────────────────────────┤
│ 分部明细                                                         │
│ ┌──────┬─────┬───────────┬───────────┬───────────┬─────────┐ │
│ │ 业务 │方法 │ 指标 TTM  │Peer 中位  │ 估值      │ Peer    │ │
│ ├──────┼─────┼───────────┼───────────┼───────────┼─────────┤ │
│ │ 手机 │ PS  │ 1,918 亿  │ 1.67x (3) │ 3,200 亿  │ AAPL .. │ │
│ │ IoT  │ PS  │   855 亿  │ 2.16x (2) │ 1,850 亿  │ ANKER ..│ │
│ │ ...  │ ... │  ...      │   ...     │   ...     │   ...   │ │
│ └──────┴─────┴───────────┴───────────┴───────────┴─────────┘ │
│ (3) = peer 数；每行可展开 → 显示每个 peer 的 ticker/倍数/asOf  │
├────────────────────────────────────────────────────────────────┤
│ 敏感性分析（peer 中位数 ±20%）                                    │
│ Bear ─────●───────── Bull                                       │
│ 6,800 亿  8,120 亿  9,440 亿                                    │
│           (基准)                                                │
├────────────────────────────────────────────────────────────────┤
│ ⚠ 数据时点 / 局限说明                                             │
│ • SOTP 截止日: 2025-12-31                                       │
│ • 净现金时点: 2025-09-30                                        │
│ • Peer 倍数 asOf: 见每行                                        │
│ • SOTP 不含: 控股折价、未上市资产、税务影响                       │
└────────────────────────────────────────────────────────────────┘
```

### 5.2 缺数据降级

- 整个公司无 `valuation` 字段 → 顶部友好提示："本公司尚未配置 SOTP 估值数据"
- 某 segment 缺 metric/peer → 表格里该行三个数字格全部 `--`，行尾标记 `已剔除`
- 标题区显示："**已剔除 N 个业务**（未配置或数据不全）"
- 即使部分剔除，仍展示能算的部分的 SOTP（明示口径）

---

## 6. 架构 / 文件结构

```
web/src/
├── app/
│   ├── valuation/
│   │   └── [ticker]/
│   │       └── page.tsx              ← 新：Server Component, 取 company + valuation
│   └── research/
│       └── [ticker]/
│           └── page.tsx              ← 改：顶部加 "估值评估 →" 按钮
├── components/
│   └── valuation/                    ← 新目录
│       ├── ValuationHeader.tsx       ← 公司名/币种/返回按钮
│       ├── ValuationVerdictCards.tsx ← 上方两张大卡（当前市值 vs SOTP）
│       ├── SegmentContributionBar.tsx← 横条贡献图（纯 CSS/SVG，无外部依赖）
│       ├── SegmentDetailTable.tsx    ← 分部明细表（行可展开看 peers）
│       ├── SensitivityStrip.tsx      ← ±20% 敏感性条
│       ├── DataCaveats.tsx           ← 时点 / 局限说明
│       └── EmptyState.tsx            ← 公司未配置 SOTP 的友好降级
├── lib/
│   └── valuation/
│       ├── sotp.ts                   ← 纯计算
│       ├── format.ts                 ← 大数格式化（亿/万/M/B）→ 复用现有 NumberFormat
│       └── verdict.ts                ← 档位判断 + i18n 文案
├── types/
│   └── valuation.ts                  ← 类型定义
└── data/companies/                   ← 6 个 JSON 加 valuation 字段
    ├── 01810.json                    ← 完整示例（多业务）
    ├── 600519.json                   ← 单业务示例（茅台）
    ├── AAPL.json
    ├── TSLA.json
    ├── 01811.json                    ← 米家生态
    └── 003816.json                   ← 中国广核

gateway/                              ← 不动
```

**关键架构原则：**
- Server Component 取数据（无加载态闪烁）
- 计算在 Server 完成（`computeSotp` 在 `page.tsx` 里调，把 `SotpResult` 传给组件）
- 所有展示组件接收已计算好的 `SotpResult`，零计算逻辑
- 不引入新的 chart 库（柱状图、敏感性条用 SVG/纯 CSS 实现，与现有 Sparkline 一致风格）

---

## 7. 测试计划

### 7.1 单元测试（`web/src/lib/valuation/__tests__/sotp.test.ts`）

| 用例 | 期望 |
|---|---|
| 单业务公司，全数据齐全 | sotpTotal = metric × median + netCash |
| 多业务，全部齐全 | 等于各 segment 加和 + netCash |
| 某 segment metric=null | 该 segment excluded=true, impliedValue=null, 不计入 |
| 某 segment peers=[] | 同上 |
| netCash=null | sotpTotal = segmentsTotal + 0 |
| netCash 为负 | 正确扣减 |
| 单 peer（中位=均值=该 peer） | impliedValue 正确 |
| 偶数个 peer | 中位 = 中间两个均值 |
| verdict 分档边界 +20%, +5%, -5%, -20% | 各档位文案正确 |
| `impliedUpsidePct` 浮点：currentMarketCap 与 sotp 相等 → 0.0 | verdict='FAIR' |

### 7.2 组件测试

- `EmptyState`：公司 JSON 无 valuation → 渲染正确文案
- `SegmentDetailTable`：缺数据行显示 `--` 而非 0
- `ValuationVerdictCards`：5 档 verdict 文案 + 颜色正确

### 7.3 E2E（手测/Playwright，可后置）

- 进入 `/valuation/01810` → 显示 4 段业务 + SOTP 总额
- 点 "← 回研究页" → 跳回 `/research/01810`
- 进入 `/valuation/600519`（茅台单业务）→ 只显示一段，UI 不崩

### 7.4 数据校验（人工 3×）

按"金融数据零容错"项目铁律，小米 01810 的数据在落库前**至少 3 次**跨源核对：
- TTM 营收：东方财富 / 雪球 / 港交所披露
- Peer 倍数：Yahoo Finance / Bloomberg 终端（或同类） / Stockanalysis.com
- 净现金：最近一期资产负债表 = 现金 + 短期投资 − 总有息负债

每个数字在 JSON 里都带 `asOf` 和 `source`，便于复核。

---

## 8. 风险 / 已知局限

| 风险 | 缓解 |
|---|---|
| 多元化公司的"业务边界"是会计口径决定的，可能与投资逻辑不一致 | 在 `rationale` 字段写清拆分依据；版面顶部说明"按公司财报披露口径" |
| Peer 倍数会过时 | `asOf` 强制；后续可加"超过 90 天未更新"红色徽标 |
| 净现金口径多样（含/不含金融性资产负债） | spec 里固定为：现金 + 短期投资 − 总有息负债（与值得信赖的卖方研究一致） |
| SOTP 数学正确不等于估值合理 | UI 底部"局限说明"区永久展示，提醒控股折价/税务/未披露资产等 |
| JSON 维护成本随 segment 数量上升 | MVP 只 6 家，到 20 家以上再考虑半自动化抓取 |

---

## 9. 实施阶段（高层）

详细实施计划由 writing-plans 产出。高层阶段：

1. **类型 + 计算 + 单测**（先做核心，独立于 UI）
2. **小米 01810 JSON 配置**（人工 3× 核对）
3. **页面 + 组件骨架**（先空状态 / 主页面 layout）
4. **VerdictCards + ContributionBar**（让一家公司能看见结果）
5. **DetailTable（含展开 peers）+ SensitivityStrip**
6. **EmptyState + DataCaveats + 缺数据降级**
7. **研究页加跳转按钮**
8. **剩余 5 家公司 JSON 配置**（每家也 3× 核对，单业务公司简单）
9. **E2E smoke + 自检 3 遍数据**
10. **commit + 后续 PR**

---

## 10. 决策记录

- **新建独立路由 vs 嵌入研究页**：选独立路由，理由是版面充裕、估值仪表盘信息密度高
- **手工 JSON vs 自动爬数据**：MVP 选手工，避免被数据源拉扯，先把"展示+计算"逻辑做扎实
- **是否接入 Gateway**：不接，所有数据在 JSON 里，零网络往返
- **图表库选型**：不引入新依赖，SVG/CSS 实现，与现有 Sparkline 风格一致
- **加总公式简单 vs 高级（WACC/DCF）**：选简单 SOTP，DCF 是后续模块
