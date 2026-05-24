# VFin

A 股个人研究终端 —— 整合实时行情（HQChart）与财报研究（CFA 双语三大表），币安风格深色 UI。

```
┌───────────────────────────────────────────────────┐
│  VFin · Top bar (search + nav)                    │
├──────────┬───────────────────────────┬────────────┤
│ Watchlist│   HQChart K 线主图         │ 资金/新闻  │
│          │   + 副图 VOL / MACD        │ 公告       │
└──────────┴───────────────────────────┴────────────┘
```

## 项目结构

```
.
├── web/        Next.js 15 前端
├── gateway/    Express 行情网关
├── services/   Python 麦语言指标编译器
├── scripts/    项目级启动脚本
└── docs/
    ├── superpowers/specs/
    └── legacy/  历史项目文档存档
```

## 启动

### 环境

- Node.js ≥ 20

### 首次

```bash
npm run install:all
```

### 开发 / 生产

```bash
npm run dev    # 开发模式（热重载）
npm run build  # 生产构建
npm run start  # 生产模式

# 浏览器: http://localhost:3816
# 网关 (内部代理):  http://localhost:18080
```

默认账号：`demo@vfin.local` / `demo123456`

## 路由

| 路径 | 说明 |
|------|------|
| `/` | 首页 · 自选股表格（每 5 秒刷新） |
| `/trade/[ticker]` | 行情交易页 · HQChart K 线 + 盘口数据 |
| `/research/[ticker]` | 财报研究页 · 三大表 + 4 视图 + sparkline |
| `/hq-classic` | 经典版（保留原 HQChart 完整功能） |
| `/search?q=...` | 搜索结果 |
| `/login` `/register` | 鉴权 |

## 数据流

```
浏览器
  └─► Next.js :3816
        ├─► /api/hq/*   ─[rewrites]─►  Express :18080  (行情)
        ├─► /api/auth/*                Next.js API     (鉴权)
        ├─► /api/fetch-company         Next.js API     (静态财报抓取)
        └─► /hqchart/*.js              Next.js 静态资源
```

## 设计语言

- 仅深色主题（币安风格）
- 配色：`#0B0E11` → `#181A20` → `#1E2329` + 金 `#F0B90B`
- 涨跌色：**绿涨 `#0ECB81` / 红跌 `#F6465D`**（币安原版）
- 字体：Inter / IBM Plex Mono / PingFang SC，全数字 `tabular-nums`

## 开发

- 设计文档：`docs/superpowers/specs/2026-05-14-vfin-design.md`
- HQChart 数据适配器：`web/public/hqchart/datasource.js`
- HQChart React 包装：`web/src/components/hqchart/KLineChart.tsx`

## 已知限制

- HQChart jscommon 包体积较大（~12MB），首次进入 `/trade` 有可观加载耗时
- 自选股暂不按用户隔离（Phase 2）
- 公司财报数据仅覆盖样本 A 股（中国广核 / 长江电力 / 国电南瑞 / TSLA / 01811）
