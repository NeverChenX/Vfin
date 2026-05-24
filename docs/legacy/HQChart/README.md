# Vfin — 股票行情图表（PC 版）

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D%2020-brightgreen)](https://nodejs.org/)

基于 Web 的 PC 端股票行情应用，支持实时 K 线图、技术指标和自选股管理。

> 本项目基于 [HQChart](https://github.com/jones2000/HQChart) 开源图表库，感谢原作者的贡献。

---

## 功能特性

- **实时 K 线图** — 日、周、月、年及分钟线（1/5/15/30 分钟）
- **技术指标** — MA、MACD、KDJ、RSI、BOLL 等 50+ 指标，支持麦语言自定义
- **自选股管理** — 增删股票，SQLite 持久化，实时行情自动刷新
- **智能搜索** — 支持 A 股、指数、基金和**美股**，按代码或中英文名称搜索
- **多市场支持** — 沪（SH）、深（SZ）、北（BJ）、港（HK）、美股
- **多数据源** — 腾讯财经、新浪财经、东方财富，自动故障转移
- **画线工具** — 趋势线、通道线、支撑压力位
- **主题切换** — 白色/黑色主题，红涨绿跌 / 绿涨红跌模式

---

## 快速开始

**环境要求：** Node.js >= 20

```bash
cd backend/gateway
npm install
npm run dev          # 启动于 http://localhost:18080
```

浏览器访问：

```
http://localhost:18080/frontend/app/
```

### 自定义 API 地址

```
http://localhost:18080/frontend/app/?apiBase=http://your-server:8080/api
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `18080` | 服务端口 |
| `HQ_PROVIDER_ORDER` | `tencent,sina,eastmoney` | 数据源优先级 |
| `HQ_PROVIDER_MODE` | `live` | `live` 或 `mock` |

---

## 项目结构

```
Vfin/
├── backend/gateway/          # Node.js API 网关（Express）
│   ├── src/
│   │   ├── providers/        # 数据适配器（新浪、腾讯、东方财富）
│   │   ├── services/         # 缓存、熔断器、数据标准化
│   │   └── routes/           # REST API 路由
│   └── tests/                # 单元测试
│
└── frontend/app/index.html   # PC 前端（单文件 HTML）
```

---

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/health/live` | GET | 健康检查 |
| `/api/stock` | GET | 实时行情 |
| `/api/kline` | GET | K 线历史数据 |
| `/api/minute` | GET | 分时图数据 |
| `/api/capital` | GET | 资金流向 |
| `/api/callauction` | GET | 集合竞价数据 |
| `/api/news` | GET | 股票新闻 |
| `/api/announcements` | GET | 公司公告 |
| `/api/search` | GET | 股票搜索 |
| `/api/watchlist` | GET/POST/DELETE | 自选股管理 |

---

## 测试

```bash
cd backend/gateway
npm test
```

---

## 许可证

Apache 2.0 — 详见 [LICENSE](./LICENSE)

---

---

# Vfin — Stock Chart & Watchlist (PC)

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D%2020-brightgreen)](https://nodejs.org/)

A lightweight PC stock charting application with real-time K-line charts, technical indicators, and personal watchlist management.

> This project is based on [HQChart](https://github.com/jones2000/HQChart) — an open-source stock charting library. Thanks to the original author for the excellent foundation.

---

## Features

- **Real-time K-line charts** — Daily, Weekly, Monthly, Yearly, and intraday (1m / 5m / 15m / 30m)
- **Technical indicators** — 50+ built-in indicators (MA, MACD, KDJ, RSI, BOLL, etc.), custom indicators via Mai Language
- **Watchlist management** — Add/remove stocks, persistent SQLite storage, auto-refresh quotes
- **Smart search** — Search A-shares, indices, funds, and **US stocks** by code or name (Chinese/English)
- **Multi-market support** — Shanghai (SH), Shenzhen (SZ), Beijing (BJ), Hong Kong (HK), US stocks
- **Multiple data sources** — Tencent Finance, Sina Finance, Eastmoney with automatic failover
- **Drawing tools** — Trendlines, channels, support/resistance levels
- **Theme switching** — Light and dark themes, red-up / green-up color modes

---

## Quick Start

**Requirements:** Node.js >= 20

```bash
cd backend/gateway
npm install
npm run dev          # starts on http://localhost:18080
```

Open in browser:

```
http://localhost:18080/frontend/app/
```

### Custom API Base URL

```
http://localhost:18080/frontend/app/?apiBase=http://your-server:8080/api
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `18080` | Server port |
| `HQ_PROVIDER_ORDER` | `tencent,sina,eastmoney` | Data source priority |
| `HQ_PROVIDER_MODE` | `live` | `live` or `mock` |

---

## Project Structure

```
Vfin/
├── backend/gateway/          # Node.js API Gateway (Express)
│   ├── src/
│   │   ├── providers/        # Data adapters (Sina, Tencent, Eastmoney)
│   │   ├── services/         # Cache, circuit breaker, normalization
│   │   └── routes/           # REST API routes
│   └── tests/                # Unit tests
│
└── frontend/app/index.html   # PC web client (single HTML file)
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health/live` | GET | Health check |
| `/api/stock` | GET | Real-time quote |
| `/api/kline` | GET | K-line history |
| `/api/minute` | GET | Minute chart data |
| `/api/capital` | GET | Capital flow |
| `/api/callauction` | GET | Call auction data |
| `/api/news` | GET | Stock news |
| `/api/announcements` | GET | Company announcements |
| `/api/search` | GET | Symbol search |
| `/api/watchlist` | GET/POST/DELETE | Watchlist CRUD |

---

## Testing

```bash
cd backend/gateway
npm test
```

---

## License

Apache 2.0 — See [LICENSE](./LICENSE)

---

## Acknowledgments

- Original charting library: [HQChart](https://github.com/jones2000/HQChart) by jones2000
- Data sources: Tencent Finance, Sina Finance, Eastmoney
