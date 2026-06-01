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

function createExecutionContext(params, defaultProviderMode, operation) {
  const { symbol, market } = normalizeSymbol(params.symbol);

  // HK quote routing: tencent's free `qt.gtimg.cn` HK feed is 15-min delayed
  // (the user-visible "01810 stuck at +0.00%" bug). Eastmoney push2 is
  // real-time and free, so prefer it for HK quotes. Other markets are
  // unchanged because tencent serves A-share/US in real-time.
  // Kline/minute/capital paths are untouched (eastmoney still last fallback).
  let provider = params.provider;
  if (!provider && operation === 'quote' && market === 'hk') {
    provider = 'eastmoney';
  }

  return {
    symbol,
    market,
    providerMode: params.providerMode ?? defaultProviderMode,
    provider,
    period: params.period,
    day: params.day,
    count: params.count,
    offset: params.offset,
    allHistory: params.allHistory
  };
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  return false;
}

function isLongCycle(period) {
  return ['day', 'week', 'month', 'year'].includes(period ?? 'day');
}

function sortKlineItems(items) {
  return [...items].sort((left, right) => {
    const leftKey = `${left.date ?? ''} ${left.time ?? ''}`;
    const rightKey = `${right.date ?? ''} ${right.time ?? ''}`;
    return leftKey.localeCompare(rightKey);
  });
}

function uniqueKlineItems(items) {
  const map = new Map();
  for (const item of items) {
    const key = [
      item.date ?? '',
      item.time ?? '',
      item.open ?? '',
      item.high ?? '',
      item.low ?? '',
      item.close ?? '',
      item.volume ?? ''
    ].join('|');
    if (!map.has(key)) map.set(key, item);
  }

  return [...map.values()];
}

// H13: coerce all numerics through a finite-guard so a single string/null
// upstream value cannot poison min/max/sum into NaN.
function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function aggregateYearItems(items) {
  const yearMap = new Map();
  for (const item of items) {
    const dateText = String(item.date ?? '');
    const year = dateText.slice(0, 4);
    if (!/^\d{4}$/.test(year)) continue;

    const openN = num(item.open);
    const highN = num(item.high);
    const lowN = num(item.low);
    const closeN = num(item.close);

    if (!yearMap.has(year)) {
      yearMap.set(year, {
        date: item.date,
        open: openN,
        high: highN,
        low: lowN,
        close: closeN,
        volume: num(item.volume),
        amount: num(item.amount)
      });
      continue;
    }

    const current = yearMap.get(year);
    current.date = item.date;
    current.high = Math.max(current.high, highN);
    current.low = Math.min(current.low, lowN);
    current.close = closeN;
    current.volume += num(item.volume);
    current.amount += num(item.amount);
  }

  return [...yearMap.values()];
}

/**
 * 分层缓存 TTL（避免对每种操作用同一个 1s 默认值）：
 * - quote 报价 5 秒（前端轮询周期）
 * - minute 分时 10 秒
 * - day/week K 线 60 秒
 * - month/year K 线 5 分钟（收盘后才变）
 * - search/list 60 秒
 */
function ttlForOperation(operation, context) {
  if (operation === 'quote') return 5_000;
  if (operation === 'minute') return 10_000;
  if (operation === 'kline') {
    const p = context?.period ?? 'day';
    if (p === 'month' || p === 'year') return 300_000;
    if (p === 'week') return 120_000;
    if (p === 'day') return 60_000;
    // 分钟级 K 线（1m/5m/15m/30m）跟 quote 同步
    return 10_000;
  }
  if (operation === 'search') return 60_000;
  return 5_000;
}

export function createHqchartDataService({
  providerRegistry = createProviderRegistry(),
  cacheService = createCacheService(),
  resilienceService = createResilienceService(),
  normalizer = createHqchartNormalizer(),
  cacheTtlMs, // 兼容旧参数；优先用 ttlForOperation
  providerMode = 'live'
} = {}) {
  async function execute(operation, params = {}) {
    const context = createExecutionContext(params, providerMode, operation);
    const cacheKey = createCacheKey(operation, context);
    const ttlMs = cacheTtlMs ?? ttlForOperation(operation, context);

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        // 熔断 key 含周期，避免分钟线失败影响日线熔断器
        const circuitKey = context.period
          ? `${operation}:${context.symbol}:${context.period}`
          : `${operation}:${context.symbol}`;
        const result = await resilienceService.execute(
          () => providerRegistry.execute(operation, context),
          { key: circuitKey }
        );

        const methodName = NORMALIZER_METHODS[operation];
        return normalizer[methodName](result.data, {
          ...context,
          provider: result.provider
        });
      },
      { ttlMs }
    );
  }

  async function getKline(params = {}) {
    const period = params.period ?? 'day';
    const allHistory = toBoolean(params.allHistory);
    if (!allHistory || !isLongCycle(period)) {
      return execute('kline', params);
    }

    const pageSize = Number(params.count ?? 1200);
    let offset = Number(params.offset ?? 0);
    let aggregated = [];
    let firstPayload = null;
    const fetchPeriod = period === 'year' ? 'month' : period;

    // Safeguard to avoid endless paging when an upstream ignores offset.
    for (let page = 0; page < 12; page += 1) {
      const payload = await execute('kline', {
        ...params,
        period: fetchPeriod,
        count: pageSize,
        offset
      });

      if (!firstPayload) firstPayload = payload;
      const items = Array.isArray(payload.items) ? payload.items : [];
      if (!items.length) break;

      const before = aggregated.length;
      aggregated = uniqueKlineItems([...aggregated, ...items]);
      const added = aggregated.length - before;
      if (items.length < pageSize || added === 0) break;

      offset += items.length;
    }

    const base = firstPayload ?? (await execute('kline', params));
    const sorted = sortKlineItems(aggregated);
    const normalizedItems = period === 'year' ? aggregateYearItems(sorted) : sorted;
    return {
      ...base,
      period,
      items: normalizedItems
    };
  }

  return {
    getQuote: (params) => execute('quote', params),
    getMinute: (params) => execute('minute', params),
    getKline,
    getCapital: (params) => execute('capital', params),
    getCallauction: (params) => execute('callauction', params),
    getTradeDetail: (params) => execute('trade', params),
    getNews: (params) => execute('news', params),
    getAnnouncements: (params) => execute('announcements', params)
  };
}
