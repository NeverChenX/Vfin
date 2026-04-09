# Vfin — Stock Chart & Watchlist (PC)

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D%2020-brightgreen)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-PC%20Web-lightgrey)]()

A lightweight PC stock charting application with real-time K-line charts, technical indicators, and personal watchlist management.

> This project is based on [HQChart](https://github.com/jones2000/HQChart) — an open-source stock charting library. Thanks to the original author for the excellent foundation.

---

## ✨ Features

### 📈 K-Line Charts
- Multiple timeframes: Daily, Weekly, Monthly, Yearly
- Intraday charts: 1m / 5m / 15m / 30m
- Real-time data updates
- Drawing tools: trendlines, channels, support/resistance

### 📊 Technical Indicators
- 50+ built-in indicators: MA, MACD, KDJ, RSI, BOLL, etc.
- Custom indicators via麦语言 (Mai Language)
- Frontend and backend calculation engines

### 🔍 Smart Search
- Search by stock code or name (Chinese/English)
- Supports A-shares, indices, funds, and **US stocks**
- Multi-market: Shanghai (SH), Shenzhen (SZ), Beijing (BJ), Hong Kong (HK), US

### ⭐ Watchlist
- Add/remove stocks with one click
- Persistent SQLite storage
- Auto-refresh quotes

### 🎨 Themes
- Light and dark themes
- Red-up / Green-up color modes

### 🔄 Multiple Data Sources
- Tencent Finance (full features)
- Sina Finance (real-time quotes)
- Eastmoney (news & announcements)
- Automatic failover between sources

---

## 🚀 Quick Start

### Requirements
- Node.js >= 20
- npm or yarn

### Installation

```bash
cd backend/gateway
npm install
```

### Run

```bash
npm run dev
```

Default server: http://localhost:18080

### Open in Browser

```
http://localhost:18080/frontend/app/
```

✅ Done! The stock chart interface should load.

---

## 📁 Project Structure

```
Vfin/
├── backend/gateway/          # Node.js API Gateway (Express)
│   ├── src/
│   │   ├── providers/        # Data adapters (Sina, Tencent, Eastmoney)
│   │   ├── services/         # Cache, circuit breaker, normalization
│   │   └── routes/           # REST API routes
│   └── tests/                # 43 unit tests
│
└── frontend/app/index.html  # PC web client (single HTML, 2678 lines)
```

---

## 🔗 API Endpoints

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
| `/api/search` | GET | Symbol search (A-share + US stocks) |
| `/api/watchlist` | GET/POST/DELETE | Watchlist CRUD |

### Example Requests

```bash
# Get daily K-line for Ping An (000001)
curl "http://localhost:18080/api/kline?symbol=000001&period=day&count=10"

# Get minute data for SPD Bank (600000)
curl "http://localhost:18080/api/minute?symbol=600000"

# Add to watchlist
curl -X POST http://localhost:18080/api/watchlist \
  -H "Content-Type: application/json" \
  -d '{"symbol":"600000.sh","name":"SPD Bank"}'
```

---

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `18080` | Server port |
| `HQ_PROVIDER_ORDER` | `tencent,sina,eastmoney` | Data source priority |
| `HQ_PROVIDER_MODE` | `live` | `live` or `mock` |

### Custom API Base URL

```
http://localhost:18080/frontend/app/?apiBase=http://api.example.com:8080/api
```

---

## 🧪 Testing

```bash
npm test
```

Expected output: ✅ 43 tests passed

---

## 🐳 Docker Deployment

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY backend/gateway /app

RUN npm ci --production

ENV PORT=3000
ENV HQ_PROVIDER_MODE=live

EXPOSE 3000
CMD ["node", "src/server.js"]
```

---

## 📄 License

Apache 2.0 — See [LICENSE](./LICENSE)

---

## 🙏 Acknowledgments

- Original charting library: [HQChart](https://github.com/jones2000/HQChart) by jones2000
- Data sources: Tencent Finance, Sina Finance, Eastmoney

---

## 📚 Documentation

- [Quick Start Guide (Chinese)](./QUICKSTART.md)
- [Deployment Guide (Chinese)](./DEPLOYMENT.md)

---

**Last Updated:** 2026-04-06  
**Version:** PC Only (Refactored)
