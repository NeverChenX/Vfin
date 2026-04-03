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
