# VFin PC版 - 部署和配置指南

## 快速开始

### 1. 启动后端服务

```bash
cd backend/gateway

# 安装依赖（首次）
npm install

# 启动服务（默认端口 18080）
npm run dev

# 或指定端口
PORT=3000 npm run dev
```

**环境变量配置：**
- `PORT` - 服务监听端口（默认：18080）
- `HQ_PROVIDER_ORDER` - 数据源优先级（默认：tencent,sina,eastmoney）
- `HQ_PROVIDER_MODE` - 运行模式（默认：live；可选：mock）

### 2. 访问前端

**本地访问：**
```
http://localhost:18080/frontend/app/
```

**自定义 API 地址（可选）：**
```
http://localhost:18080/frontend/app/?apiBase=http://other-host:3000/api
```

## 路径配置说明

### 前端资源路径
所有前端资源使用绝对路径：
```html
<script src="/frontend/hqchart/jscommon/umychart.js"></script>
<link href="/frontend/hqchart/jscommon/umychart.resource/css/tools.css" rel="stylesheet">
```

### API 路径
前端使用相对路径自动连接到同源 API：
```javascript
// 自动使用 http://当前主机:当前端口/api
const API_BASE = '/api';
```

**可用 API 端点：**
- `GET /api/health/live` - 健康检查
- `GET /api/stock` - 获取股票行情
- `GET /api/minute` - 获取分时数据
- `GET /api/kline` - 获取 K 线数据
- `GET /api/capital` - 获取资金流向
- `GET /api/news` - 获取新闻
- `GET /api/watchlist` - 自选股管理

## 生产环境部署

### Docker 部署（推荐）

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

### Nginx 反向代理

```nginx
server {
    listen 80;
    server_name vfin.example.com;

    # 前端静态文件
    location /frontend/ {
        alias /var/www/vfin/frontend/;
        expires 1h;
    }

    # API 路由
    location /api/ {
        proxy_pass http://localhost:18080/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # 前端入口
    location / {
        rewrite ^/(.*)$ /frontend/app/ permanent;
    }
}
```

## 跨域配置

后端已配置 CORS，支持所有来源的请求：
```javascript
res.header('Access-Control-Allow-Origin', '*');
res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
```

若需要限制来源，编辑 `backend/gateway/src/server.js` 中的 `corsMiddleware`。

## 数据源配置

### 支持的数据源
1. **新浪财经** (sina) - 实时行情（仅 quote）
2. **腾讯财经** (tencent) - 全功能
3. **东方财富** (eastmoney) - 资讯类数据

### 切换数据源优先级
```bash
HQ_PROVIDER_ORDER=sina,tencent npm run dev
```

### Mock 模式测试
```bash
HQ_PROVIDER_MODE=mock npm run dev
```

## 运行测试

```bash
npm test                 # 运行全部测试
npm test -- --ui        # UI 模式查看测试
```

**测试覆盖：**
- 后端 API 路由
- 数据源适配器
- 自选股数据库操作
- 数据规范化

## 故障排查

### 后端无法启动
- 检查端口是否被占用：`lsof -i :18080`
- 检查 Node.js 版本 >= 20：`node --version`

### 前端无法加载资源
- 确保后端在 `http://localhost:18080` 运行
- 检查浏览器控制台错误
- 清除浏览器缓存

### API 请求失败
- 检查网络连接和防火墙
- 查看后端日志
- 尝试 mock 模式：`HQ_PROVIDER_MODE=mock`

## 性能优化

### 缓存配置
后端内置 TTL 缓存（默认 60 秒）：
```javascript
// src/services/cache-service.js
const DEFAULT_TTL = 60 * 1000; // 60 秒
```

### 熔断器配置
网络故障自动降级处理：
```javascript
// src/services/resilience-service.js
const FAILURE_THRESHOLD = 3;  // 失败 3 次后打开熔断
const RETRY_ATTEMPTS = 3;      // 每次重试 3 次
```

## 安全建议

1. **限制数据源 API 访问**
   - 在网关前使用 WAF
   - 配置 IP 白名单

2. **HTTPS 部署**
   - 在生产环境启用 SSL/TLS
   - 使用 Let's Encrypt 获取免费证书

3. **认证和授权**
   - 根据需要添加 API 密钥验证
   - 实现自选股列表的用户隔离

4. **API 限流**
   ```javascript
   // 可考虑添加 npm install express-rate-limit
   import rateLimit from 'express-rate-limit';

   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 分钟
     max: 100                    // 限制 100 个请求
   });

   app.use('/api/', limiter);
   ```

## 项目结构

```
backend/gateway/
  ├── src/
  │   ├── server.js              # Express 应用入口
  │   ├── config.js              # 配置加载
  │   ├── providers/             # 数据源适配器
  │   ├── services/              # 业务逻辑服务
  │   ├── normalizers/           # 数据转换
  │   ├── routes/                # API 路由
  │   └── middleware/            # 中间件
  ├── tests/                     # 测试用例
  ├── package.json
  └── data/
      └── vfin-gateway.sqlite    # 自选股数据库

frontend/app/
  └── index.html                 # PC 版主页面（2678 行）

frontend/hqchart/
  ├── jscommon/                  # K 线图表核心库
  ├── samples/                   # 示例页面集合
  └── PaySamples/                # 付费功能示例
```

---

**最后更新：** 2026-04-06
**版本：** PC Only Refactored
