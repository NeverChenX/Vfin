# Vfin — Stock Chart & Watchlist (PC)

A lightweight PC stock charting application with real-time K-line charts, technical indicators, and personal watchlist management.

> This project is based on [HQChart](https://github.com/jones2000/HQChart) — an open-source stock charting library.

---

## Features

- **Real-time K-line charts** — Daily, Weekly, Monthly, Yearly, and intraday (1m / 5m / 15m / 30m) periods
- **Technical indicators** — MA, VOL, MACD and more, with indicator name labels shown in sub-windows
- **Watchlist management** — Add / remove stocks, persistent SQLite storage, auto-refresh quotes
- **Smart search** — Search A-shares, indices, funds and **US stocks** by code or name (Chinese / English)
- **Multi-market support** — Shanghai (SH), Shenzhen (SZ), Beijing (BJ), Hong Kong (HK), US stocks
- **Multiple data sources** — Tencent Finance, Sina Finance, Eastmoney with automatic failover
- **Drawing tools** — Trendlines, channels, support/resistance levels
- **Theme switching** — Light and dark themes, red-up / green-up modes

---

## Quick Start

### Requirements
- Node.js >= 20

### Run

```bash
cd backend/gateway
npm install
npm run dev          # starts on http://localhost:18080
```

Open in browser:
```
http://localhost:18080/frontend/demo/
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `18080` | Server port |
| `HQ_PROVIDER_ORDER` | `tencent,sina,eastmoney` | Data source priority |
| `HQ_PROVIDER_MODE` | `live` | `live` or `mock` |

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/health/live` | Health check |
| `GET /api/stock` | Real-time quote |
| `GET /api/kline` | K-line history |
| `GET /api/minute` | Minute chart data |
| `GET /api/capital` | Capital flow |
| `GET /api/search` | Symbol search (A-share + US stocks) |
| `GET/POST/DELETE /api/watchlist` | Watchlist CRUD |

---

## Project Structure

```
Vfin/
├── backend/gateway/          # Node.js API gateway (Express)
│   ├── src/
│   │   ├── providers/        # Data adapters (Sina, Tencent, Eastmoney)
│   │   ├── services/         # Cache, circuit breaker, normalization
│   │   └── routes/           # REST API routes
│   └── tests/                # 43 unit tests
│
└── frontend/demo/index.html  # PC web client (single HTML)
```

---

---

# Vfin — 股票行情图表（PC 版）

基于 Web 的 PC 端股票行情应用，支持实时 K 线图、技术指标和自选股管理。

> 本项目来自于 [HQChart](https://github.com/jones2000/HQChart)，感谢原作者的开源贡献。

---

## 功能特性

- **实时 K 线图** — 日、周、月、年线及分钟线（1/5/15/30 分钟）
- **技术指标** — MA、VOL、MACD 等，子窗口显示指标名称
- **自选股管理** — 增删股票，SQLite 持久化，实时行情刷新
- **智能搜索** — 支持 A 股、指数、基金和**美股**按代码或中英文名称搜索
- **多市场支持** — 沪、深、北、港、美股
- **多数据源** — 腾讯财经、新浪财经、东方财富，自动故障转移
- **画线工具** — 趋势线、通道线、支撑压力位
- **主题切换** — 白色/黑色主题，红涨绿跌/绿涨红跌模式

---

## 快速开始

```bash
cd backend/gateway
npm install
npm run dev          # 启动于 http://localhost:18080
```

浏览器访问：
```
http://localhost:18080/frontend/demo/
```

---

## License

Apache 2.0 — See [LICENSE](./LICENSE)
