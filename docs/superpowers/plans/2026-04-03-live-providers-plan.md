# HQChart Live Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement live public data providers (A股 + 港股) for gateway APIs with multi-source failover.

**Architecture:** Add a shared HTTP helper, implement live fetch/parsing in Tencent/Sina/Eastmoney providers, and register Eastmoney in provider registry. Preserve mock mode and use provider registry for fallback.

**Tech Stack:** Node.js 20, Express, fetch, iconv-lite.

---

## File Structure (new/changed)

- Create: `backend/gateway/src/providers/http-client.js`
- Create: `backend/gateway/src/providers/live-mappers.js`
- Create: `backend/gateway/src/providers/eastmoney-provider.js`
- Modify: `backend/gateway/src/providers/base-provider.js`
- Modify: `backend/gateway/src/providers/sina-provider.js`
- Modify: `backend/gateway/src/providers/tencent-provider.js`
- Modify: `backend/gateway/src/providers/provider-registry.js`
- Modify: `backend/gateway/package.json`
- Modify: `backend/gateway/package-lock.json`
- Create: `backend/gateway/tests/provider-live-mappers.test.js`

---

### Task 1: Add live mapper tests (TDD)

**Files:**
- Create: `backend/gateway/tests/provider-live-mappers.test.js`

- [ ] **Step 1: Add failing tests**

Create `backend/gateway/tests/provider-live-mappers.test.js`:
```js
import { describe, expect, it } from 'vitest';
import {
  parseTencentQuote,
  parseSinaQuote,
  parseTencentMinute,
  parseTencentKline,
  parseEastmoneyTradeDetail,
  parseEastmoneyAnnouncements,
  parseEastmoneyCapital
} from '../src/providers/live-mappers.js';

describe('live mappers', () => {
  it('parses tencent quote', () => {
    const raw = 'v_sh600000="1~浦发银行~600000~10.12~10.25~10.25~411518~0~0~10.12~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~~20260403161426~-0.13~-1.27~10.25~10.08~10.12/411518/417211984~";';
    const parsed = parseTencentQuote(raw);
    expect(parsed).toMatchObject({
      name: '浦发银行',
      code: '600000',
      now: 10.12,
      open: 10.25,
      high: 10.25,
      low: 10.08,
      volume: 411518,
      turnover: 417211984
    });
    expect(parsed.time).toBe('2026-04-03T16:14:26.000Z');
  });

  it('parses sina quote', () => {
    const raw = 'var hq_str_sh600000="浦发银行,10.250,10.250,10.120,10.250,10.080,10.120,10.130,41151821,417211984.000,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2026-04-03,15:00:01,00,";';
    const parsed = parseSinaQuote(raw);
    expect(parsed).toMatchObject({
      name: '浦发银行',
      open: 10.25,
      prevClose: 10.25,
      now: 10.12,
      high: 10.25,
      low: 10.08,
      volume: 41151821,
      turnover: 417211984
    });
    expect(parsed.time).toBe('2026-04-03T15:00:01.000Z');
  });

  it('parses tencent minute', () => {
    const raw = {
      data: {
        data: ['0930 10.25 640 656000.00', '0931 10.20 7499 7666904.00'],
        date: '20260403'
      }
    };
    const parsed = parseTencentMinute(raw);
    expect(parsed.points[0]).toMatchObject({ time: '09:30', price: 10.25, volume: 640, avgPrice: 1025 });
  });

  it('parses tencent kline', () => {
    const raw = {
      day: [['2026-04-03', '10.250', '10.120', '10.250', '10.080', '411518.000']]
    };
    const parsed = parseTencentKline(raw, 'day');
    expect(parsed.list[0]).toMatchObject({
      date: '2026-04-03',
      open: 10.25,
      close: 10.12,
      high: 10.25,
      low: 10.08,
      volume: 411518
    });
  });

  it('parses eastmoney trade detail', () => {
    const raw = {
      details: ['14:56:35,10.13,153,26,2', '14:56:38,10.12,180,32,1']
    };
    const parsed = parseEastmoneyTradeDetail(raw);
    expect(parsed.records[0]).toEqual(['14:56:35', 10.13, 153, 'sell']);
    expect(parsed.records[1]).toEqual(['14:56:38', 10.12, 180, 'buy']);
  });

  it('parses eastmoney announcements', () => {
    const raw = {
      list: [{ art_code: 'AN1', title: '公告', notice_date: '2026-04-03 00:00:00', codes: [{ stock_code: '600000' }] }]
    };
    const parsed = parseEastmoneyAnnouncements(raw);
    expect(parsed.items[0]).toMatchObject({ id: 'AN1', title: '公告' });
  });

  it('parses eastmoney capital', () => {
    const raw = { klines: ['2026-04-03,1,2,3,4,5'] };
    const parsed = parseEastmoneyCapital(raw);
    expect(parsed).toMatchObject({
      mainNetInflow: 1,
      largeNetInflow: 2,
      mediumNetInflow: 3,
      smallNetInflow: 4
    });
  });
});
```

- [ ] **Step 2: Run tests (expect fail)**

Run:
```bash
cd backend/gateway
npm test
```
Expected: FAIL (live-mappers module missing).

---
### Task 2: Add HTTP client + live mappers

**Files:**
- Create: `backend/gateway/src/providers/http-client.js`
- Create: `backend/gateway/src/providers/live-mappers.js`

- [ ] **Step 1: Create HTTP client**

Create `backend/gateway/src/providers/http-client.js`:
```js
const DEFAULT_TIMEOUT_MS = 8000;

export async function fetchText(url, { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, responseType = 'text' } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    if (responseType === 'arrayBuffer') {
      return response.arrayBuffer();
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchJson(url, options) {
  const text = await fetchText(url, options);
  return JSON.parse(text);
}
```

- [ ] **Step 2: Create live mappers**

Create `backend/gateway/src/providers/live-mappers.js`:
```js
function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function parseTencentTimestamp(value) {
  if (!value || value.length !== 14) {
    return new Date().toISOString();
  }

  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  const hour = value.slice(8, 10);
  const minute = value.slice(10, 12);
  const second = value.slice(12, 14);
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString();
}

export function parseTencentQuote(raw) {
  const match = raw.match(/="(.*)";/);
  if (!match) {
    throw new Error('Invalid Tencent quote payload');
  }
  const parts = match[1].split('~');
  const info = (parts[35] || '').split('/');

  return {
    name: parts[1],
    code: parts[2],
    now: toNumber(parts[3]),
    prevClose: toNumber(parts[4]),
    open: toNumber(parts[5]),
    high: toNumber(parts[33]),
    low: toNumber(parts[34]),
    volume: toNumber(parts[6]),
    turnover: toNumber(info[2]),
    time: parseTencentTimestamp(parts[30])
  };
}

export function parseSinaQuote(raw) {
  const match = raw.match(/="(.*)";/);
  if (!match) {
    throw new Error('Invalid Sina quote payload');
  }
  const parts = match[1].split(',');
  const date = parts[30] || '';
  const time = parts[31] || '';

  return {
    name: parts[0],
    open: toNumber(parts[1]),
    prevClose: toNumber(parts[2]),
    now: toNumber(parts[3]),
    high: toNumber(parts[4]),
    low: toNumber(parts[5]),
    volume: toNumber(parts[8]),
    turnover: toNumber(parts[9]),
    time: date && time ? new Date(`${date}T${time}Z`).toISOString() : new Date().toISOString()
  };
}

export function parseTencentMinute(raw) {
  const data = raw?.data ?? {};
  const list = data.data ?? [];
  const points = list.map((item) => {
    const [timeRaw, price, volume, amount] = item.split(' ');
    const time = `${timeRaw.slice(0, 2)}:${timeRaw.slice(2, 4)}`;
    const vol = toNumber(volume);
    const amt = toNumber(amount);
    const avgPrice = vol > 0 ? amt / vol : toNumber(price);

    return {
      time,
      price: toNumber(price),
      volume: vol,
      avgPrice
    };
  });

  return { points };
}

export function parseTencentKline(raw, period) {
  const list = raw?.[period] ?? [];
  return {
    period,
    list: list.map(([date, open, close, high, low, volume]) => ({
      date,
      open: toNumber(open),
      high: toNumber(high),
      low: toNumber(low),
      close: toNumber(close),
      volume: toNumber(volume),
      amount: 0
    }))
  };
}

export function parseEastmoneyTradeDetail(raw) {
  const details = raw?.details ?? [];
  return {
    records: details.map((row) => {
      const [time, price, volume, amount, sideRaw] = row.split(',');
      const side = sideRaw === '1' ? 'buy' : sideRaw === '2' ? 'sell' : 'unknown';
      return [time, toNumber(price), toNumber(volume), side];
    })
  };
}

export function parseEastmoneyAnnouncements(raw) {
  const list = raw?.list ?? [];
  return {
    items: list.map((item) => {
      const stockCode = item?.codes?.[0]?.stock_code || '';
      return {
        id: item.art_code,
        title: item.title || item.title_ch || '',
        publishedAt: item.notice_date || item.display_time || '',
        url: stockCode && item.art_code
          ? `https://data.eastmoney.com/notices/detail/${stockCode}/${item.art_code}.html`
          : ''
      };
    })
  };
}

export function parseEastmoneyCapital(raw) {
  const latest = raw?.klines?.[raw.klines.length - 1];
  if (!latest) {
    return { mainNetInflow: 0, largeNetInflow: 0, mediumNetInflow: 0, smallNetInflow: 0 };
  }

  const [, main, large, medium, small] = latest.split(',');
  return {
    mainNetInflow: toNumber(main),
    largeNetInflow: toNumber(large),
    mediumNetInflow: toNumber(medium),
    smallNetInflow: toNumber(small)
  };
}
```

- [ ] **Step 3: Run tests (expect pass)**

Run:
```bash
cd backend/gateway
npm test
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/gateway/src/providers/http-client.js backend/gateway/src/providers/live-mappers.js backend/gateway/tests/provider-live-mappers.test.js
git commit -m "test: add live data parsers"
```

---

### Task 3: Add iconv-lite for Sina GBK decoding

**Files:**
- Modify: `backend/gateway/package.json`
- Modify: `backend/gateway/package-lock.json`

- [ ] **Step 1: Install dependency**

Run:
```bash
cd backend/gateway
npm install iconv-lite
```

- [ ] **Step 2: Commit**

```bash
git add backend/gateway/package.json backend/gateway/package-lock.json
git commit -m "chore(gateway): add iconv-lite for sina decoding"
```

---
### Task 4: Implement live providers

**Files:**
- Modify: `backend/gateway/src/providers/base-provider.js`
- Modify: `backend/gateway/src/providers/sina-provider.js`
- Modify: `backend/gateway/src/providers/tencent-provider.js`
- Create: `backend/gateway/src/providers/eastmoney-provider.js`

- [ ] **Step 1: Allow live mode in BaseProvider**

Update `backend/gateway/src/providers/base-provider.js`:
```js
  ensureMockableMode(mode, operation) {
    if (mode === 'mock' || mode === 'live') {
      return;
    }

    if (mode === 'force-error') {
      throw this.createError(
        `Provider "${this.name}" forced an error for ${operation}`,
        {
          code: 'FORCED_PROVIDER_ERROR',
          statusCode: 502
        }
      );
    }

    throw this.createError(`Unsupported provider mode "${mode}"`, {
      code: 'UNSUPPORTED_PROVIDER_MODE',
      statusCode: 400
    });
  }
```

- [ ] **Step 2: Update Sina provider**

Update `backend/gateway/src/providers/sina-provider.js` to:
```js
import iconv from 'iconv-lite';
import { BaseProvider } from './base-provider.js';
import { fetchText } from './http-client.js';
import { parseSinaQuote } from './live-mappers.js';

function createTimestamp() {
  return '2026-04-03T09:30:00.000Z';
}

function buildSinaSymbol({ market, symbol }) {
  if (symbol?.includes('.')) {
    const [code] = symbol.split('.');
    return `${market}${code}`;
  }
  return symbol;
}

async function fetchSinaQuote(context) {
  const code = buildSinaSymbol(context);
  const url = `https://hq.sinajs.cn/list=${code}`;
  const buffer = await fetchText(url, {
    headers: {
      Referer: 'https://finance.sina.com.cn',
      'User-Agent': 'Mozilla/5.0'
    },
    responseType: 'arrayBuffer'
  });
  const text = iconv.decode(Buffer.from(buffer), 'gbk');
  return parseSinaQuote(text);
}

export class SinaProvider extends BaseProvider {
  constructor() {
    super({ name: 'sina' });
  }

  async fetchQuote(context) {
    this.ensureMockableMode(context.providerMode, 'quote');

    if (context.providerMode === 'live') {
      try {
        const data = await fetchSinaQuote(context);
        return {
          symbol: context.symbol,
          market: context.market,
          name: data.name,
          now: data.now,
          open: data.open,
          high: data.high,
          low: data.low,
          volume: data.volume,
          turnover: data.turnover,
          timestamp: data.time
        };
      } catch (error) {
        throw this.createError(`Sina quote failed: ${error.message}`, { cause: error });
      }
    }

    return {
      symbol: context.symbol,
      market: context.market,
      name: `Mock ${context.symbol}`,
      now: 12.34,
      open: 12.1,
      high: 12.6,
      low: 12,
      volume: 123456,
      turnover: 1523456,
      timestamp: createTimestamp()
    };
  }

  async fetchMinute(context) {
    this.ensureMockableMode(context.providerMode, 'minute');
    if (context.providerMode === 'live') {
      throw this.createError('Sina minute not supported', { statusCode: 502, code: 'UNSUPPORTED_PROVIDER_OPERATION' });
    }

    return {
      symbol: context.symbol,
      market: context.market,
      points: [
        { time: '09:30', price: 12.1, volume: 1200, avgPrice: 12.1 },
        { time: '09:31', price: 12.2, volume: 1800, avgPrice: 12.15 },
        { time: '09:32', price: 12.34, volume: 2400, avgPrice: 12.21 }
      ],
      timestamp: createTimestamp()
    };
  }

  async fetchKline(context) {
    this.ensureMockableMode(context.providerMode, 'kline');
    if (context.providerMode === 'live') {
      throw this.createError('Sina kline not supported', { statusCode: 502, code: 'UNSUPPORTED_PROVIDER_OPERATION' });
    }

    return {
      symbol: context.symbol,
      market: context.market,
      period: context.period ?? 'day',
      list: [
        {
          date: '2026-04-01',
          open: 12,
          high: 12.5,
          low: 11.9,
          close: 12.2,
          volume: 110000,
          amount: 1342000
        },
        {
          date: '2026-04-02',
          open: 12.2,
          high: 12.4,
          low: 12.1,
          close: 12.28,
          volume: 98000,
          amount: 1204800
        },
        {
          date: '2026-04-03',
          open: 12.28,
          high: 12.6,
          low: 12.18,
          close: 12.34,
          volume: 123456,
          amount: 1523456
        }
      ],
      timestamp: createTimestamp()
    };
  }

  async fetchCapital(context) {
    this.ensureMockableMode(context.providerMode, 'capital');
    if (context.providerMode === 'live') {
      throw this.createError('Sina capital not supported', { statusCode: 502, code: 'UNSUPPORTED_PROVIDER_OPERATION' });
    }

    return {
      symbol: context.symbol,
      market: context.market,
      mainNetInflow: 1200000,
      largeNetInflow: 560000,
      mediumNetInflow: -210000,
      smallNetInflow: -430000,
      timestamp: createTimestamp()
    };
  }

  async fetchCallauction(context) {
    this.ensureMockableMode(context.providerMode, 'callauction');
    if (context.providerMode === 'live') {
      throw this.createError('Sina callauction not supported', { statusCode: 502, code: 'UNSUPPORTED_PROVIDER_OPERATION' });
    }

    return {
      symbol: context.symbol,
      market: context.market,
      price: 12.3,
      matchedVolume: 8200,
      unmatchedVolume: 600,
      direction: 'buy',
      timestamp: createTimestamp()
    };
  }

  async fetchTradeDetail(context) {
    this.ensureMockableMode(context.providerMode, 'trade');
    if (context.providerMode === 'live') {
      throw this.createError('Sina trade detail not supported', { statusCode: 502, code: 'UNSUPPORTED_PROVIDER_OPERATION' });
    }

    return {
      symbol: context.symbol,
      market: context.market,
      trades: [
        { time: '09:30:01', price: 12.3, volume: 100, side: 'buy' },
        { time: '09:30:03', price: 12.29, volume: 200, side: 'sell' },
        { time: '09:30:05', price: 12.34, volume: 300, side: 'buy' }
      ],
      timestamp: createTimestamp()
    };
  }

  async fetchNews(context) {
    this.ensureMockableMode(context.providerMode, 'news');
    if (context.providerMode === 'live') {
      throw this.createError('Sina news not supported', { statusCode: 502, code: 'UNSUPPORTED_PROVIDER_OPERATION' });
    }

    return {
      symbol: context.symbol,
      market: context.market,
      items: [
        {
          id: `${context.symbol}-news-1`,
          title: `Mock news for ${context.symbol}`,
          publishedAt: createTimestamp(),
          summary: 'Stable mock news payload for tests.'
        }
      ],
      timestamp: createTimestamp()
    };
  }

  async fetchAnnouncements(context) {
    this.ensureMockableMode(context.providerMode, 'announcements');
    if (context.providerMode === 'live') {
      throw this.createError('Sina announcements not supported', { statusCode: 502, code: 'UNSUPPORTED_PROVIDER_OPERATION' });
    }

    return {
      symbol: context.symbol,
      market: context.market,
      items: [
        {
          id: `${context.symbol}-announcement-1`,
          title: `Mock announcement for ${context.symbol}`,
          publishedAt: createTimestamp(),
          url: `https://example.test/announcements/${context.symbol}`
        }
      ],
      timestamp: createTimestamp()
    };
  }
}
```

- [ ] **Step 3: Update Tencent provider**

Update `backend/gateway/src/providers/tencent-provider.js` to:
```js
import { BaseProvider } from './base-provider.js';
import { fetchJson, fetchText } from './http-client.js';
import { parseTencentQuote, parseTencentMinute, parseTencentKline } from './live-mappers.js';

function createTimestamp() {
  return '2026-04-03T09:30:00.000Z';
}

function buildTencentSymbol({ market, symbol }) {
  if (symbol?.includes('.')) {
    const [code] = symbol.split('.');
    return `${market}${code}`;
  }
  return symbol;
}

function resolveTencentPeriod(period) {
  if (!period) return 'day';
  if (['day', 'week', 'month', 'year'].includes(period)) return period;
  return 'day';
}

export class TencentProvider extends BaseProvider {
  constructor() {
    super({ name: 'tencent' });
  }

  async fetchQuote(context) {
    this.ensureMockableMode(context.providerMode, 'quote');

    if (context.providerMode === 'live') {
      try {
        const code = buildTencentSymbol(context);
        const url = `https://qt.gtimg.cn/q=${code}`;
        const text = await fetchText(url, {
          headers: {
            Referer: 'https://finance.qq.com/',
            'User-Agent': 'Mozilla/5.0'
          }
        });
        const data = parseTencentQuote(text);
        return {
          code: context.symbol,
          market: context.market,
          title: data.name,
          price: data.now,
          openPrice: data.open,
          maxPrice: data.high,
          minPrice: data.low,
          totalVolume: data.volume,
          totalAmount: data.turnover,
          time: data.time
        };
      } catch (error) {
        throw this.createError(`Tencent quote failed: ${error.message}`, { cause: error });
      }
    }

    return {
      code: context.symbol,
      market: context.market,
      title: `Tencent Mock ${context.symbol}`,
      price: 12.34,
      openPrice: 12.1,
      maxPrice: 12.6,
      minPrice: 12,
      totalVolume: 123456,
      totalAmount: 1523456,
      time: createTimestamp()
    };
  }

  async fetchMinute(context) {
    this.ensureMockableMode(context.providerMode, 'minute');

    if (context.providerMode === 'live') {
      try {
        const code = buildTencentSymbol(context);
        const url = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${code}`;
        const json = await fetchJson(url);
        const data = json?.data?.[code] ?? {};
        const parsed = parseTencentMinute(data?.data ?? {});
        return {
          code: context.symbol,
          market: context.market,
          line: parsed.points.map((point) => [point.time, point.price, point.volume, point.avgPrice]),
          time: new Date().toISOString()
        };
      } catch (error) {
        throw this.createError(`Tencent minute failed: ${error.message}`, { cause: error });
      }
    }

    return {
      code: context.symbol,
      market: context.market,
      line: [
        ['09:30', 12.1, 1200, 12.1],
        ['09:31', 12.2, 1800, 12.15],
        ['09:32', 12.34, 2400, 12.21]
      ],
      time: createTimestamp()
    };
  }

  async fetchKline(context) {
    this.ensureMockableMode(context.providerMode, 'kline');

    if (context.providerMode === 'live') {
      try {
        const code = buildTencentSymbol(context);
        const period = resolveTencentPeriod(context.period);
        const count = context.count ?? 200;
        const url = `https://web.ifzq.gtimg.cn/appstock/app/kline/kline?param=${code},${period},,,${count}`;
        const json = await fetchJson(url);
        const data = json?.data?.[code] ?? {};
        const parsed = parseTencentKline(data, period);
        return {
          code: context.symbol,
          market: context.market,
          cycle: period,
          candles: parsed.list.map((item) => [
            item.date,
            item.open,
            item.high,
            item.low,
            item.close,
            item.volume,
            item.amount
          ]),
          time: new Date().toISOString()
        };
      } catch (error) {
        throw this.createError(`Tencent kline failed: ${error.message}`, { cause: error });
      }
    }

    return {
      code: context.symbol,
      market: context.market,
      cycle: context.period ?? 'day',
      candles: [
        ['2026-04-01', 12, 12.5, 11.9, 12.2, 110000, 1342000],
        ['2026-04-02', 12.2, 12.4, 12.1, 12.28, 98000, 1204800],
        ['2026-04-03', 12.28, 12.6, 12.18, 12.34, 123456, 1523456]
      ],
      time: createTimestamp()
    };
  }

  async fetchCapital(context) {
    this.ensureMockableMode(context.providerMode, 'capital');
    if (context.providerMode === 'live') {
      throw this.createError('Tencent capital not supported', { statusCode: 502, code: 'UNSUPPORTED_PROVIDER_OPERATION' });
    }

    return {
      code: context.symbol,
      market: context.market,
      flows: {
        main: 1200000,
        large: 560000,
        medium: -210000,
        small: -430000
      },
      time: createTimestamp()
    };
  }

  async fetchCallauction(context) {
    this.ensureMockableMode(context.providerMode, 'callauction');
    if (context.providerMode === 'live') {
      throw this.createError('Tencent callauction not supported', { statusCode: 502, code: 'UNSUPPORTED_PROVIDER_OPERATION' });
    }

    return {
      code: context.symbol,
      market: context.market,
      auction: {
        price: 12.3,
        matchedVolume: 8200,
        unmatchedVolume: 600,
        direction: 'buy'
      },
      time: createTimestamp()
    };
  }

  async fetchTradeDetail(context) {
    this.ensureMockableMode(context.providerMode, 'trade');
    if (context.providerMode === 'live') {
      throw this.createError('Tencent trade detail not supported', { statusCode: 502, code: 'UNSUPPORTED_PROVIDER_OPERATION' });
    }

    return {
      code: context.symbol,
      market: context.market,
      records: [
        ['09:30:01', 12.3, 100, 'buy'],
        ['09:30:03', 12.29, 200, 'sell'],
        ['09:30:05', 12.34, 300, 'buy']
      ],
      time: createTimestamp()
    };
  }

  async fetchNews(context) {
    this.ensureMockableMode(context.providerMode, 'news');
    if (context.providerMode === 'live') {
      throw this.createError('Tencent news not supported', { statusCode: 502, code: 'UNSUPPORTED_PROVIDER_OPERATION' });
    }

    return {
      code: context.symbol,
      market: context.market,
      news: [
        {
          id: `${context.symbol}-news-1`,
          title: `Tencent mock news for ${context.symbol}`,
          publishedAt: createTimestamp(),
          summary: 'Stable fallback news payload for tests.'
        }
      ],
      time: createTimestamp()
    };
  }

  async fetchAnnouncements(context) {
    this.ensureMockableMode(context.providerMode, 'announcements');
    if (context.providerMode === 'live') {
      throw this.createError('Tencent announcements not supported', { statusCode: 502, code: 'UNSUPPORTED_PROVIDER_OPERATION' });
    }

    return {
      code: context.symbol,
      market: context.market,
      announcements: [
        {
          id: `${context.symbol}-announcement-1`,
          title: `Tencent mock announcement for ${context.symbol}`,
          publishedAt: createTimestamp(),
          url: `https://example.test/tencent/announcements/${context.symbol}`
        }
      ],
      time: createTimestamp()
    };
  }
}
```

- [ ] **Step 4: Add Eastmoney provider**

Create `backend/gateway/src/providers/eastmoney-provider.js`:
```js
import { BaseProvider } from './base-provider.js';
import { fetchJson } from './http-client.js';
import {
  parseEastmoneyTradeDetail,
  parseEastmoneyAnnouncements,
  parseEastmoneyCapital
} from './live-mappers.js';

function createTimestamp() {
  return new Date().toISOString();
}

function buildEastmoneySecId({ market, symbol }) {
  const code = symbol?.includes('.') ? symbol.split('.')[0] : symbol;
  if (market === 'sh') return `1.${code}`;
  if (market === 'sz') return `0.${code}`;
  return null;
}

export class EastmoneyProvider extends BaseProvider {
  constructor() {
    super({ name: 'eastmoney' });
  }

  async fetchCapital(context) {
    this.ensureMockableMode(context.providerMode, 'capital');
    if (context.providerMode !== 'live') {
      return {
        code: context.symbol,
        market: context.market,
        flows: {
          main: 1200000,
          large: 560000,
          medium: -210000,
          small: -430000
        },
        time: createTimestamp()
      };
    }

    const secid = buildEastmoneySecId(context);
    if (!secid) {
      return {
        code: context.symbol,
        market: context.market,
        flows: { main: 0, large: 0, medium: 0, small: 0 },
        time: createTimestamp()
      };
    }

    const url = `https://push2.eastmoney.com/api/qt/stock/fflow/kline/get?secid=${secid}&klt=101&lmt=1&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55`;
    const json = await fetchJson(url);
    const parsed = parseEastmoneyCapital(json?.data ?? {});

    return {
      code: context.symbol,
      market: context.market,
      flows: {
        main: parsed.mainNetInflow,
        large: parsed.largeNetInflow,
        medium: parsed.mediumNetInflow,
        small: parsed.smallNetInflow
      },
      time: createTimestamp()
    };
  }

  async fetchTradeDetail(context) {
    this.ensureMockableMode(context.providerMode, 'trade');
    if (context.providerMode !== 'live') {
      return {
        code: context.symbol,
        market: context.market,
        records: [
          ['09:30:01', 12.3, 100, 'buy'],
          ['09:30:03', 12.29, 200, 'sell'],
          ['09:30:05', 12.34, 300, 'buy']
        ],
        time: createTimestamp()
      };
    }

    const secid = buildEastmoneySecId(context);
    if (!secid) {
      return { code: context.symbol, market: context.market, records: [], time: createTimestamp() };
    }

    const url = `https://push2.eastmoney.com/api/qt/stock/details/get?secid=${secid}&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55`;
    const json = await fetchJson(url);
    const parsed = parseEastmoneyTradeDetail(json?.data ?? {});

    return {
      code: context.symbol,
      market: context.market,
      records: parsed.records,
      time: createTimestamp()
    };
  }

  async fetchAnnouncements(context) {
    this.ensureMockableMode(context.providerMode, 'announcements');
    if (context.providerMode !== 'live') {
      return {
        code: context.symbol,
        market: context.market,
        announcements: [
          {
            id: `${context.symbol}-announcement-1`,
            title: `Tencent mock announcement for ${context.symbol}`,
            publishedAt: createTimestamp(),
            url: `https://example.test/tencent/announcements/${context.symbol}`
          }
        ],
        time: createTimestamp()
      };
    }

    if (context.market === 'hk') {
      return { code: context.symbol, market: context.market, announcements: [], time: createTimestamp() };
    }

    const code = context.symbol?.split('.')[0];
    const url = `https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size=10&page_index=1&ann_type=A&client_source=web&stock_list=${code}`;
    const json = await fetchJson(url);
    const parsed = parseEastmoneyAnnouncements(json?.data ?? {});

    return {
      code: context.symbol,
      market: context.market,
      announcements: parsed.items,
      time: createTimestamp()
    };
  }

  async fetchNews(context) {
    this.ensureMockableMode(context.providerMode, 'news');
    if (context.providerMode !== 'live') {
      return {
        code: context.symbol,
        market: context.market,
        news: [
          {
            id: `${context.symbol}-news-1`,
            title: `Tencent mock news for ${context.symbol}`,
            publishedAt: createTimestamp(),
            summary: 'Stable fallback news payload for tests.'
          }
        ],
        time: createTimestamp()
      };
    }

    const announcements = await this.fetchAnnouncements({ ...context, providerMode: 'live' });
    return {
      code: context.symbol,
      market: context.market,
      news: announcements.announcements.map((item) => ({
        id: item.id,
        title: item.title,
        publishedAt: item.publishedAt,
        summary: ''
      })),
      time: createTimestamp()
    };
  }
}

export function createEastmoneyProvider() {
  return new EastmoneyProvider();
}
```

- [ ] **Step 5: Run tests**

Run:
```bash
cd backend/gateway
npm test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/gateway/src/providers/base-provider.js backend/gateway/src/providers/sina-provider.js backend/gateway/src/providers/tencent-provider.js backend/gateway/src/providers/eastmoney-provider.js
git commit -m "feat(gateway): implement live providers"
```

---

### Task 5: Register Eastmoney provider and default order

**Files:**
- Modify: `backend/gateway/src/providers/provider-registry.js`
- Modify: `backend/gateway/src/config.js`

- [ ] **Step 1: Register provider**

Update `backend/gateway/src/providers/provider-registry.js`:
```js
import { createEastmoneyProvider } from './eastmoney-provider.js';

const providerMap = providers ?? new Map([
  ['sina', createSinaProvider()],
  ['tencent', createTencentProvider()],
  ['eastmoney', createEastmoneyProvider()]
]);
```

- [ ] **Step 2: Update default provider order**

Update `backend/gateway/src/config.js` default to:
```js
const providerOrderRaw = env.HQ_PROVIDER_ORDER || 'tencent,sina,eastmoney';
```

- [ ] **Step 3: Run tests**

Run:
```bash
cd backend/gateway
npm test
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/gateway/src/providers/provider-registry.js backend/gateway/src/config.js
git commit -m "feat(gateway): add eastmoney provider and order"
```

---

### Task 6: Live API smoke

- [ ] **Step 1: Start gateway**

Run:
```bash
cd backend/gateway
node src/server.js
```

- [ ] **Step 2: Smoke requests**

Run in another terminal:
```bash
curl "http://127.0.0.1:18080/api/stock?symbol=600000.sh"
curl "http://127.0.0.1:18080/api/minute?symbol=600000.sh"
curl "http://127.0.0.1:18080/api/kline?symbol=600000.sh&period=day&count=5"
curl "http://127.0.0.1:18080/api/stock?symbol=00700.hk"
curl "http://127.0.0.1:18080/api/kline?symbol=00700.hk&period=day&count=5"
curl "http://127.0.0.1:18080/api/capital?symbol=600000.sh"
curl "http://127.0.0.1:18080/api/trade-detail?symbol=600000.sh"
curl "http://127.0.0.1:18080/api/announcements?symbol=600000.sh"
```
Expected: HTTP 200 with live payloads (non-empty for quote/minute/kline; others may be empty but no errors).

---

### Task 7: Continue Task 6 regression report

Follow original Task 6 steps to generate `HQCHART_SIMPLE_LAYOUT_TEST_REPORT.md` and commit:
```bash
git add HQCHART_SIMPLE_LAYOUT_TEST_REPORT.md
git commit -m "test: verify simplified hqchart layout"
```
