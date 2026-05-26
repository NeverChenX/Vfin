# 首页"市场"模块 · Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 把 Phase 1 留下的所有"暂不可用"占位都换成真实数据 —— gateway 新增 2 个 endpoint（breadth / hk-connect），扩展 symbol-normalizer + sina/eastmoney provider 支持 .fx/.cm/.jp/.de/.uk 后缀，前端 swap 占位组件。

**Architecture:** 后端为主（gateway），前端仅小幅调整。所有新数据源用现有的 `http-client.fetchText/fetchJson` 拉，沿用 `iconv-lite` 解码 Sina GBK，沿用 cache-service 缓存。新 endpoints 用 30-60s gateway 缓存挡外部 API。前端 `MarketBreadth` 和 `CrossMarketStrip` 已经在轮询新 endpoint，组件无需改 —— 一旦后端能返数据，会自动从 placeholder 切到 success state。唯一需改前端：`HKConnectPlaceholder` 是静态组件，要替换为活组件。

**Tech Stack:** Node 22 + vitest 3.x（gateway 已用），iconv-lite，现有 BaseProvider 抽象。

**Spec reference:** `docs/superpowers/specs/2026-05-26-market-dashboard-redesign-design.md`（章节 4.1-4.5）

**API 数据源（已 recon 确认可用）：**

| 用途 | URL | 备注 |
|------|-----|------|
| FX | `https://hq.sinajs.cn/list=fx_susdcny` | GBK 编码，逗号分隔 |
| FX | `https://hq.sinajs.cn/list=fx_susdjpy` | 同上 |
| 黄金 COMEX | `https://hq.sinajs.cn/list=hf_GC` | 期货格式（14 字段，价格在 idx 0） |
| 原油 WTI | `https://hq.sinajs.cn/list=hf_CL` | 同 GC |
| 日经 | `https://hq.sinajs.cn/list=int_nikkei` | 国际指数（4 字段：name,price,change,pct） |
| DAX | `https://push2.eastmoney.com/api/qt/stock/get?secid=100.GDAXI&fields=f43,f44,f45,f46,f60,f57,f58` | 价格 × 100 |
| FTSE | `secid=100.FTSE` | 同 DAX |
| A 股宽度 | `push2.eastmoney.com/api/qt/clist/get?pn=N&pz=200&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048&fields=f3,f12` | 分页拉 200/页，聚合所有 page |
| 港股通 HSGT | `push2.eastmoney.com/api/qt/kamt/get?fields1=f1,f2,f3,f4&fields2=f51,f52,f53,f54,f55,f56` | 返回 sh2hk/sz2hk/hk2sh/hk2sz 4 个对象 |

---

## File Structure

### Modify (gateway)

```
gateway/src/services/symbol-normalizer.js     # +.fx/.cm/.jp/.de/.uk branches
gateway/src/services/symbol-normalizer.test.js # tests for new branches
gateway/src/providers/sina-provider.js        # +FX/commodity/Nikkei branches in fetchQuote
gateway/src/providers/eastmoney-provider.js   # +fetchQuote for .de/.uk via universal quote API
gateway/src/providers/provider-registry.js    # fallback = ['tencent', 'eastmoney']
gateway/src/providers/live-mappers.js         # +parseSinaFx, parseSinaCommodity, parseSinaIntl, parseEastmoneyIntlIndex
gateway/src/routes/market-routes.js           # +/breadth, +/hk-connect
```

### Create (gateway)

```
gateway/src/services/breadth-service.js
gateway/src/services/hk-connect-service.js
gateway/tests/breadth-service.test.js
gateway/tests/hk-connect-service.test.js
```

### Modify (web)

```
web/src/components/market/HKZone.tsx         # swap HKConnectPlaceholder → live HKConnectCard
```

---

## Task P1: symbol-normalizer + new market suffixes (TDD)

**Files:**
- Modify: `gateway/src/services/symbol-normalizer.js`
- Test: `gateway/tests/symbol-normalizer.test.js`

- [ ] **Step 1: Add test cases**

Append to `gateway/tests/symbol-normalizer.test.js`:
```javascript
  it('handles forex symbols (.fx)', () => {
    expect(normalizeSymbol('USDCNY.fx')).toEqual({ market: 'fx', symbol: 'USDCNY.fx' });
    expect(normalizeSymbol('usdjpy.fx')).toEqual({ market: 'fx', symbol: 'USDJPY.fx' });
  });

  it('handles commodity symbols (.cm)', () => {
    expect(normalizeSymbol('XAU.cm')).toEqual({ market: 'cm', symbol: 'XAU.cm' });
    expect(normalizeSymbol('cl.cm')).toEqual({ market: 'cm', symbol: 'CL.cm' });
  });

  it('handles non-US international indices (.jp / .de / .uk)', () => {
    expect(normalizeSymbol('N225.jp')).toEqual({ market: 'jp', symbol: 'N225.jp' });
    expect(normalizeSymbol('dax.de')).toEqual({ market: 'de', symbol: 'DAX.de' });
    expect(normalizeSymbol('FTSE.uk')).toEqual({ market: 'uk', symbol: 'FTSE.uk' });
  });
```

- [ ] **Step 2: Run tests — should FAIL**

`cd gateway && pnpm test -- symbol-normalizer`
Expected: 3 new tests FAIL (`Invalid symbol`).

- [ ] **Step 3: Implement**

In `gateway/src/services/symbol-normalizer.js`, **before** the final `throw createInvalidSymbolError(input);`, insert:
```javascript
  // FX / 商品 / 非美海外指数：字母代码（含数字，如 N225）+ 后缀
  if (/^[a-z0-9]{2,8}\.fx$/.test(value)) {
    const code = value.replace(/\.fx$/, '').toUpperCase();
    return { market: 'fx', symbol: `${code}.fx` };
  }

  if (/^[a-z0-9]{1,8}\.cm$/.test(value)) {
    const code = value.replace(/\.cm$/, '').toUpperCase();
    return { market: 'cm', symbol: `${code}.cm` };
  }

  if (/^[a-z0-9]{1,8}\.(jp|de|uk)$/.test(value)) {
    const lastDot = value.lastIndexOf('.');
    const code = value.slice(0, lastDot).toUpperCase();
    const mkt = value.slice(lastDot + 1);
    return { market: mkt, symbol: `${code}.${mkt}` };
  }
```

- [ ] **Step 4: Tests pass**

`cd gateway && pnpm test -- symbol-normalizer` — all green.

- [ ] **Step 5: Commit**

```bash
git add gateway/src/services/symbol-normalizer.js gateway/tests/symbol-normalizer.test.js
git commit -m "feat(gateway): symbol-normalizer support for .fx/.cm/.jp/.de/.uk suffixes"
```

---

## Task P2: Sina provider — FX, commodity, international index (TDD)

**Files:**
- Modify: `gateway/src/providers/sina-provider.js`
- Modify: `gateway/src/providers/live-mappers.js`
- Test: `gateway/tests/sina-provider.test.js` (create if absent)

### Background on Sina formats

Each asset class has a different field layout (comma-separated after the `var hq_str_xxx="..."` envelope).

- **FX** (`fx_susdcny`): 19 fields, real fields: `time,price,prevClose,open,??,high,low,close,??,...`
  - We need: time (idx 0), price (idx 1), prevClose (idx 2), open (idx 4), high (idx 6), low (idx 5)? **Actually the layout per Sina docs is:** `time, latest, prevClose, open, ??(=67 maybe contract size), latest_dup, high, low, latest_dup2, ??, change, pct, ?, name, ?` — for safety, only trust **time, price, prevClose**, derive change locally.

- **Commodity futures** (`hf_GC`): 14 fields, `price, ??, settle, open, high, low, time, prevClose, ??, ??, ??, ??, date, name, ??`
  - We need: price (idx 0), open (idx 3), high (idx 4), low (idx 5), time (idx 6), prevClose (idx 7), name (idx 13)

- **International index** (`int_nikkei`): only 4 fields, `name, price, change, pct`
  - We need: name (idx 0), price (idx 1), pctChange (idx 3, already %), and **derive prevClose** = price - change_value (idx 2).

- [ ] **Step 1: Add parser tests**

Append to `gateway/tests/sina-provider.test.js` (create if absent — boilerplate at end of task):

```javascript
import { describe, expect, it } from 'vitest';
import { parseSinaFx, parseSinaCommodity, parseSinaIntlIndex } from '../src/providers/live-mappers.js';

describe('parseSinaFx', () => {
  it('parses USDCNY response', () => {
    const raw = 'var hq_str_fx_susdcny="23:56:02,6.7860000000,6.7868000000,6.7834000000,67.0000000000,6.7860000000,6.7888000000,6.7821000000,6.7868000000,在岸人民币,0.0501,0.0034,0.0067,中国外汇交易中心暨全国银行间同业拆借中心,0.0000";';
    const q = parseSinaFx(raw);
    expect(q.price).toBeCloseTo(6.786, 3);
    expect(q.prevClose).toBeCloseTo(6.7868, 4);
    expect(q.high).toBeCloseTo(6.7888, 4);
    expect(q.low).toBeCloseTo(6.7821, 4);
  });
});

describe('parseSinaCommodity', () => {
  it('parses COMEX gold (hf_GC)', () => {
    const raw = 'var hq_str_hf_GC="4539.080,,4538.800,4539.300,4615.600,4533.100,23:57:12,4556.400,4566.000,0,1,2,2026-05-26,纽约黄金,0";';
    const q = parseSinaCommodity(raw);
    expect(q.price).toBeCloseTo(4539.08, 2);
    expect(q.open).toBeCloseTo(4539.30, 2);
    expect(q.high).toBeCloseTo(4615.60, 2);
    expect(q.low).toBeCloseTo(4533.10, 2);
    expect(q.prevClose).toBeCloseTo(4556.40, 2);
  });
});

describe('parseSinaIntlIndex', () => {
  it('parses Nikkei (int_nikkei)', () => {
    const raw = 'var hq_str_int_nikkei="日经指数,44946.64,-408.35,-0.90";';
    const q = parseSinaIntlIndex(raw);
    expect(q.price).toBeCloseTo(44946.64, 2);
    expect(q.prevClose).toBeCloseTo(44946.64 + 408.35, 2); // change is negative, prevClose = price - change
    expect(q.pctChange).toBeCloseTo(-0.90, 2);
  });
});
```

If `gateway/tests/sina-provider.test.js` doesn't exist, the file just needs the imports above + the three `describe` blocks.

- [ ] **Step 2: Run tests — FAIL**

`cd gateway && pnpm test -- sina-provider`

- [ ] **Step 3: Implement parsers in `live-mappers.js`**

Add these exports to `gateway/src/providers/live-mappers.js`:

```javascript
const SINA_ENVELOPE = /="(.*)";/;

function extractSinaPayload(raw) {
  const m = raw.match(SINA_ENVELOPE);
  if (!m) throw new Error('Invalid Sina payload');
  if (!m[1]) throw new Error('Empty Sina payload');
  return m[1].split(',');
}

export function parseSinaFx(raw) {
  const parts = extractSinaPayload(raw);
  // Sina FX 19 fields: time,price,prevClose,open,?,?,high,low,...
  return {
    name: parts[13] || '',
    time: parts[0] || '',
    price: toNumber(parts[1]),
    prevClose: toNumber(parts[2]),
    open: toNumber(parts[3]),
    high: toNumber(parts[6]),
    low: toNumber(parts[7])
  };
}

export function parseSinaCommodity(raw) {
  const parts = extractSinaPayload(raw);
  // Sina hf_*: price, ??(?settle), settle, open, high, low, time, prevClose, ???, ???, ???, ???, date, name, ???
  return {
    name: parts[13] || '',
    time: parts[6] || '',
    price: toNumber(parts[0]),
    open: toNumber(parts[3]),
    high: toNumber(parts[4]),
    low: toNumber(parts[5]),
    prevClose: toNumber(parts[7])
  };
}

export function parseSinaIntlIndex(raw) {
  const parts = extractSinaPayload(raw);
  // int_*: name, price, change, pct
  const price = toNumber(parts[1]);
  const change = toNumber(parts[2]);
  return {
    name: parts[0] || '',
    price,
    prevClose: price - change,
    pctChange: toNumber(parts[3])
  };
}
```

(`toNumber` is already defined at top of live-mappers.js — used by parseSinaQuote.)

- [ ] **Step 4: Wire into sina-provider.js**

In `gateway/src/providers/sina-provider.js`, at the top:
```javascript
import { parseSinaQuote, parseSinaUSKline, parseSinaFx, parseSinaCommodity, parseSinaIntlIndex } from './live-mappers.js';
```

Replace `function buildSinaSymbol` and `async function fetchSinaQuote`:

```javascript
const SINA_INTL_MAP = {
  // .jp Nikkei
  'N225.jp': 'int_nikkei',
};
const SINA_COMMODITY_MAP = {
  'XAU.cm': 'hf_GC',
  'CL.cm':  'hf_CL',
};

function buildSinaSymbol({ market, symbol }) {
  if (market === 'fx') {
    // USDCNY.fx → fx_susdcny
    const code = symbol.replace(/\.fx$/i, '').toLowerCase();
    return `fx_s${code}`;
  }
  if (market === 'cm') {
    const key = symbol.toUpperCase();
    return SINA_COMMODITY_MAP[key] || null;
  }
  if (market === 'jp' || market === 'de' || market === 'uk') {
    const key = symbol;
    return SINA_INTL_MAP[key] || null;
  }
  if (symbol?.includes('.')) {
    const lastDot = symbol.lastIndexOf('.');
    const code = symbol.slice(0, lastDot);
    return `${market}${code}`;
  }
  return symbol;
}

async function fetchSinaQuote(context) {
  const code = buildSinaSymbol(context);
  if (!code) {
    throw new Error(`Sina has no symbol mapping for ${context.symbol}`);
  }
  const url = `https://hq.sinajs.cn/list=${code}`;
  const buffer = await fetchText(url, {
    headers: {
      Referer: 'https://finance.sina.com.cn',
      'User-Agent': 'Mozilla/5.0'
    },
    responseType: 'arrayBuffer'
  });
  const text = iconv.decode(Buffer.from(buffer), 'gbk');

  // Branch by market — each has its own field layout
  if (context.market === 'fx') {
    const d = parseSinaFx(text);
    return {
      name: d.name, now: d.price, prevClose: d.prevClose,
      open: d.open, high: d.high, low: d.low,
      volume: 0, turnover: 0, time: d.time
    };
  }
  if (context.market === 'cm') {
    const d = parseSinaCommodity(text);
    return {
      name: d.name, now: d.price, prevClose: d.prevClose,
      open: d.open, high: d.high, low: d.low,
      volume: 0, turnover: 0, time: d.time
    };
  }
  if (context.market === 'jp' || context.market === 'de' || context.market === 'uk') {
    const d = parseSinaIntlIndex(text);
    return {
      name: d.name, now: d.price, prevClose: d.prevClose,
      open: d.price, high: d.price, low: d.price,
      volume: 0, turnover: 0, time: ''
    };
  }
  return parseSinaQuote(text);
}
```

Also update the `SinaProvider.fetchQuote` to expose `prevClose`:
```javascript
return {
  symbol: context.symbol,
  market: context.market,
  name: data.name,
  now: data.now,
  prevClose: data.prevClose,   // ← add this line; harmless for A-share (parseSinaQuote doesn't return it; will be undefined)
  open: data.open,
  high: data.high,
  low: data.low,
  volume: data.volume,
  turnover: data.turnover,
  timestamp: data.time
};
```

- [ ] **Step 5: Tests pass**

`cd gateway && pnpm test -- sina-provider`

- [ ] **Step 6: Commit**

```bash
git add gateway/src/providers/sina-provider.js gateway/src/providers/live-mappers.js gateway/tests/sina-provider.test.js
git commit -m "feat(gateway): sina provider for FX / commodity / Nikkei (.fx/.cm/.jp)"
```

---

## Task P3: Eastmoney provider — DAX / FTSE via universal quote (TDD)

**Files:**
- Modify: `gateway/src/providers/eastmoney-provider.js`
- Modify: `gateway/src/providers/live-mappers.js`
- Test: `gateway/tests/eastmoney-provider.test.js`

### Mapping

```
'DAX.de'  → secid=100.GDAXI, scale=100  (price × 100, real DAX ≈ 25000)
'FTSE.uk' → secid=100.FTSE,  scale=100
```

Note: don't assume the same scale for all `.jp`/`.de`/`.uk` from Eastmoney. For now we only need DAX/FTSE on Eastmoney; N225 stays on Sina. So map exactly these two and reject others.

- [ ] **Step 1: Add tests**

Append to `gateway/tests/eastmoney-provider.test.js`:

```javascript
import { parseEastmoneyIntlIndex } from '../src/providers/live-mappers.js';

describe('parseEastmoneyIntlIndex', () => {
  it('parses DAX response (scale 100)', () => {
    const raw = { rc: 0, data: { f43: 2520592, f44: 2536164, f45: 2518050, f46: 2535975, f57: 'GDAXI', f58: '德国DAX30', f60: 2538910 } };
    const q = parseEastmoneyIntlIndex(raw, 100);
    expect(q.name).toBe('德国DAX30');
    expect(q.price).toBeCloseTo(25205.92, 2);
    expect(q.prevClose).toBeCloseTo(25389.10, 2);
    expect(q.high).toBeCloseTo(25361.64, 2);
    expect(q.low).toBeCloseTo(25180.50, 2);
    expect(q.open).toBeCloseTo(25359.75, 2);
  });

  it('throws on missing data', () => {
    expect(() => parseEastmoneyIntlIndex({ rc: 0, data: null }, 100)).toThrow();
  });
});
```

- [ ] **Step 2: Tests FAIL**

- [ ] **Step 3: Implement `parseEastmoneyIntlIndex` in live-mappers.js**

Add to `gateway/src/providers/live-mappers.js`:

```javascript
export function parseEastmoneyIntlIndex(raw, scale = 100) {
  const d = raw?.data;
  if (!d) throw new Error('Eastmoney intl index: empty data');
  const div = (v) => (typeof v === 'number' ? v / scale : 0);
  return {
    name: d.f58 || '',
    price: div(d.f43),
    high: div(d.f44),
    low: div(d.f45),
    open: div(d.f46),
    prevClose: div(d.f60)
  };
}
```

- [ ] **Step 4: Add `fetchQuote` to eastmoney-provider.js**

In `gateway/src/providers/eastmoney-provider.js`, add the import:
```javascript
import { parseEastmoneyTradeDetail, parseEastmoneyAnnouncements, parseEastmoneyCapital, parseEastmoneyKline, parseEastmoneyIntlIndex } from './live-mappers.js';
```

Add this method on `EastmoneyProvider` class (after `fetchKline`):

```javascript
async fetchQuote(context) {
  this.ensureMockableMode(context.providerMode, 'quote');

  if (context.providerMode !== 'live') {
    return {
      symbol: context.symbol,
      market: context.market,
      name: `Mock ${context.symbol}`,
      now: 100, prevClose: 99, open: 99.5, high: 101, low: 98.5,
      volume: 0, turnover: 0, timestamp: createTimestamp()
    };
  }

  const INTL_MAP = {
    'DAX.de':  { secid: '100.GDAXI', scale: 100 },
    'FTSE.uk': { secid: '100.FTSE',  scale: 100 }
  };
  const cfg = INTL_MAP[context.symbol];
  if (!cfg) {
    throw this.createError(`Eastmoney quote: unsupported symbol "${context.symbol}"`, {
      statusCode: 502,
      code: 'UNSUPPORTED_PROVIDER_OPERATION'
    });
  }

  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${cfg.secid}&fields=f43,f44,f45,f46,f60,f57,f58`;
  try {
    const raw = await fetchJson(url, {
      headers: {
        Referer: 'https://quote.eastmoney.com/center/',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    const d = parseEastmoneyIntlIndex(raw, cfg.scale);
    return {
      symbol: context.symbol, market: context.market,
      name: d.name, now: d.price, prevClose: d.prevClose,
      open: d.open, high: d.high, low: d.low,
      volume: 0, turnover: 0,
      timestamp: createTimestamp()
    };
  } catch (error) {
    throw this.createError(`Eastmoney quote failed: ${error.message}`, { cause: error });
  }
}
```

- [ ] **Step 5: Tests pass**

`cd gateway && pnpm test -- eastmoney`

- [ ] **Step 6: Commit**

```bash
git add gateway/src/providers/eastmoney-provider.js gateway/src/providers/live-mappers.js gateway/tests/eastmoney-provider.test.js
git commit -m "feat(gateway): eastmoney quote for DAX / FTSE indices (.de/.uk)"
```

---

## Task P4: Provider-registry — extend default fallback to include eastmoney

**Files:**
- Modify: `gateway/src/providers/provider-registry.js`
- Test: `gateway/tests/provider-registry.test.js` (create if needed)

Currently `fallback = ['tencent']`. After Phase 2, for `.de`/`.uk` markets sina + tencent both throw `UNSUPPORTED`, so eastmoney needs to be a 3rd attempt. Change the default.

- [ ] **Step 1: One-line change in provider-registry.js**

```javascript
// Line 19, change:
fallback = ['tencent'],
// to:
fallback = ['tencent', 'eastmoney'],
```

- [ ] **Step 2: Verify existing tests still pass**

`cd gateway && pnpm test`

If existing `provider-registry.test.js` exists and asserts `listProviders()` exact order, update those expectations.

- [ ] **Step 3: Commit**

```bash
git add gateway/src/providers/provider-registry.js
git commit -m "chore(gateway): add eastmoney to default provider fallback chain"
```

---

## Task P5: breadth-service + /api/hq/breadth endpoint (TDD)

**Files:**
- Create: `gateway/src/services/breadth-service.js`
- Create: `gateway/tests/breadth-service.test.js`
- Modify: `gateway/src/routes/market-routes.js`

### Behavior

- Fetch all A-share quotes from Eastmoney clist in paged chunks (`pz=200`, paginate until returned < page size)
- Aggregate `up`/`flat`/`down` counts + `limitUp`/`limitDown` (定义：A股涨跌停以 |pct| ≥ 9.95 为标准，覆盖普通主板 ±10% 与科创/创业板 ±20%，**Phase 2 实现按 ±9.95 简化，未来可细分按代码前缀**)
- gateway cache: 30 seconds
- Returns shape:
  ```json
  {
    "market": "cn",
    "asOf": "2026-05-27T10:32:11+08:00",
    "total": 5856,
    "up": 1989,
    "flat": 628,
    "down": 2617,
    "limitUp": 42,
    "limitDown": 7
  }
  ```

### Eastmoney clist details

- URL base: `https://push2.eastmoney.com/api/qt/clist/get`
- Required query: `pn=N&pz=200&po=0&np=1&fid=f3&fltt=2&invt=2&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048&fields=f3,f12`
- Headers: `Referer: https://quote.eastmoney.com/center/gridlist.html`, `User-Agent: Mozilla/5.0`
- Each item has `f3` (pct as number) and `f12` (code). Page 1 returns `data.total` (use to know when to stop).
- Stop paging when `pn * pz >= total` or returned `< pz`.

- [ ] **Step 1: Write tests**

Create `gateway/tests/breadth-service.test.js`:
```javascript
import { describe, expect, it, vi } from 'vitest';
import { createBreadthService } from '../src/services/breadth-service.js';

describe('breadth-service', () => {
  it('aggregates up/flat/down/limit counts from clist pages', async () => {
    // mock fetcher returns paged data
    let callCount = 0;
    const fakeFetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          data: {
            total: 7,
            diff: [
              { f3: 10.0, f12: '600001' },
              { f3: 5.5,  f12: '600002' },
              { f3: 0.0,  f12: '600003' },
              { f3: -3.2, f12: '600004' },
              { f3: -9.95, f12: '600005' },
            ]
          }
        };
      }
      return {
        data: {
          total: 7,
          diff: [
            { f3: -10.01, f12: '600006' },
            { f3: '-', f12: '600007' },  // halted
          ]
        }
      };
    });
    const svc = createBreadthService({ fetcher: fakeFetch, pageSize: 5, cacheTtlMs: 0 });
    const out = await svc.getBreadth('cn');
    expect(out.total).toBe(7);
    expect(out.up).toBe(2);
    expect(out.flat).toBe(1);
    expect(out.down).toBe(3);
    expect(out.limitUp).toBe(1);
    expect(out.limitDown).toBe(2);
    expect(out.asOf).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('caches result for ttl', async () => {
    let calls = 0;
    const fakeFetch = vi.fn(async () => {
      calls++;
      return { data: { total: 1, diff: [{ f3: 1.0, f12: 'X' }] } };
    });
    const svc = createBreadthService({ fetcher: fakeFetch, pageSize: 100, cacheTtlMs: 60000 });
    await svc.getBreadth('cn');
    await svc.getBreadth('cn');
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

Create `gateway/src/services/breadth-service.js`:
```javascript
import { fetchJson } from '../providers/http-client.js';
import { createTimestamp } from '../utils/time.js';

const CLIST_URL = 'https://push2.eastmoney.com/api/qt/clist/get';
const FS_A_SHARES = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048';
const LIMIT_THRESHOLD = 9.95;
const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_CACHE_TTL_MS = 30_000;
const MAX_PAGES = 50; // safety cap (5856 stocks / 200 = ~30)

function defaultFetcher(pn, pz) {
  const url = `${CLIST_URL}?pn=${pn}&pz=${pz}&po=0&np=1&fid=f3&fltt=2&invt=2&fs=${FS_A_SHARES}&fields=f3,f12`;
  return fetchJson(url, {
    headers: {
      Referer: 'https://quote.eastmoney.com/center/gridlist.html',
      'User-Agent': 'Mozilla/5.0'
    }
  });
}

export function createBreadthService({
  fetcher = defaultFetcher,
  pageSize = DEFAULT_PAGE_SIZE,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS
} = {}) {
  const cache = new Map(); // market → { value, expiresAt }

  async function fetchBreadth(market) {
    let up = 0, flat = 0, down = 0, limitUp = 0, limitDown = 0;
    let total = 0;
    for (let pn = 1; pn <= MAX_PAGES; pn++) {
      const resp = await fetcher(pn, pageSize);
      const data = resp?.data;
      if (!data || !Array.isArray(data.diff) || data.diff.length === 0) break;
      total = data.total || total;
      for (const row of data.diff) {
        const pct = row?.f3;
        if (typeof pct !== 'number') continue;
        if (pct >= LIMIT_THRESHOLD) limitUp++;
        if (pct <= -LIMIT_THRESHOLD) limitDown++;
        if (pct > 0) up++;
        else if (pct < 0) down++;
        else flat++;
      }
      if (data.diff.length < pageSize) break;
      if (pn * pageSize >= total) break;
    }
    return {
      market,
      asOf: createTimestamp(),
      total,
      up,
      flat,
      down,
      limitUp,
      limitDown
    };
  }

  async function getBreadth(market) {
    const cached = cache.get(market);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.value;
    const value = await fetchBreadth(market);
    cache.set(market, { value, expiresAt: now + cacheTtlMs });
    return value;
  }

  return { getBreadth };
}
```

- [ ] **Step 4: Tests pass**

`cd gateway && pnpm test -- breadth-service`

- [ ] **Step 5: Wire into routes**

In `gateway/src/routes/market-routes.js`, add near the other routes:
```javascript
import { createBreadthService } from '../services/breadth-service.js';
const breadthService = createBreadthService();

// ... existing router.get(...) ...

router.get('/breadth', async (req, res) => {
  const market = (req.query.market || 'cn').toString();
  if (market !== 'cn') {
    return res.status(400).json({ error: { code: 'INVALID_MARKET', message: `Only 'cn' supported, got '${market}'` } });
  }
  try {
    const data = await breadthService.getBreadth(market);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: { code: 'BREADTH_UNAVAILABLE', message: e.message } });
  }
});
```

**Read the actual file first** (`gateway/src/routes/market-routes.js`) to see the exact import style and router setup pattern. Match what's already there.

- [ ] **Step 6: Commit**

```bash
git add gateway/src/services/breadth-service.js gateway/tests/breadth-service.test.js gateway/src/routes/market-routes.js
git commit -m "feat(gateway): /api/hq/breadth — A-share market breadth aggregation"
```

---

## Task P6: hk-connect-service + /api/hq/hk-connect endpoint (TDD)

**Files:**
- Create: `gateway/src/services/hk-connect-service.js`
- Create: `gateway/tests/hk-connect-service.test.js`
- Modify: `gateway/src/routes/market-routes.js`

### Behavior

- Eastmoney HSGT real-time: `push2.eastmoney.com/api/qt/kamt/get?fields1=f1,f2,f3,f4&fields2=f51,f52,f53,f54,f55,f56`
- Returns `hk2sh`, `sh2hk`, `hk2sz`, `sz2hk`. Each has `{ status, dayNetAmtIn, dayAmtRemain, dayAmtThreshold, date, date2 }`.
- **港股通净流入** = `sh2hk.dayNetAmtIn + sz2hk.dayNetAmtIn` (单位: 万元，front-end converts to 亿)
- **北向（外资买 A）净流入** = `hk2sh.dayNetAmtIn + hk2sz.dayNetAmtIn`
- gateway cache: 60 seconds (data updates throughout trading day but not faster than once/minute is fine)

### Returns shape

```json
{
  "asOf": "...",
  "southboundNet": 24300000000,   // 元 (multiply 万元 * 10000)
  "northboundNet": -5100000000,
  "marketStatus": "closed"        // derive from status field; 1=opening, 2=trading, 3=closed
}
```

(`southboundDays` requires querying historical data — defer to Phase 3. Return `null` for now.)

- [ ] **Step 1: Tests**

Create `gateway/tests/hk-connect-service.test.js`:
```javascript
import { describe, expect, it, vi } from 'vitest';
import { createHkConnectService } from '../src/services/hk-connect-service.js';

describe('hk-connect-service', () => {
  it('aggregates southbound + northbound from kamt response', async () => {
    const fakeFetch = vi.fn(async () => ({
      data: {
        hk2sh: { status: 2, dayNetAmtIn: 100, dayAmtRemain: 4900, dayAmtThreshold: 5200, date2: '2026-05-27' },
        sh2hk: { status: 2, dayNetAmtIn: 200, dayAmtRemain: 4000, dayAmtThreshold: 4200, date2: '2026-05-27' },
        hk2sz: { status: 2, dayNetAmtIn: 50,  dayAmtRemain: 5100, dayAmtThreshold: 5200, date2: '2026-05-27' },
        sz2hk: { status: 2, dayNetAmtIn: 150, dayAmtRemain: 4050, dayAmtThreshold: 4200, date2: '2026-05-27' }
      }
    }));
    const svc = createHkConnectService({ fetcher: fakeFetch, cacheTtlMs: 0 });
    const out = await svc.getHkConnect();
    // 100 + 50 = 150 万元 = 1,500,000 元 northbound
    expect(out.northboundNet).toBe(1_500_000);
    // 200 + 150 = 350 万元 = 3,500,000 元 southbound
    expect(out.southboundNet).toBe(3_500_000);
    expect(out.marketStatus).toBe('trading');
    expect(out.southboundDays).toBeNull();
  });

  it('caches for ttl', async () => {
    let calls = 0;
    const fakeFetch = vi.fn(async () => {
      calls++;
      return { data: { hk2sh: { status: 3, dayNetAmtIn: 0 }, sh2hk: { status: 3, dayNetAmtIn: 0 }, hk2sz: { status: 3, dayNetAmtIn: 0 }, sz2hk: { status: 3, dayNetAmtIn: 0 } } };
    });
    const svc = createHkConnectService({ fetcher: fakeFetch, cacheTtlMs: 60000 });
    await svc.getHkConnect();
    await svc.getHkConnect();
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

Create `gateway/src/services/hk-connect-service.js`:
```javascript
import { fetchJson } from '../providers/http-client.js';
import { createTimestamp } from '../utils/time.js';

const KAMT_URL = 'https://push2.eastmoney.com/api/qt/kamt/get?fields1=f1,f2,f3,f4&fields2=f51,f52,f53,f54,f55,f56';
const DEFAULT_CACHE_TTL_MS = 60_000;

function defaultFetcher() {
  return fetchJson(KAMT_URL, {
    headers: {
      Referer: 'https://data.eastmoney.com/hsgt/index.html',
      'User-Agent': 'Mozilla/5.0'
    }
  });
}

function statusFrom(code) {
  if (code === 1) return 'opening';
  if (code === 2) return 'trading';
  if (code === 3) return 'closed';
  return 'unknown';
}

function wanToYuan(wan) {
  return typeof wan === 'number' ? Math.round(wan * 10000) : 0;
}

export function createHkConnectService({
  fetcher = defaultFetcher,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS
} = {}) {
  let cache = null;

  async function fetchData() {
    const resp = await fetcher();
    const d = resp?.data || {};
    const south = wanToYuan(d.sh2hk?.dayNetAmtIn) + wanToYuan(d.sz2hk?.dayNetAmtIn);
    const north = wanToYuan(d.hk2sh?.dayNetAmtIn) + wanToYuan(d.hk2sz?.dayNetAmtIn);
    // marketStatus: use 'trading' if any of the 4 channels is trading, else closed
    const allStatus = [d.hk2sh?.status, d.sh2hk?.status, d.hk2sz?.status, d.sz2hk?.status];
    const marketStatus = allStatus.includes(2) ? 'trading' : statusFrom(allStatus[0]);
    return {
      asOf: createTimestamp(),
      southboundNet: south,
      northboundNet: north,
      southboundDays: null,
      marketStatus
    };
  }

  async function getHkConnect() {
    const now = Date.now();
    if (cache && cache.expiresAt > now) return cache.value;
    const value = await fetchData();
    cache = { value, expiresAt: now + cacheTtlMs };
    return value;
  }

  return { getHkConnect };
}
```

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Wire into routes**

In `gateway/src/routes/market-routes.js`:
```javascript
import { createHkConnectService } from '../services/hk-connect-service.js';
const hkConnectService = createHkConnectService();

router.get('/hk-connect', async (_req, res) => {
  try {
    const data = await hkConnectService.getHkConnect();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: { code: 'HK_CONNECT_UNAVAILABLE', message: e.message } });
  }
});
```

- [ ] **Step 6: Commit**

```bash
git add gateway/src/services/hk-connect-service.js gateway/tests/hk-connect-service.test.js gateway/src/routes/market-routes.js
git commit -m "feat(gateway): /api/hq/hk-connect — HSGT real-time southbound/northbound flow"
```

---

## Task P7: Frontend — replace HKConnectPlaceholder with live HKConnectCard

**Files:**
- Modify: `web/src/components/market/HKZone.tsx`

Currently the bottom-right cell of HKZone is a static `HKConnectPlaceholder` showing "暂不可用". Replace it with a fetching component that calls `/api/hq/hk-connect` and renders the southbound flow.

- [ ] **Step 1: Replace component**

Open `web/src/components/market/HKZone.tsx`. **Replace the entire `HKConnectPlaceholder` function** with:

```typescript
function HKConnectCard() {
  const [data, setData] = useState<{ southboundNet: number; marketStatus: string } | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => startVisibilityPoll(async (signal) => {
    const resp = await fetchJSONSafe<{ southboundNet: number; marketStatus: string }>(
      `/api/hq/hk-connect`,
      { signal },
    );
    if (signal.aborted) return;
    if (resp && typeof resp.southboundNet === 'number') {
      setData(resp);
      setErrored(false);
    } else {
      setErrored(true);
    }
  }, 60_000), []);

  if (errored && !data) {
    return (
      <div className="flex flex-col rounded-sm border border-dashed border-[var(--color-border-base)] bg-[var(--color-bg-elev2)] p-2">
        <div className="text-[11px] text-[var(--color-text-secondary)]">港股通净流入</div>
        <div className="num mt-auto text-[12px] text-[var(--color-text-tertiary)]">暂不可用</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col rounded-sm bg-[var(--color-bg-elev2)] p-2">
        <div className="text-[11px] text-[var(--color-text-secondary)]">港股通净流入</div>
        <div className="num mt-auto h-4 w-16 animate-pulse rounded bg-[var(--color-bg-elev3)]" />
      </div>
    );
  }
  // Format southboundNet (元) → 亿 with 1 decimal
  const yi = data.southboundNet / 1e8;
  const sign = yi > 0 ? '+' : '';
  const colorCls = yi > 0 ? 'text-up' : yi < 0 ? 'text-down' : 'text-flat';
  return (
    <div className="flex flex-col rounded-sm bg-[var(--color-bg-elev2)] p-2">
      <div className="text-[11px] text-[var(--color-text-secondary)]">港股通净流入</div>
      <div className={`num mt-auto text-[14px] font-bold ${colorCls}`}>
        {sign}{yi.toFixed(1)} 亿
      </div>
    </div>
  );
}
```

Then change the `<HKConnectPlaceholder />` JSX call in the parent `HKZone` to `<HKConnectCard />`.

(Keep the old function deleted; subagent should produce a clean diff.)

- [ ] **Step 2: tsc check**

```bash
cd web && pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/market/HKZone.tsx
git commit -m "feat(market): HKZone — live HKConnectCard via /api/hq/hk-connect"
```

---

## Task P8: Smoke test + restart vfin.service

**Files:** None (verification only)

- [ ] **Step 1: All gateway tests pass**

```bash
cd gateway && pnpm test
```
Expected: all green. Note any pre-existing failures and ignore.

- [ ] **Step 2: web tsc + tests pass**

```bash
cd web && pnpm tsc --noEmit
cd web && pnpm test
```

- [ ] **Step 3: Restart service**

```bash
systemctl --user restart vfin.service
# wait
sleep 5
systemctl --user is-active vfin.service
```

- [ ] **Step 4: Live endpoint checks**

```bash
# Auth (existing demo or new test user)
# Then:
curl -sS --max-time 6 "http://localhost:3816/api/hq/stock?symbol=USDCNY.fx" | head -c 200
curl -sS --max-time 6 "http://localhost:3816/api/hq/stock?symbol=XAU.cm"     | head -c 200
curl -sS --max-time 6 "http://localhost:3816/api/hq/stock?symbol=N225.jp"    | head -c 200
curl -sS --max-time 6 "http://localhost:3816/api/hq/stock?symbol=DAX.de"     | head -c 200
curl -sS --max-time 6 "http://localhost:3816/api/hq/stock?symbol=FTSE.uk"    | head -c 200
curl -sS --max-time 15 "http://localhost:3816/api/hq/breadth?market=cn"      | head -c 300
curl -sS --max-time 8 "http://localhost:3816/api/hq/hk-connect"              | head -c 300
```

Each should return JSON with reasonable numeric fields (not error envelopes).

- [ ] **Step 5: Homepage check**

Auth-fetch homepage, verify "暂不可用" count has dropped vs Phase 1 baseline (`10` → expect ≤ `2` if all new endpoints work; trapped if any endpoint returns error envelope and triggers placeholder).

---

## Out of scope (Phase 3 candidates)

- `southboundDays` (連續净流入天數) — needs HSGT history query
- 行业热力图 server-side aggregation `/api/hq/sectors` — only needed if Phase 1 client aggregation < 80% valid (not yet observed)
- HK Connect 北向资金 widget (we compute it but don't display)
- L1 cards: 4-state machine instead of `--` fallback (current Phase 2 is sufficient)
- Real-time stale-data timestamps in widget UI
