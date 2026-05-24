# 财报分析网站 · 设计文档（Spec）

> 日期：2026-05-12  
> 作者：Claude（按用户授权独立决策）  
> 状态：Phase 1 MVP 设计冻结，准备进入实现

---

## 1. 目标

构建一个多公司、多期间的财报分析网站。Phase 1 聚焦把"**多公司 × 三大报表 × 多期并排 × 4 个分析维度**"的展示和切换体验做透，数据源走静态 JSON，不引入后端。

**预期使用场景**：

- 用户从顶部下拉选定一家公司
- 在 Tab 之间切换利润表 / 资产负债表 / 现金流量表
- 切换期间粒度（年 / 半年 / 季）和并排期数
- 在金额 / 同比 / 环比 / 占营收 4 种视图间切换看同一组数据
- 每行右侧 sparkline 显示跨期趋势
- CFA 英文缩写在每个科目旁内联显示，便于中英对照

**显式排除**（YAGNI）：

- 筛选功能（用户明确不要）
- 用户系统 / 权限 / 多租户
- 数据上传 / PDF 解析
- 外部数据 API
- 公司间对比页（Phase 2）
- 比率分析页（Phase 2）

---

## 2. 范围

### Phase 1（本次设计范围）

- 3 家公司的静态 JSON 数据：中国广核 003816 / 长江电力 600900 / 国电南瑞 600406
- 三大报表完整 schema：利润表 18 项、资产负债表 26 项、现金流量表 12 项
- 17 个期间覆盖：年度 5（2021–2025） + 半年 4（2024H1/H2、2025H1/H2） + 季度 8（2024Q1–2025Q4）
- 公司分析页 `/companies/[ticker]`，Tab 切三大表
- 顶部全局控件：公司下拉 / 期间粒度 / 期数 / 4 视图 toggle
- CFA 英文缩写在科目名后括号内联（`营业利润 (EBIT)`），完整英文在 hover tooltip
- 同比 / 环比 / 占营收 / sparkline 四种分析维度

### Phase 2（之后单独 spec）

- 公司对比页（同一期间 N 家公司同科目并排）
- 比率页（ROE / 杜邦分解 / 流动比率 等 CFA 常用比率）
- 数据上传与解析

### Phase 3

- 外部数据 API 接入
- 用户自定义看板与订阅

---

## 3. 信息架构与路由

### 路由

| 路径 | 说明 |
|------|------|
| `/` | 公司列表 / 引导页 |
| `/companies/[ticker]` | 公司分析主页，三大表 Tab 切换 |

### URL 状态（query string）

| 参数 | 取值 | 默认值 |
|------|------|--------|
| `statement` | `IS \| BS \| CF` | `IS` |
| `period` | `Y \| H \| Q` | `Y` |
| `periods` | 正整数 | `Y → 5`，`H → 4`，`Q → 8` |
| `view` | `amount \| yoy \| qoq \| common` | `amount` |
| `unit` | `auto \| yi \| wan \| yuan` | `auto` |

所有控件状态都进 URL — 刷新 / 书签 / 分享都保留视图，无 localStorage 第二层。

### 渲染策略

- Next.js 15 App Router
- 公司页 SSG：`generateStaticParams()` 列出所有 ticker，`revalidate: false`
- JSON 数据在 build 时以 `import` 加载，零运行时 fetch 开销
- 顶部控件为 Client Component，通过 `useRouter().replace` 写回 URL
- StatementTable 是 Server Component，从 `searchParams` 读取 URL 参数

---

## 4. 数据模型

### TypeScript 类型（`src/types/finance.ts`）

```ts
export type PeriodGranularity = 'Y' | 'H' | 'Q';

export interface PeriodKey {
  year: number;
  granularity: PeriodGranularity;
  index?: 1 | 2 | 3 | 4;  // H/Q 时必填；Y 时 undefined
}

export interface SubjectMeta {
  id: string;
  zh: string;
  cfa: string;
  cfaFull?: string;
  level: 0 | 1 | 2;
  kind: 'item' | 'subtotal' | 'total';
  sign: 'add' | 'sub' | 'neutral';
  parentId?: string;
  formula?: string;  // 仅 subtotal/total 拥有，可展示
}

export interface StatementSchema {
  id: 'IS' | 'BS' | 'CF';
  zhName: string;
  cfaName: string;
  subjects: SubjectMeta[];
}

export interface PeriodValues {
  period: PeriodKey;
  values: Record<string, number | null>;  // key = subject.id
}

export interface CompanyFinancials {
  ticker: string;
  name: string;
  shortName?: string;
  industry: string;
  currency: 'CNY' | 'USD' | 'HKD';
  unit: 'yuan' | 'wan' | 'yi';  // JSON 数值的单位
  accountingStandard: 'CAS' | 'IFRS' | 'US-GAAP';
  statements: {
    IS: { schema: StatementSchema; periods: PeriodValues[] };
    BS: { schema: StatementSchema; periods: PeriodValues[] };
    CF: { schema: StatementSchema; periods: PeriodValues[] };
  };
}
```

### 关键决策

1. **Schema 与数据分离**：`subjects[]` 决定行顺序、缩进、CFA 标签、加减号；`PeriodValues` 只装数字。换公司、换准则只改 schema。
2. **稳定 ID，不用中文名做 key**：未来改"营业收入"也不会丢数据。
3. **小计/合计写死在 JSON，dev-mode 用 zod refinement 校验**：避免浮点累计误差；不一致时 dev 警告 + 生产仍信任 JSON。
4. **单位策略**：JSON 存原始 unit（中广核用 `yi`），运行时按数量级自动选展示单位。
5. **`null` vs `0`**：科目不适用用 `null`（渲染 `—`，不参与同比计算）；零值用 `0`。
6. **`ni_parent + ni_minority = net_income` 强约束**：mock 数据按 65/35 拆。
7. **BS `retained_earnings` 作平衡塞子**：让 `total_assets = total_liab + total_equity` 严格成立。

### 三大报表 schema 摘要

**利润表（18 项）**：营业收入、其他业务收入、营业总收入 ◆、营业成本、税金及附加、毛利润 ◆、销售费用、管理费用、研发费用、财务费用、其他收益、投资收益、营业利润 ◆ (EBIT)、营业外收支净额、利润总额 ◆ (EBT)、所得税费用、净利润 ◆、归母净利润、少数股东损益、其他综合收益、综合收益总额 ★

**资产负债表（26 项）**：货币资金、应收账款、存货、其他流动资产、流动资产合计 ◆、固定资产、在建工程、无形资产、长期股权投资、其他非流动资产、非流动资产合计 ◆、资产总计 ★、短期借款、应付账款、其他流动负债、流动负债合计 ◆、长期借款、其他非流动负债、非流动负债合计 ◆、负债合计 ◆、股本、资本公积、未分配利润、归母股东权益 ◆、少数股东权益、所有者权益合计 ◆、负债和所有者权益总计 ★

**现金流量表（12 项）**：经营活动现金流入、经营活动现金流出、经营活动现金流量净额 ◆ (CFO)、投资活动现金流入、投资活动现金流出、投资活动现金流量净额 ◆ (CFI)、筹资活动现金流入、筹资活动现金流出、筹资活动现金流量净额 ◆ (CFF)、现金净增加额 ◆、期初现金、期末现金 ★

（◆ = subtotal，★ = total）

---

## 5. 组件分解

```
<CompanyPage>            (Server, /companies/[ticker])
  ├── <TopBar>            (Client, sticky)
  │     ├── <CompanySelector>      下拉
  │     ├── <PeriodGranularitySwitch>  Y / H / Q
  │     ├── <PeriodCountSlider>    并排期数
  │     ├── <AnalysisViewToggle>   amount / yoy / qoq / common
  │     └── <UnitSelector>         auto / 亿 / 万 / 元
  ├── <StatementTabs>     (Client)  IS / BS / CF
  └── <StatementTable>    (Server)
        ├── <TableHeader>          公司名 | 期间列 × N | 趋势
        └── <SubjectRow>           对每个 subject 一行
              ├── <SubjectLabel>   中文名 + (CFA) chip + tooltip
              ├── <PeriodCell> × N 数值 + 附加视图标记
              └── <Sparkline>      右侧迷你折线
```

### 组件契约

| 组件 | 类型 | 输入 | 关键职责 |
|------|------|------|---------|
| `TopBar` | Client | `companies[]`, `currentTicker`, URL searchParams | 同步控件 → URL |
| `StatementTabs` | Client | `currentStatement` | 切换 `statement` 参数 |
| `StatementTable` | Server | `schema`, `periods`, `view` | 渲染表格 |
| `SubjectRow` | Server | `subject`, `periodValues[]`, `view`, `unit` | 渲染一行 |
| `PeriodCell` | Server | `value`, `view`, `previousValue?`, `revenueValue?`, `unit` | 主数 + 副标记 |
| `Sparkline` | Client | `values[]` | SVG 折线 |
| `NumberFormat` | Server | `value`, `unit`, `original_unit` | 单位换算 + 负数括号 |

---

## 6. UI 关键设计

### 6.1 CFA 标签呈现

形式：`营业利润 (EBIT)` — 中文主标，CFA 缩写括号内联。  
hover：tooltip 显示 `cfaFull`（如 `Earnings Before Interest & Tax`）。  
样式：CFA 缩写用浅色（`text-slate-500`），尺寸略小（`text-sm`），让中文主体优先。

### 6.2 多期并排

- 默认 `Y/5` `H/4` `Q/8`
- 列顺序：旧 → 新（最新一期在最右，符合趋势阅读习惯）
- 列宽固定 `min-w-[108px]`，超出横向滚动
- 列首：`2024` / `2024H1` / `2024Q3`

### 6.3 4 个分析视图

- `amount`：仅显示数值
- `yoy`：数值 + 灰色 `+12.4%` 同比小字（同公司、同期间类型、同 index、年份-1）
- `qoq`：数值 + 灰色 `-3.1%` 环比小字（按时序前一格）
- `common`：数值 + 灰色 `23.4%` 占比小字
  - IS：分母 = 同期 `rev_total`
  - BS：分母 = 同期 `total_assets`
  - CF：分母 = 同期 `op_cf_in`

视觉规则：增长正数 `text-emerald-600`，下降 `text-rose-600`。

### 6.4 Sparkline

- 永远显示（不受 `view` 影响）
- 取当前 granularity 下所有可用期数
- 高 `16px`，宽 `80px`，无坐标轴，仅折线
- 最新点用圆形 dot 高亮

### 6.5 行视觉层级

- `level: 0`（小计/合计）：背景色 `bg-slate-50`，字重 `font-semibold`
- `level: 0 + kind: total`：再加上边框 `border-t-2`
- `level: 1`：默认
- `level: 2`：左缩进 `pl-6`，字号 `text-sm`

### 6.6 数字格式

- 正数原样
- 负数用括号：`(45.60)`，颜色 `text-rose-600`
- `null` 渲染 `—`
- 单位策略：根据数值数量级自动切换
  - `auto`：所有列共用同一展示单位，按当前页面最大值数量级决定
  - 强制单位时直接换算

---

## 7. 错误处理

| 场景 | 行为 |
|------|------|
| ticker 不存在 | Next.js `notFound()` → 404 页 |
| JSON parse 失败 | Build 时 zod 抛错（fail-fast，不允许损坏数据进生产） |
| Schema 小计不匹配 | dev 模式 `console.warn`，prod 静默信任 JSON |
| 数值 `null` | 渲染 `—`，YoY/QoQ/Common 计算跳过该格 |
| `previousValue` 为 0 | YoY/QoQ 显示 `—`（避免除零） |
| 数值过大（>1e15） | 强制切换到"亿"单位 + 警告 |
| 期间不连续 | sparkline 不补 0，按实有点连线 |

---

## 8. 测试策略

### 单元测试（Jest 或 Vitest）

- `lib/finance/format.ts`：单位换算 / 负数括号 / null 渲染
- `lib/finance/analysis.ts`：YoY / QoQ / Common-Size 边界（除零、null、零值）
- `lib/finance/period.ts`：period sort / 找前一期 / 同期上年

### 组件测试（React Testing Library）

- `SubjectRow` 在 4 种 `view` 下的快照
- `NumberFormat`：正/负/零/null/超大数边界
- `TopBar`：URL 写回行为

### 集成测试

- 公司页完整渲染 + URL 参数变体（statement、period、periods、view）
- ticker 不存在 → 404

### 视觉回归（Playwright）

- 三种公司 × 三个 statement × 四个 view = 36 个截图基准

### 覆盖率目标：80%+

---

## 9. Phase 切分与里程碑

### MVP 完成定义

- [ ] 三家公司 JSON 完整
- [ ] schema + 类型 + zod 校验通过
- [ ] 公司页可访问且 URL 参数生效
- [ ] 三大表 Tab 切换正常
- [ ] 年/半年/季 切换 + 期数变更工作
- [ ] 4 个分析视图全部实现
- [ ] CFA 标签 + tooltip 工作
- [ ] Sparkline 显示
- [ ] 移动端可读（≥ 375px）

### 实施顺序建议

1. **D1**：项目骨架（Next 15 + TS + Tailwind）、types、zod、schemas
2. **D2**：数据加载层 + format 工具 + analysis 工具 + 测试
3. **D3**：StatementTable + SubjectRow + PeriodCell（amount view）
4. **D4**：4 个 view + sparkline
5. **D5**：TopBar + URL 同步 + StatementTabs
6. **D6**：移动适配、CFA tooltip、视觉打磨
7. **D7**：测试、视觉回归、文档

---

## 10. 附录：本次会话拍板的所有决策

1. 数据源：Phase 1 静态 JSON，后续再扩展
2. 公司：3 家（核电 / 水电 / 电网设备）
3. 报表：三大表（IS / BS / CF）全做
4. 技术栈：Next.js 15 App Router + TypeScript + Tailwind
5. 列布局：多期并排（不是单期 + 同比列）
6. CFA 标签：中文 `(EBIT)` 内联，hover 出全英文
7. 分析维度：全部 4 个（YoY / QoQ / Common-Size / Sparkline）
8. 信息架构：公司页 + Tab 切三大表
9. URL 状态：所有控件进 URL
10. 小计校验：JSON 写死 + dev-mode 警告
11. 会计准则：Phase 1 仅 CAS
12. 单位：JSON 存原始 unit，运行时智能换算
13. 期间：5 年 + 4 半年 + 8 季度 = 17 期
14. `ni_parent / ni_minority`：固定 65 / 35 拆分
15. BS 平衡：`retained_earnings` 做塞子
