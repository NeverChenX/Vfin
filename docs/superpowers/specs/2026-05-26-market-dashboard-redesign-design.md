# 首页"市场"模块重设计 · Design

**日期**：2026-05-26
**作者**：Hermes（与 Never 协作）
**状态**：Design (pending implementation plan)

---

## 1. Context & Goals

### 现状

`web/src/app/page.tsx` 的「市场」首页由两部分组成：

1. `MarketCards.tsx`（91 行）—— 4 张核心指数卡（上证 / 恒生 / 创业板 / 纳斯达克），仅显示价格、涨跌额、涨跌幅
2. `MarketsTable.tsx`（712 行，已偏大）—— 自选股表，含分类、排序、sparkline、同步状态

### 问题

- 信息量薄：除"4 个指数当下涨跌"外，看不出整个市场的**走向**和**情绪**
- 没有市场宽度、行业分布、跨市场联动、商品/汇率等"扫一眼大盘"必备维度
- 港股仅出现于一张恒生指数卡，缺乏港股专属视角

### Goals

设计一个"**顺手扫一眼大盘情绪 + 信息密度通过视觉编码实现**"的首页市场区。具体目标：

- **A 股 + 港股优先级 > 全球**：视觉空间分配上 A 股/港股占主要区域，全球次之
- **信息密度通过热力图、sparkline、色块带等视觉编码体现**，不堆文字
- **加载策略保持响应**：核心指数 5 秒级，重接口（涨跌家数）做 gateway 缓存
- **优雅降级**：任何 widget 拉数失败显示占位，不破坏布局

### Non-Goals

- 不做盘中实时决策仪表盘（无需毫秒级深度行情、分时图、tick-by-tick）
- 不做盘前盘后专属视图（无新闻 ticker、晨会模板、隔夜要闻）
- 不改自选股表（`MarketsTable.tsx`）的功能，仅保留在 L5
- 不引入新的图表库或大体积依赖

---

## 2. 页面架构（5 层 Bento）

### Layout 草图

```
┌─────────────────────────────────────────────────────────────┐
│ 标题区  "市场"  + "最新财报 / 自动刷新"  (现有保留)              │
├─────────────────────────────────────────────────────────────┤
│ L1 · 核心指数 (4 张卡 + 30 日 sparkline)                       │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐               │
│ │ 上证    │ │ 恒生    │ │ 创业板  │ │ 纳指    │               │
│ │ 3287.41 │ │ 17422   │ │ 2104    │ │ 15842   │               │
│ │ +0.56%  │ │ −0.71%  │ │ +1.02%  │ │ +1.12%  │               │
│ │ ╱╱╱╲   │ │ ╲╲╲╲   │ │ ╱╱╲╱   │ │ ╱╱╱╱   │               │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘               │
├─────────────────────────────────────────────────────────────┤
│ L2 · A 股全景（双列）                                          │
│ ┌─────────────────────────────────┐ ┌────────────────────┐   │
│ │ L2-L · 申万行业热力图 (~24 块)    │ │ L2-R · 市场宽度      │   │
│ │ □□□□□□□□  按涨跌幅着色            │ │ ↑1989 平628 ↓2617 │   │
│ │ □□□□□□□□  hover 显示名+涨跌      │ │ ▓▓▓░░▓▓▓▓▓▓▓▓     │   │
│ │ □□□□□□□□                         │ │ 涨停 42 / 跌停 7   │   │
│ └─────────────────────────────────┘ └────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│ L3 · 港股专区                                                  │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │
│ │ 恒生科技      │ │ 国企指数      │ │ 港股通净流入  │           │
│ │ 3922 −1.34%  │ │ 6021 −0.88%  │ │ +24.3 亿     │           │
│ └──────────────┘ └──────────────┘ └──────────────┘           │
├─────────────────────────────────────────────────────────────┤
│ L4 · 跨市场带（全球指数 · 商品 · 汇率）                          │
│ 道指 +0.42% │ 纳指 │ 标普 │ 日经 │ DAX │ 黄金 │ 原油 │ USDCNY │ USDJPY │
├─────────────────────────────────────────────────────────────┤
│ L5 · 自选股表 (保留现有 MarketsTable)                          │
└─────────────────────────────────────────────────────────────┘
```

### 视觉优先级

| 层 | 占垂直空间 | 视觉权重 |
|----|-----------|---------|
| L1 核心指数 | ~120-160px | 最高（hero） |
| L2 A 股全景 | ~180-220px | 高 |
| L3 港股专区 | ~80-100px | 中（独立行强调） |
| L4 跨市场带 | ~60-80px | 低（紧凑色块） |
| L5 自选股表 | flex | 中（用户主要交互区） |

L1+L2+L3 合计 ~380-480px = A 股 / 港股 内容占垂直空间约 70%（满足"A 股 + 港股优先级 > 全球"）。

---

## 3. 组件拆分

### 新建组件

放在 `web/src/components/market/`（新目录，与现有 `home/` 区分）：

| 组件 | 责任 | 行数预算 |
|------|------|---------|
| `MarketIndexCards.tsx` | L1 · 4 张指数卡 + 30 日 sparkline | ~150 行 |
| `SectorHeatmap.tsx` | L2-L · 申万行业热力图 | ~180 行 |
| `MarketBreadth.tsx` | L2-R · 涨跌家数 + 涨跌停 | ~120 行 |
| `HKZone.tsx` | L3 · 港股专区 | ~140 行 |
| `CrossMarketStrip.tsx` | L4 · 全球 + 商品 + 汇率 | ~180 行 |

### 保留 / 复用

| 组件 | 处理 |
|------|------|
| `MarketCards.tsx`（91 行） | 演化为 `MarketIndexCards.tsx`，加 sparkline，原文件删除 |
| `MarketsTable.tsx`（712 行） | **不动**，仅作为 L5 引入 |
| `MiniSparkline.tsx`（103 行） | L1 卡片复用 |
| `web/src/lib/poll.ts` | 所有新组件复用 `fetchAllLimited` / `startVisibilityPoll` / `fetchJSONSafe` |

### 共享 hooks（按需提取）

如果各 widget 中出现重复模式，再提取：

- `useHqQuoteBatch(symbols, pollMs)` —— 批量拉 quote + 按可见性轮询（基于现有 `startVisibilityPoll`）
- `useHqKlineSparkline(symbol, days)` —— 拉 N 日 kline + 5min 刷新

不提前抽象；YAGNI 优先。

---

## 4. 数据层（gateway endpoints）

### 已有，直接复用

| Endpoint | 用于 | 备注 |
|---------|------|------|
| `/api/hq/stock?symbol=X` | L1 quote, L3 quote, L4 美股/港股部分 | 现有 |
| `/api/hq/kline?symbol=X&period=day&count=30` | L1 sparkline | 现有 |

### 新增 endpoints（Phase 2）

**4.1 `/api/hq/breadth?market=cn`**

返回全 A 股涨跌家数聚合。

```json
{
  "market": "cn",
  "asOf": "2026-05-26T14:32:11+08:00",
  "total": 5234,
  "up": 1989,
  "flat": 628,
  "down": 2617,
  "limitUp": 42,
  "limitDown": 7
}
```

- **数据源**：Eastmoney `clist` API（`push2.eastmoney.com/api/qt/clist/get?...`），按市场过滤后 **gateway 服务端聚合**（不把 5000+ 行下发给浏览器）
- **缓存**：gateway 内存缓存 30 秒（与轮询频率匹配）
- **新增文件**：`gateway/src/services/breadth-service.js`、`gateway/src/providers/eastmoney-provider.js` 加 `getMarketBreadth(market)`

**4.2 `/api/hq/hk-connect`**

返回港股通南北向资金流。

```json
{
  "asOf": "2026-05-26T14:32:11+08:00",
  "southboundNet": 2430000000,
  "southboundDays": 3,
  "northboundNet": null
}
```

- **数据源**：Eastmoney `push2.eastmoney.com/api/qt/kamt/get`（或类似 HSGT 数据接口）
- **缓存**：gateway 60 秒
- **新增文件**：`gateway/src/services/hk-connect-service.js`、provider 方法

**4.3 `/api/hq/sectors?source=shenwan`**

返回申万一级行业涨跌幅列表。

```json
{
  "asOf": "...",
  "items": [
    { "code": "801010", "name": "农林牧渔", "pct": 1.23 },
    { "code": "801020", "name": "采掘",     "pct": -0.45 },
    ...
  ]
}
```

- **优先方案**：复用 `/api/hq/stock` 并发拉 31 个申万一级指数 symbol（如 `801010.sh`），客户端聚合
- **如不可用**：新建 endpoint，gateway 内部用 Eastmoney 板块 API `push2.eastmoney.com/api/qt/clist/get?fs=b:MK0021` 一次性返回所有 SW 一级行业
- **缓存**：30 秒
- **实施策略**：Phase 1 试客户端聚合方案。**判定标准**：若 31 个申万一级 symbol 中有效返回率 < 80%，或单次拉数耗时 > 3 秒，判定不可用，Phase 2 切换到服务端聚合 endpoint

**4.4 扩展 `/api/hq/stock` 支持商品 + 汇率**

新增 symbol 后缀：

| 后缀 | 含义 | 示例 | Sina 后端 symbol |
|------|------|------|-----------------|
| `.fx` | 外汇 | `USDCNY.fx`, `USDJPY.fx` | `fx_susdcny`, `fx_susdjpy` |
| `.cm` | 商品 | `XAU.cm` (黄金 COMEX 期货), `CL.cm` (WTI 原油期货) | `hf_GC`, `hf_CL` |

- **数据源**：Sina（`hq.sinajs.cn/list=fx_susdcny`、`hq.sinajs.cn/list=hf_GC`）
- **修改**：`gateway/src/services/symbol-normalizer.js` 加 `.fx` / `.cm` 后缀识别；`gateway/src/providers/sina-provider.js` 加对应 URL 构建
- **缓存**：现有 quote 缓存策略

**4.5 扩展 symbol-normalizer 支持非美海外指数**

| 指数 | 期望 symbol | 后端 |
|------|-----------|------|
| 日经 225 | `N225.jp` | Sina `int_n225` 或 Tencent `jpN225` |
| DAX | `DAX.de` | Sina `b_TWII` 类似 |
| FTSE 100 | `FTSE.uk` | Sina `b_FTSE` |

- 优先级中：DAX/FTSE 若数据源不稳定，Phase 1 直接显示"暂不可用"占位
- 日经必须支持（用户场景里直接点名了美日联动）

### 数据可得性总览

| Widget | Phase 1（前端） | Phase 2（gateway） |
|--------|----------------|-------------------|
| L1 指数 + sparkline | ✅ | — |
| L2-L 行业热力图 | ✅ 用 `/api/hq/stock` 并发拉申万 symbol | 若失败 → 新建 `/api/hq/sectors` |
| L2-R 市场宽度 | ❌ 显示占位 | **新建 `/api/hq/breadth`** |
| L3 港股专区指数 | ✅ | — |
| L3 港股通净流入 | ❌ 显示占位 | **新建 `/api/hq/hk-connect`** |
| L4 全球指数（美股部分） | ✅ | — |
| L4 全球指数（日经/DAX/FTSE） | ❌ 显示占位 | **扩展 symbol-normalizer + provider** |
| L4 商品 / 汇率 | ❌ 显示占位 | **扩展 `.fx` / `.cm` 后缀 + Sina provider** |

---

## 5. 轮询 / 缓存策略

每个 widget 的轮询频率按"信息变化速度"和"接口成本"匹配：

| Widget | 客户端轮询 | gateway 缓存 |
|--------|-----------|-------------|
| L1 指数 quote | 5 秒（沿用 `QUOTE_POLL_MS`） | 现有 |
| L1 30 日 sparkline | 仅 onMount + 每 5 分钟 | 现有（kline 已缓存） |
| L2-L 行业热力图 | 10 秒 | 30 秒 |
| L2-R 市场宽度 | 30 秒 | **30 秒**（聚合接口必须挡） |
| L3 港股 quote | 5-10 秒 | 现有 |
| L3 港股通净流入 | 60 秒 | 60 秒 |
| L4 全球指数 | 30 秒（境外行情非实时） | 现有 |
| L4 商品 / 汇率 | 30 秒 | 30 秒 |

所有客户端轮询统一用 `startVisibilityPoll`，**Tab 不可见时自动暂停**（现有机制，免费拿到）。

---

## 6. 错误处理 / 优雅降级

### 设计原则

**任何 widget 拿不到数据都不能破坏整体布局。** 占位优先于消失。

### 四态显示规则

| 状态 | 显示 | 何时 |
|------|------|------|
| `loading`（首次加载） | 骨架屏（脉冲灰块） | onMount 到首个响应 |
| `success` | 实际数据 | 拿到 quote |
| `stale`（最后值 + 灰化） | 旧值 + 顶部小角标 "5 分钟前" | 拿到过数据但连续 ≥3 次后续轮询失败 |
| `error` / `unavailable` | "暂不可用"灰色占位 | 从未拿到过有效数据，或接口持续报错 |

### 局部错误隔离

每个 widget 独立 fetch + 独立 state，**任意一个失败不影响其他 widget**。已有 `fetchJSONSafe` 不抛异常，沿用模式。

### 用户可见的错误

不弹 toast。错误只在 widget 内显示占位。如需排查，console.warn 给开发者。

---

## 7. 实施分期

### Phase 1（纯前端 + 现有 API，~1.5 天）

- 重构 `web/src/app/page.tsx`：引入 5 层结构
- 实现 `MarketIndexCards`（基于 `MarketCards` 演化 + `MiniSparkline`）
- 实现 `SectorHeatmap`（试用现有 `/api/hq/stock` 拉申万 symbol）
- 实现 `HKZone`（指数部分能显示，港股通显示占位）
- 实现 `CrossMarketStrip`（美股部分能显示，日经/DAX/FTSE/商品/汇率显示占位）
- 实现 `MarketBreadth`（全部显示占位）
- L5 `MarketsTable` 不动
- **里程碑**：用户能看到完整 5 层布局，部分 widget 真数据 + 部分占位

### Phase 2（gateway 工作，~3-5 天）

按优先级（用户重点提到的优先做）：

1. **`/api/hq/breadth`**（涨跌家数）—— A 股核心信号
2. **Sina provider 扩展 `.fx` 后缀**（USDCNY / USDJPY）—— 用户重点
3. **Sina provider 扩展 `.cm` 后缀**（黄金 / 原油）
4. **`/api/hq/hk-connect`**（港股通净流入）
5. **symbol-normalizer 扩展非美海外指数**（日经 / DAX / FTSE）
6. **`/api/hq/sectors`**（若 Phase 1 客户端聚合方案不稳定）

每个 endpoint 都遵循现有模式：provider 拉数 → service 缓存 → route handler → 客户端 `/api/hq/...` 透传。

### Phase 3（仅在用户要求时）

- 行业热力图按"权重"（市值）调整色块大小（treemap）
- L1 卡片增加"今日成交额 / 换手率"
- L4 加资金流（北向 / 主力）

---

## 8. 测试策略

### 单元测试

- `SectorHeatmap`：给定 `pct` 数组 → 验证渲染色块顺序、颜色映射
- `MarketBreadth`：给定 `{up, flat, down}` → 验证比例条宽度
- `CrossMarketStrip`：占位 / 成功 / 错误三态切换

### 集成测试

- gateway 新 endpoint：mock provider 响应 → 验证缓存命中 + 错误透传

### 可视回归

- Playwright 截图 4 个断点（375 / 768 / 1024 / 1440）—— 验证 5 层布局在移动 / 桌面都不破

### 不做

- 不做 100% widget E2E（轮询接口测试成本高、价值低）
- 不引入新的测试框架

---

## 9. Open Questions（已自主决定）

| 问题 | 决定 |
|------|------|
| Phase 2 backend 工作量是否接受？ | ✅ 接受，必须做 |
| 拿不到数据的 widget 如何处理？ | 显示"暂不可用"占位，不删除 widget |
| 行业热力图数据源 | Phase 1 试申万 quote 客户端聚合；失败则 Phase 2 建专属 endpoint |
| 商品/汇率数据源 | Sina（已集成，最小新代码） |
| 涨跌家数高成本接口 | gateway 30 秒缓存 |
| 各 widget 轮询频率 | 按变化速度差异化（5s ~ 60s） |
| 移动端策略 | 5 层垂直堆叠天然友好；L4 跨市场带在 <768px 横向滚动 |

---

## 10. 文件改动清单（概览）

### 新增

```
web/src/components/market/
├── MarketIndexCards.tsx
├── SectorHeatmap.tsx
├── MarketBreadth.tsx
├── HKZone.tsx
└── CrossMarketStrip.tsx
```

```
gateway/src/services/
├── breadth-service.js          # Phase 2
└── hk-connect-service.js       # Phase 2
```

```
gateway/src/routes/market-routes.js
+ router.get('/breadth', ...)
+ router.get('/hk-connect', ...)
+ router.get('/sectors', ...) (条件性)
```

### 修改

```
web/src/app/page.tsx                              # 重构 5 层
gateway/src/services/symbol-normalizer.js         # +.fx / .cm / .jp / .de / .uk
gateway/src/providers/sina-provider.js            # +商品/汇率 URL
gateway/src/providers/eastmoney-provider.js       # +breadth, +hk-connect
```

### 删除

```
web/src/components/home/MarketCards.tsx           # 被 MarketIndexCards 取代
```

### 不动

```
web/src/components/home/MarketsTable.tsx          # 保留
web/src/components/home/MiniSparkline.tsx         # 复用
web/src/lib/poll.ts                               # 复用
```

---

## 11. 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| HQChart 不返申万指数 quote | 行业热力图 Phase 1 拿不到数据 | Phase 2 新建专用 endpoint 兜底 |
| Eastmoney clist 接口被限频 | 涨跌家数不稳定 | gateway 30s 缓存 + 失败缓存最后值 |
| Sina 商品 / 汇率 symbol 格式变化 | 价格不显示 | provider 层做 schema 校验 + 占位 |
| 行情服务商对境外指数支持有限 | 日经 / DAX / FTSE 显示占位 | 显式标识"暂不可用"，不阻塞发布 |
| 5 层导致首屏过高，移动端体验差 | 滚动距离长 | 移动端 L4 跨市场带横向滚动；如 Lighthouse < 75 引入 L5 lazy mount（Phase 3 优化） |

---

## 12. 成功标准

Phase 1 上线后：

- 用户打开首页 < 2 秒能看到 L1（指数 + sparkline）+ L5（自选股表骨架）
- L2 / L3 / L4 在 1 秒内填充 quote 数据或显示占位
- 任意 widget 失败不导致整页崩溃
- Lighthouse Performance ≥ 75（桌面）

Phase 2 完成后：

- 所有 widget 都有真实数据，无"暂不可用"占位
- 涨跌家数、港股通净流入、USDCNY / USDJPY 在工作时段正常刷新
