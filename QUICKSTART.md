# 快速开始

## 📋 要求

- Node.js >= 20
- npm 或 yarn

## 🚀 3 步启动

### 1. 安装依赖
```bash
cd backend/gateway
npm install
```

### 2. 启动后端
```bash
npm run dev
```
- 默认监听：http://localhost:18080
- 自定义端口：`PORT=3000 npm run dev`

### 3. 打开前端
访问浏览器：
```
http://localhost:18080/frontend/demo/
```

✅ 完成！股票行情界面应该已经加载。

---

## 📝 常见操作

### 切换数据源
```bash
# 使用新浪 API（仅行情）
HQ_PROVIDER_ORDER=sina npm run dev

# 使用 Mock 数据测试
HQ_PROVIDER_MODE=mock npm run dev
```

### 自定义 API 地址
在 URL 中添加 `apiBase` 参数：
```
http://localhost:18080/frontend/demo/?apiBase=http://api.example.com:8080/api
```

### 运行测试
```bash
npm test
```
期望输出：✅ 43 tests passed

---

## 🏗️ 项目结构

```
HQChart/
├── backend/gateway/          # Node.js API 网关
│   ├── src/
│   │   ├── server.js         # Express 应用
│   │   ├── providers/        # 数据源适配器（新浪、腾讯、东方财富）
│   │   ├── services/         # 缓存、熔断、数据规范化
│   │   └── routes/           # API 路由
│   └── tests/                # 自动化测试
│
├── frontend/demo/index.html  # PC 版主界面
└── frontend/hqchart/
    ├── jscommon/             # K 线图表核心库
    ├── samples/              # 示例页面
    └── PaySamples/           # 付费功能示例
```

---

## 🔗 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health/live` | GET | 健康检查 |
| `/api/stock` | GET | 获取股票行情 |
| `/api/minute` | GET | 获取分时数据 |
| `/api/kline` | GET | 获取 K 线数据 |
| `/api/capital` | GET | 获取资金流向 |
| `/api/callauction` | GET | 获取集合竞价 |
| `/api/news` | GET | 获取新闻 |
| `/api/announcements` | GET | 获取公告 |
| `/api/trade-detail` | GET | 获取成交明细 |
| `/api/watchlist` | GET/POST/DELETE | 自选股管理 |

### 示例请求

```bash
# 获取中国平安的日线数据
curl "http://localhost:18080/api/kline?symbol=000001&period=day&count=10"

# 获取分时数据
curl "http://localhost:18080/api/minute?symbol=600000"

# 添加自选股
curl -X POST http://localhost:18080/api/watchlist \
  -H "Content-Type: application/json" \
  -d '{"symbol":"600000.sh","name":"浦发银行"}'
```

---

## 🎯 主要功能

✅ **K 线图表**
- 支持日、周、月、年线
- 支持 1/5/15/30 分钟线
- 实时数据更新

✅ **技术指标**
- 内置 50+ 指标（MA、MACD、KDJ 等）
- 支持麦语言编写自定义指标
- 前端/后端计算引擎

✅ **自选股管理**
- 本地 SQLite 数据库存储
- 跨会话持久化

✅ **数据源**
- 新浪财经（实时行情）
- 腾讯财经（全功能）
- 东方财富（资讯数据）
- 自动故障转移

---

## 🔧 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 18080 | 服务监听端口 |
| `HQ_PROVIDER_ORDER` | `tencent,sina,eastmoney` | 数据源优先级 |
| `HQ_PROVIDER_MODE` | `live` | 运行模式（live/mock） |

---

## 📖 更多信息

- 详细部署指南：[DEPLOYMENT.md](./DEPLOYMENT.md)
- 原项目地址：https://github.com/jones2000/HQChart
- 用户协议：[用户协议.txt](./用户协议.txt)

---

## 🆘 故障排查

### "Address already in use"
```bash
# 查看占用 18080 的进程
lsof -i :18080

# 杀死进程
kill -9 <PID>
```

### 前端加载缓慢
- 检查网络连接
- 清除浏览器缓存
- 尝试 Mock 模式：`HQ_PROVIDER_MODE=mock`

### 数据不显示
- 检查数据源是否可达
- 查看浏览器控制台错误
- 尝试更换数据源：`HQ_PROVIDER_ORDER=sina`

---

**更新日期：** 2026-04-06
**版本：** PC Only (Refactored)
