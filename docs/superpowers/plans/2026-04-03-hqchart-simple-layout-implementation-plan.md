# HQChart Simple Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the repo into frontend/backend/services with minimal naming, move the full demo page to `/hqchart`, and ensure gateway uses live public data with multi-source switching.

**Architecture:** Move existing demo and gateway into new top-level folders. Keep the original web demo structure under `frontend/hqchart/` so relative assets continue to work. Add a lightweight `index.html` redirect so `/hqchart` is the entry. Update gateway API base to `/api`. Default provider mode becomes live, with configurable provider order and URL override for provider/providerMode.

**Tech Stack:** Node.js 20, Express, existing HQChart frontend, Python tools (unchanged).

---

## File Structure (new/changed)

- Move: `webhqchart.demo/` -> `frontend/hqchart/`
- Create: `frontend/hqchart/index.html` (simple redirect to `/hqchart/samples/hqchart_demo.html`)
- Move: `hqchart-gateway/` -> `backend/gateway/`
- Move: `umychart_python/` -> `services/python/`
- Move: remaining existing top-level projects -> `services/legacy/<project>`
- Modify: `backend/gateway/src/server.js` (API base `/api` and provider config)
- Modify: `backend/gateway/src/config.js` (provider order + default mode)
- Modify: `backend/gateway/src/services/hqchart-data-service.js` (default provider mode)
- Modify: `frontend/hqchart/samples/hqchart_demo.html` (API base to `/api`, remove local testdata fallback)
- Modify: any README/docs that reference old paths or `/api`

---

### Task 1: Create top-level folders and relocate projects

**Files:**
- Create: `frontend/`, `backend/`, `services/`, `services/legacy/`
- Move: `webhqchart.demo/` -> `frontend/hqchart/`
- Move: `hqchart-gateway/` -> `backend/gateway/`
- Move: `umychart_python/` -> `services/python/`
- Move: remaining top-level projects -> `services/legacy/<name>`

- [ ] **Step 1: Create folders**

Run:
```bash
mkdir frontend backend services services/legacy
```
Expected: folders exist.

- [ ] **Step 2: Move demo**

Run:
```bash
git mv webhqchart.demo frontend/hqchart
```
Expected: demo folder is now `frontend/hqchart`.

- [ ] **Step 3: Move gateway**

Run:
```bash
git mv hqchart-gateway backend/gateway
```
Expected: gateway files now under `backend/gateway`.

- [ ] **Step 4: Move python**

Run:
```bash
git mv umychart_python services/python
```
Expected: python tool under `services/python`.

- [ ] **Step 5: Move remaining projects to legacy**

Run:
```bash
git mv webhqchart services/legacy/webhqchart
 git mv wechathqchart services/legacy/wechathqchart
 git mv vue.demo services/legacy/vue.demo
 git mv vuehqchart services/legacy/vuehqchart
 git mv umychart_indexapi services/legacy/umychart_indexapi
 git mv umychart_uniapp_h5 services/legacy/umychart_uniapp_h5
 git mv node.jccomplier services/legacy/node.jccomplier
 git mv "C++指标计算引擎" "services/legacy/C++指标计算引擎"
 git mv "小程序行情模块用例" "services/legacy/小程序行情模块用例"
 git mv 教程 services/legacy/教程
 git mv 文档 services/legacy/文档
```
Expected: legacy folder contains all moved projects.

- [ ] **Step 6: Commit**

```bash
git add frontend backend services
 git commit -m "chore: restructure repo into frontend backend services"
```

---

### Task 2: Create simplified demo entry

**Files:**
- Create: `frontend/hqchart/index.html`
- Keep: `frontend/hqchart/samples/hqchart_demo.html`

- [ ] **Step 1: Add redirect entry page**

Create `frontend/hqchart/index.html` with:
```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=./samples/hqchart_demo.html" />
    <title>HQChart Demo</title>
  </head>
  <body>
    <p>Redirecting to demo...</p>
  </body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/hqchart/index.html
 git commit -m "feat(frontend): add /hqchart entry page"
```

---

### Task 3: Frontend demo uses live API only

**Files:**
- Modify: `frontend/hqchart/samples/hqchart_demo.html`

- [ ] **Step 1: Update API base to /api**

Replace:
```js
const DEFAULT_API_BASE='http://127.0.0.1:18080/api';
```
With:
```js
const DEFAULT_API_BASE='http://127.0.0.1:18080/api';
```

- [ ] **Step 2: Remove local testdata script includes**

Delete the entire block of `<script src="../jscommon/umychart.testdata...">` lines and the final `<script src="../jscommon/umychart.testdata.js"></script>`.

- [ ] **Step 3: Remove local fallback logic**

Remove the local fallback data source usage:
1) Delete:
```js
const LocalDemoHQData=window.HQData;
```
2) Change:
```js
function createDemoBackendDataSource(localHQData)
```
To:
```js
function createDemoBackendDataSource()
```
3) Delete fallback blocks inside `createDemoBackendDataSource`:
```js
if (requestOption.allowFallback!==false && localHQData && typeof(localHQData.NetworkFilter)=='function')
{
  setWatchlistStatus(`${data.Explain || data.Name} 使用空回退数据`, true);
  localHQData.NetworkFilter(data, callback);
  return;
}
```
And in the default case:
```js
if (localHQData && typeof(localHQData.NetworkFilter)=='function')
  return localHQData.NetworkFilter(data, callback);
```
4) Change:
```js
var DemoHQChartDataSource=createDemoBackendDataSource(LocalDemoHQData);
```
To:
```js
var DemoHQChartDataSource=createDemoBackendDataSource();
```

- [ ] **Step 4: Commit**

```bash
git add frontend/hqchart/samples/hqchart_demo.html
 git commit -m "feat(frontend): use live API only in demo"
```

---

### Task 4: Gateway API base to /api and live mode defaults

**Files:**
- Modify: `backend/gateway/src/config.js`
- Modify: `backend/gateway/src/services/hqchart-data-service.js`
- Modify: `backend/gateway/src/server.js`

- [ ] **Step 1: Extend config for provider order + mode**

Update `backend/gateway/src/config.js` to:
```js
export function loadConfig(env = process.env) {
  const rawPort = env.PORT;
  const providerOrderRaw = env.HQ_PROVIDER_ORDER || 'sina,tencent';
  const providerOrder = providerOrderRaw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const providerMode = env.HQ_PROVIDER_MODE || 'live';

  let port = 18080;
  if (rawPort && /^\d+$/.test(rawPort)) {
    const numeric = Number(rawPort);
    if (numeric >= 1 && numeric <= 65535) port = numeric;
    else console.warn(`Invalid PORT "${rawPort}", falling back to 18080`);
  } else if (rawPort) {
    console.warn(`Invalid PORT "${rawPort}", falling back to 18080`);
  }

  return {
    port,
    providerOrder: providerOrder.length ? providerOrder : ['sina', 'tencent'],
    providerMode
  };
}
```

- [ ] **Step 2: Allow default provider mode in data service**

Update `backend/gateway/src/services/hqchart-data-service.js` to:
```js
import { createHqchartNormalizer } from '../normalizers/hqchart-normalizer.js';
import { createProviderRegistry } from '../providers/provider-registry.js';
import { createCacheService } from './cache-service.js';
import { createResilienceService } from './resilience-service.js';
import { normalizeSymbol } from './symbol-normalizer.js';

const NORMALIZER_METHODS = {
  quote: 'normalizeQuote',
  minute: 'normalizeMinute',
  kline: 'normalizeKline',
  capital: 'normalizeCapital',
  callauction: 'normalizeCallauction',
  trade: 'normalizeTradeDetail',
  news: 'normalizeNews',
  announcements: 'normalizeAnnouncements'
};

function sortObjectEntries(value) {
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      const entry = value[key];
      result[key] = entry && typeof entry === 'object' && !Array.isArray(entry)
        ? sortObjectEntries(entry)
        : entry;
      return result;
    }, {});
}

function createCacheKey(operation, context) {
  return JSON.stringify({
    operation,
    context: sortObjectEntries(context)
  });
}

function createExecutionContext(params, defaultProviderMode) {
  const { symbol, market } = normalizeSymbol(params.symbol);

  return {
    symbol,
    market,
    providerMode: params.providerMode ?? defaultProviderMode,
    provider: params.provider,
    period: params.period,
    day: params.day,
    count: params.count
  };
}

export function createHqchartDataService({
  providerRegistry = createProviderRegistry(),
  cacheService = createCacheService(),
  resilienceService = createResilienceService(),
  normalizer = createHqchartNormalizer(),
  cacheTtlMs = 1_000,
  providerMode = 'live'
} = {}) {
  async function execute(operation, params = {}) {
    const context = createExecutionContext(params, providerMode);
    const cacheKey = createCacheKey(operation, context);

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const result = await resilienceService.execute(
          () => providerRegistry.execute(operation, context),
          { key: `${operation}:${context.symbol}` }
        );

        const methodName = NORMALIZER_METHODS[operation];
        return normalizer[methodName](result.data, {
          ...context,
          provider: result.provider
        });
      },
      { ttlMs: cacheTtlMs }
    );
  }

  return {
    getQuote: (params) => execute('quote', params),
    getMinute: (params) => execute('minute', params),
    getKline: (params) => execute('kline', params),
    getCapital: (params) => execute('capital', params),
    getCallauction: (params) => execute('callauction', params),
    getTradeDetail: (params) => execute('trade', params),
    getNews: (params) => execute('news', params),
    getAnnouncements: (params) => execute('announcements', params)
  };
}
```

- [ ] **Step 3: Update server routes + inject provider config**

Update `backend/gateway/src/server.js` to:
```js
import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadConfig } from './config.js';
import { errorHandler } from './middleware/error-handler.js';
import { traceIdMiddleware } from './middleware/trace-id.js';
import { createMarketRouter } from './routes/market-routes.js';
import { createWatchlistRouter } from './routes/watchlist-routes.js';
import { createHqchartDataService } from './services/hqchart-data-service.js';
import { createWatchlistService } from './services/watchlist-service.js';
import { createProviderRegistry } from './providers/provider-registry.js';

function corsMiddleware(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    req.header('Access-Control-Request-Headers') || 'Content-Type, X-Request-Id, X-Trace-Id'
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
}

export function createApp({ watchlistService, hqchartDataService, providerOrder, providerMode } = {}) {
  const app = express();
  let defaultWatchlistService;
  let defaultHqchartDataService;
  const service = watchlistService ?? (() => {
    if (!defaultWatchlistService) {
      defaultWatchlistService = createWatchlistService();
    }

    return defaultWatchlistService;
  });
  const marketDataService = hqchartDataService ?? (() => {
    if (!defaultHqchartDataService) {
      const order = providerOrder && providerOrder.length ? providerOrder : ['sina', 'tencent'];
      const registry = createProviderRegistry({ primary: order[0], fallback: order.slice(1) });
      defaultHqchartDataService = createHqchartDataService({ providerRegistry: registry, providerMode });
    }

    return defaultHqchartDataService;
  });

  app.use(corsMiddleware);
  app.use(traceIdMiddleware);
  app.use(express.json());

  app.get('/api/health/live', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use('/api', createMarketRouter({ hqchartDataService: marketDataService }));
  app.use('/api/watchlist', createWatchlistRouter({ watchlistService: service }));
  app.use(errorHandler);

  return app;
}

export function startServer(config = loadConfig()) {
  const app = createApp({
    providerOrder: config.providerOrder,
    providerMode: config.providerMode
  });
  return app.listen(config.port, () => {
    console.log(`hqchart-gateway listening on port ${config.port}`);
  });
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  startServer();
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/gateway/src/config.js backend/gateway/src/services/hqchart-data-service.js backend/gateway/src/server.js
 git commit -m "feat(gateway): default live mode and /api base"
```

---

### Task 5: Update docs and progress tracking

**Files:**
- Modify: `HQCHART_SIMPLE_LAYOUT_DESIGN.md`

- [ ] **Step 1: Update Progress checklist**

Check off completed items after Tasks 1-4 are done.

- [ ] **Step 2: Commit**

```bash
git add HQCHART_SIMPLE_LAYOUT_DESIGN.md
 git commit -m "docs: update simple layout progress"
```

---

### Task 6: Regression and verification

- [ ] **Step 1: Backend tests**

Run:
```bash
cd backend/gateway
npm test
```
Expected: PASS.

- [ ] **Step 2: API smoke**

Run:
```bash
node src/server.js
```
Then in another terminal:
```bash
curl "http://127.0.0.1:18080/api/watchlist"
curl "http://127.0.0.1:18080/api/stock?symbol=600000.sh"
curl "http://127.0.0.1:18080/api/kline?symbol=00700.hk&period=day&count=200"
```
Expected: HTTP 200 with live payloads.

- [ ] **Step 3: Frontend smoke**

Run:
```bash
cd frontend
python -m http.server 8080
```
Visit:
```
http://127.0.0.1:8080/hqchart
```
Expected: page loads, data requests hit `/api` endpoints.

- [ ] **Step 4: Commit test report**

Create `HQCHART_SIMPLE_LAYOUT_TEST_REPORT.md` with the following template and fill with results:
```markdown
# HQChart Simple Layout Test Report

Date: 2026-04-03

## Backend Tests

Command:
```
cd backend/gateway
npm test
```
Result: PASS/FAIL

## API Smoke

- /api/watchlist: PASS/FAIL
- /api/stock?symbol=600000.sh: PASS/FAIL
- /api/kline?symbol=00700.hk&period=day&count=200: PASS/FAIL

## Frontend Smoke

URL: http://127.0.0.1:8080/hqchart
Result: PASS/FAIL

## Notes

- Any errors or warnings observed.
```

Commit:
```bash
git add HQCHART_SIMPLE_LAYOUT_TEST_REPORT.md
 git commit -m "test: verify simplified hqchart layout"
```
