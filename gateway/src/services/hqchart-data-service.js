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
const KLINE_HISTORY_TTL_MS = 30 * 60_000;
const KLINE_TAIL_REFRESH_COUNT = 10;

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

  // Quote routing: Eastmoney is the intended live source for HK quotes
  // (Tencent's free HK feed is delayed) and for European indices wired in
  // eastmoney-provider. Other markets keep the default provider chain.
  let provider = params.provider;
  if (!provider && operation === 'quote' && ['hk', 'de', 'uk'].includes(market)) {
    provider = 'eastmoney';
  }
  if (!provider && operation === 'quote' && market === 'crypto') {
    provider = 'crypto';
  }
  if (!provider && operation === 'kline' && market === 'crypto') {
    provider = 'crypto';
  }
  if (!provider && operation === 'kline' && ['IXIC.us', 'N225.jp', 'XAU.cm'].includes(symbol)) {
    provider = 'yahoo';
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

function mergeKlineItemsBySlot(historyItems, latestItems, limit) {
  const bySlot = new Map();
  for (const item of [...(historyItems ?? []), ...(latestItems ?? [])]) {
    const key = `${item.date ?? ''} ${item.time ?? ''}`.trim();
    if (!key) continue;
    bySlot.set(key, item);
  }
  const merged = sortKlineItems([...bySlot.values()]);
  return Number.isFinite(limit) && limit > 0 ? merged.slice(-limit) : merged;
}

function isLongDailyKlineRequest(params) {
  return (params.period ?? 'day') === 'day' && Number(params.count ?? 0) >= 120;
}

function createKlineHistoryCacheKey(context) {
  return JSON.stringify({
    operation: 'kline-history',
    context: sortObjectEntries({
      symbol: context.symbol,
      market: context.market,
      provider: context.provider,
      providerMode: context.providerMode,
      period: context.period ?? 'day',
    }),
  });
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

function stockCode(symbol) {
  return String(symbol ?? '').split('.')[0];
}

function isConvertibleBondCode(code) {
  return /^(110|113|123|127|128)\d{3}$/.test(code);
}

function isStockForMarketMultiples(context) {
  const code = stockCode(context.symbol);
  if (['sh', 'sz'].includes(context.market)) {
    return /^\d{6}$/.test(code) && !isConvertibleBondCode(code);
  }
  if (context.market === 'hk') {
    return /^\d{5}$/.test(code);
  }
  if (context.market === 'us') {
    return /^[A-Z]{1,5}(\.[A-Z]{1,3})?$/.test(code);
  }
  return false;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function multiplesAgree(left, right) {
  const leftPe = nullableNumber(left?.peTtm);
  const rightPe = nullableNumber(right?.peTtm);
  const leftPb = nullableNumber(left?.pb);
  const rightPb = nullableNumber(right?.pb);
  if (leftPe === null || rightPe === null || leftPb === null || rightPb === null) return false;
  return Math.abs(leftPe - rightPe) <= 0.02 && Math.abs(leftPb - rightPb) <= 0.02;
}

function hasMarketMultiples(quote) {
  return nullableNumber(quote?.peTtm) !== null && nullableNumber(quote?.pb) !== null;
}

export function createHqchartDataService({
  providerRegistry = createProviderRegistry(),
  cacheService = createCacheService(),
  resilienceService = createResilienceService(),
  normalizer = createHqchartNormalizer(),
  cacheTtlMs, // 兼容旧参数；优先用 ttlForOperation
  providerMode = 'live'
} = {}) {
  const backgroundKlineRefreshes = new Set();

  async function fetchProviderQuoteForMultiples(context, provider) {
    const result = await providerRegistry.execute('quote', { ...context, provider });
    return normalizer.normalizeQuote(result.data, { ...context, provider: result.provider });
  }

  async function enrichMarketMultiples(payload, context) {
    if (!isStockForMarketMultiples(context)) return payload;
    const sourceNames = ['tencent', 'eastmoney'];
    try {
      const results = await Promise.allSettled(
        sourceNames.map((provider) => fetchProviderQuoteForMultiples(context, provider))
      );
      const quotes = results
        .map((result, index) => result.status === 'fulfilled' ? { provider: sourceNames[index], quote: result.value } : null)
        .filter(Boolean);
      const tencent = quotes.find((item) => item.provider === 'tencent')?.quote;
      const eastmoney = quotes.find((item) => item.provider === 'eastmoney')?.quote;

      if (multiplesAgree(tencent, eastmoney)) {
        return {
          ...payload,
          peTtm: nullableNumber(tencent.peTtm),
          pb: nullableNumber(tencent.pb),
          marketMultiplesValidationStatus: 'verified',
          marketMultiplesSources: ['tencent', 'eastmoney'],
        };
      }

      const single = quotes.find((item) => hasMarketMultiples(item.quote));
      if (single) {
        return {
          ...payload,
          peTtm: nullableNumber(single.quote.peTtm),
          pb: nullableNumber(single.quote.pb),
          marketMultiplesValidationStatus: 'degraded_single_source',
          marketMultiplesSources: [single.provider],
        };
      }

      return {
        ...payload,
        peTtm: null,
        pb: null,
        marketMultiplesValidationStatus: 'unavailable',
        marketMultiplesSources: ['tencent', 'eastmoney'],
      };
    } catch {
      return {
        ...payload,
        peTtm: null,
        pb: null,
        marketMultiplesValidationStatus: 'unavailable',
        marketMultiplesSources: ['tencent', 'eastmoney'],
      };
    }
  }

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
        const payload = normalizer[methodName](result.data, {
          ...context,
          provider: result.provider
        });
        return operation === 'quote' ? enrichMarketMultiples(payload, context) : payload;
      },
      { ttlMs }
    );
  }

  async function getIncrementalDailyKline(params) {
    const context = createExecutionContext(params, providerMode, 'kline');
    const historyKey = createKlineHistoryCacheKey(context);
    const count = Number(params.count ?? 0);
    const ttlMs = cacheTtlMs ?? KLINE_HISTORY_TTL_MS;
    const staleHistory = cacheService.getStale?.(historyKey);
    const freshHistory = cacheService.get?.(historyKey);
    if (freshHistory && Array.isArray(freshHistory.items) && freshHistory.items.length > 0) {
      return {
        ...freshHistory,
        items: freshHistory.items.slice(-count),
      };
    }

    const historyItems = Array.isArray(staleHistory?.items) ? staleHistory.items : [];

    if (historyItems.length > 0) {
      if (!backgroundKlineRefreshes.has(historyKey)) {
        backgroundKlineRefreshes.add(historyKey);
        execute('kline', {
          ...params,
          count: Math.min(KLINE_TAIL_REFRESH_COUNT, count),
          offset: undefined,
          allHistory: undefined,
        })
          .then((latest) => {
            const mergedItems = mergeKlineItemsBySlot(historyItems, latest.items ?? [], count);
            const merged = {
              ...latest,
              period: params.period ?? 'day',
              items: mergedItems,
            };
            cacheService.set?.(historyKey, merged, ttlMs);
          })
          .catch(() => {
            // Keep stale history visible; freshness is retried on the next request.
          })
          .finally(() => {
            backgroundKlineRefreshes.delete(historyKey);
          });
      }
      return {
        ...staleHistory,
        items: historyItems.slice(-count),
      };
    }

    const full = await execute('kline', params);
    if (Array.isArray(full.items) && full.items.length > 0) {
      cacheService.set?.(historyKey, full, ttlMs);
    }
    return full;
  }

  async function getKline(params = {}) {
    const period = params.period ?? 'day';
    const allHistory = toBoolean(params.allHistory);
    if (!allHistory && isLongDailyKlineRequest(params)) {
      return getIncrementalDailyKline(params);
    }
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
