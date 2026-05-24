# VFin · 设计文档

> 日期：2026-05-14
> 状态：Phase 1 设计冻结，进入实施
> 上游 specs：`Analysis_Company/docs/superpowers/specs/2026-05-12-fin-analysis-website-design.md`

---

## 1. 目标

把 `Analysis_Company`（财报分析 / Next.js）和 `HQChart`（实时行情 / Express + 单文件 HTML）整合成同一个 **A 股个人研究终端**，
采用 [币安交易页](https://www.binance.com/zh-CN/trade/BTC_USDT?type=spot) 的视觉语言：深色 + 金色强调 + 高密度信息 + 等宽数字。

**用户**：单人 / 小团队的个股研究使用，登录后查看实时行情与历史财报。

---

## 2. Phase 1 范围

包含：

- 行情交易页 `/trade/[ticker]`：HQChart K 线 / 盘口 / 资金 / 公告
- 财报研究页 `/research/[ticker]`：沿用 Analysis_Company 三大表 + 4 视图
- 首页 `/`：极简自选股列表
- 搜索 `/search`：调 gateway `/api/search`
- 登录 `/login`、注册 `/register`（保留现有 file-based auth）
- 全局 Shell：顶部搜索 + ticker chips + 用户菜单

不包含（YAGNI）：

- 公司对比页、比率页（Phase 2）
- WebSocket 推送（用 5 秒轮询 + HQChart 自带 IsAutoUpdate）
- 浅色主题（单深色主题）
- 港 / 美股财报数据（仅行情，财报数据只覆盖现有 A 股样本）

---

## 3. 决策点（用户确认）

| # | 决策 | 选择 |
|---|------|------|
| 1 | 路由结构 | 分离路径：`/trade/[ticker]` + `/research/[ticker]` |
| 2 | 主题 | 单深色 |
| 3 | 涨跌色 | 币安原版：**绿涨 / 红跌** |
| 4 | 实时更新 | 5 秒轮询（HQChart 自带） |
| 5 | HQChart 集成 | React 组件包装原生 JS |
| 6 | 首页 | 极简自选股列表 |
| 7 | 登录系统 | 保留（沿用 Analysis_Company file-based session） |

---

## 4. 系统架构

```
/home/Neverchen/project/VFin/        ← 项目根
├── web/                              ← Next.js 15 (合并自 Analysis_Company)
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx              首页 = 自选股列表
│   │   │   ├── trade/[ticker]/       行情页（新增）
│   │   │   ├── research/[ticker]/    财报页（迁自 companies/[ticker]）
│   │   │   ├── search/
│   │   │   ├── login/  register/
│   │   │   └── api/
│   │   │       ├── auth/             保留
│   │   │       └── fetch-company/    保留
│   │   ├── components/
│   │   │   ├── shell/                TopBar / GlobalLayout / SearchBox
│   │   │   ├── hqchart/              KLineChart / MinuteChart React 包装
│   │   │   ├── trade/                Watchlist / OrderBook / TickerHeader
│   │   │   ├── research/             沿用现有 statement 组件
│   │   │   └── ui/                   基础按钮 / 数字格式化
│   │   ├── lib/
│   │   │   ├── finance/              保留
│   │   │   ├── api/                  gateway client (fetch wrapper)
│   │   │   └── auth.ts               保留
│   │   ├── data/companies/           保留 (静态 JSON)
│   │   └── middleware.ts             保护 /trade /research（白名单除外）
│   ├── public/hqchart/               HQChart js 资源（从 HQChart/frontend 复制）
│   ├── next.config.ts                rewrites /api/hq/* → :18080/api/*
│   ├── package.json                  port 3816 不变
│   └── ...
│
├── gateway/                          ← Express (迁自 HQChart/backend/gateway)
│   └── package.json                  port 18080 不变
│
├── services/                         ← Python 指标编译器（迁自 HQChart/services）
│
├── scripts/                          ← 项目级脚本
│   ├── start-all.sh                  并发启动 gateway + web
│   └── ...
│
└── docs/superpowers/specs/
    └── 2026-05-14-vfin-design.md
```

**端口分配**

| 服务 | 端口 | 备注 |
|------|------|------|
| Next.js (web) | 3816 | 默认前台入口 |
| Express (gateway) | 18080 | 仅服务 API，被 Next.js rewrites 代理 |

**网络流**

```
浏览器 ─► Next.js :3816 ──┬─► /api/hq/*    rewrites→ Express :18080 (行情)
                          ├─► /api/auth/*           Next.js API route
                          ├─► /api/fetch-company    Next.js API route
                          └─► /hqchart/*.js         Next.js 静态资源
```

---

## 5. 视觉系统

### 色板

```css
/* 背景三层 */
--bg-base:    #0B0E11;  /* 页面底色 */
--bg-elev1:   #181A20;  /* 容器 */
--bg-elev2:   #1E2329;  /* 卡片 */
--bg-elev3:   #2B3139;  /* 高亮行 / hover */

/* 文字 */
--text-primary:   #EAECEF;
--text-secondary: #B7BDC6;
--text-tertiary:  #848E9C;
--text-disabled:  #5E6673;

/* 分割 */
--border-base:    #2B3139;
--border-strong:  #474D57;

/* 强调金（币安主色） */
--brand-yellow:   #F0B90B;
--brand-yellow-hover: #F8D33A;

/* 涨跌（币安原版：绿涨红跌） */
--up:   #0ECB81;
--down: #F6465D;
--flat: #848E9C;
```

### 字体

```css
--font-sans: "Inter", "PingFang SC", "Hiragino Sans GB",
             "Microsoft YaHei", system-ui, sans-serif;
--font-mono: "IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace;

/* 全局数字 tabular-nums */
```

### 节奏

- 基础字号 13px（高密度）
- 行距 1.4
- 卡片圆角 4px
- 阴影几乎不用，依赖背景三层区分

---

## 6. 路由 / 页面

### `/`（首页）

极简自选股列表，单卡片占满主体：

| 列 | 内容 |
|---|---|
| 代码 | `003816.SH` |
| 名称 | 中国广核 |
| 最新价 | tabular，涨跌色 |
| 涨跌额 / 涨跌幅 | 同上 |
| 24h 振幅 | text-secondary |
| sparkline | 30 日，涨跌色 |
| 操作 | 删除 |

底部一个 "+ 添加" 按钮，弹出搜索面板。点击行 → `/trade/[ticker]`。

### `/trade/[ticker]`（行情交易）

三段布局（min-width 1280px）：

```
┌──────────────────────────────────────────────────────┐
│ TopBar                                                │
├──────────────────────────────────────────────────────┤
│ TickerHeader（代码/名称/价格大字/涨跌/24h 统计 chips）│
├────────────┬───────────────────────────┬─────────────┤
│            │                           │             │
│ Watchlist  │  HQChart K 线主图          │  盘口五档    │
│  (24%)     │   + 副图（VOL / MACD）     │  成交明细    │
│            │   工具条（粒度/指标/画线）  │  资金流向    │
│            │                           │  公告（精简）│
│            ├───────────────────────────┤             │
│            │  底部 Tab: 分时/集合竞价/  │             │
│            │  新闻/公告/财务概览        │             │
│            │                           │             │
└────────────┴───────────────────────────┴─────────────┘
```

- 中央 K 线由 `<HQChart>` 组件渲染，内部 `JSChart.Init`
- 底部 "财务概览" Tab 显示利润表关键 5 行，下方链接 → `/research/[ticker]?statement=IS`

### `/research/[ticker]`（财报研究）

完全继承 Analysis_Company 既有页面（包括 4 视图 / 期间粒度 / sparkline / CFA 双语），
仅做视觉适配（深色 + Binance tokens）。

URL 状态保持原 spec（`statement` / `period` / `periods` / `view` / `unit`）。

新增：右上角 "对照行情" 按钮 → 抽屉拉出 K 线小窗（复用 `<HQChart>`）。

### `/search?q=...`

调 `/api/hq/search`（gateway），结果分组：A 股 / 港股 / 美股 / 指数 / 基金。点击 → `/trade/[ticker]`。

### `/login`、`/register`

沿用现有，仅深色主题适配。

---

## 7. HQChart React 包装

### 加载策略

HQChart 资源（`umychart.js`、`umychart.complier.js` 等）放到 `web/public/hqchart/jscommon/`。

`<HQChart>` 组件首次挂载时：

1. 检查 `window.JSChart` 是否已存在，没有则按顺序注入 7 个 `<script>` 到 `<head>`
2. 等所有脚本 `load` 完成
3. `useEffect` 中 `this.chart = JSChart.Init(divRef.current, false, true)`
4. 配置 Option（参考 HQChart 现有 `KLineChart` 类），把 `Symbol` 设为 props.ticker
5. `IsAutoUpdate: true, AutoUpdateFrequency: 5000` 保留 5 秒轮询
6. `Network.UrlHead` 指向 `/api/hq`（rewrite 到 gateway）
7. 组件卸载时调用 `chart.JSChartContainer.OnDestroy?.()`

### Props 接口

```ts
interface HQChartProps {
  ticker: string;            // "003816.SH"
  period?: number;           // 0=日 1=周 2=月 ... 5/6/7=分钟
  indicators?: string[];     // ["MA","VOL","MACD"]
  style?: 'black' | 'white'; // 默认 black
  height?: number;
  onReady?: (chart: unknown) => void;
}
```

### 类型与全局

`window.JSChart` 等用 `declare global` 在 `web/src/types/hqchart.d.ts` 声明 `unknown`，组件内部 cast。

---

## 8. 数据 / API

### gateway 已有接口（保持不变）

| 路径 | 用途 |
|------|------|
| `/api/health/live` | 健康 |
| `/api/stock` | 实时行情 |
| `/api/kline` | K 线 |
| `/api/minute` | 分时 |
| `/api/capital` | 资金 |
| `/api/callauction` | 集合竞价 |
| `/api/news` | 新闻 |
| `/api/announcements` | 公告 |
| `/api/search` | 搜索 |
| `/api/watchlist` | 自选股 |

Next.js `rewrites`：

```ts
{ source: '/api/hq/:path*', destination: 'http://localhost:18080/api/:path*' }
```

### Next.js 自有 API（保留）

| 路径 | 用途 |
|------|------|
| `/api/auth/login` | 登录 |
| `/api/auth/register` | 注册 |
| `/api/auth/logout` | 登出 |
| `/api/fetch-company` | 静态财报本地拉取（不动） |

### 自选股按用户隔离

gateway 现状是单 SQLite 表无用户字段。**Phase 1 简化**：自选股仍走 gateway 但前端按 `userId` 做 namespace（`localStorage.watchlist:<userId>` 缓存，gateway 调用时附 `?owner=<userId>`），gateway 表加 `owner TEXT NOT NULL DEFAULT 'default'` 列与 WHERE 过滤。Phase 2 真正接入 session。

---

## 9. 鉴权与中间件

`web/src/middleware.ts` 在原基础上：

- 公开路径：`/login` `/register` `/api/auth/*` `/api/hq/*`（gateway 已是内网）`/hqchart/*`（静态）
- 受保护：`/` `/trade/*` `/research/*` `/search` `/api/fetch-company`
- 鉴权失败：页面跳 `/login?next=...`；API 返 401 JSON

---

## 10. 启动 / 部署

根目录新增 `package.json`：

```json
{
  "scripts": {
    "dev": "concurrently -k -n gateway,web -c yellow,cyan \"npm:dev:gateway\" \"npm:dev:web\"",
    "dev:gateway": "cd gateway && npm run dev",
    "dev:web": "cd web && npm run dev",
    "install:all": "npm install --prefix gateway && npm install --prefix web"
  }
}
```

开发：`npm run dev`
浏览器：`http://localhost:3816`

---

## 11. 实施顺序

1. 写 spec ← 当前
2. 建立 `/web` `/gateway` `/services` 目录并迁移文件
3. 配置 Next.js（rewrites/deps/tsconfig）
4. 深色 Binance 主题（CSS + tokens）
5. 通用 Shell（TopBar / Layout / SearchBox）
6. HQChart React 包装（含资源迁移到 `web/public/hqchart/`）
7. `/trade/[ticker]` 行情交易页
8. `/research/[ticker]` 财报研究页（迁移 + 主题适配）
9. `/` 首页 = 自选股列表
10. `/search` 搜索页
11. 登录系统适配（深色主题 + middleware 白名单）
12. 根目录启动脚本 + README
13. 冒烟验证（next build + 手测主流程）

---

## 12. 已知风险

- **HQChart 资源体积大**（jscommon 整套约 12MB），首屏首次进 `/trade` 会有可观加载时间。Phase 1 接受，Phase 2 可做按需加载与子集裁剪。
- **HQChart Style 与 Tailwind 共存**：HQChart 自带的 popMenu / DialogTooltip 等弹层有自己的 CSS class，可能与 Tailwind preflight 冲突。Phase 1 用 CSS 作用域（`.hqchart-root { all: revert; }`）兜底，问题集中暴露后再细化。
- **Edge Middleware vs Node SQLite**：middleware 用 Edge runtime 只能做存在性校验，深度校验留给页面/API route 用 Node runtime 处理 — 沿用现有方案。

---

## 13. 测试与验收

Phase 1 完成判定：

- [ ] `npm run dev` 一条命令同时跑起 gateway + web
- [ ] 登录后可看到 `/`（自选股列表，至少含 3 个样本 ticker）
- [ ] 点 ticker 进 `/trade/[ticker]`，K 线正常渲染且 5 秒自动刷新
- [ ] 顶栏切换到 "财报研究" 进入 `/research/[ticker]`，三大表 + 4 视图功能完整
- [ ] 搜索框输入 "广核" 能返回 003816 并跳转
- [ ] 整站深色风格统一，无白底 flash
- [ ] `next build` 成功无 type error
