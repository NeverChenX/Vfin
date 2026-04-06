import { BaseProvider } from './base-provider.js';
import { fetchJson, fetchText } from './http-client.js';
import { parseTencentQuote, parseTencentMinute, parseTencentKline } from './live-mappers.js';
import iconv from 'iconv-lite';

function createTimestamp() {
  return new Date().toISOString();
}

function buildTencentSymbol({ market, symbol }) {
  if (symbol?.includes('.')) {
    const [code] = symbol.split('.');
    return `${market}${code}`;
  }
  return symbol;
}

function resolveTencentPeriod(period) {
  if (!period) {
    return { queryPeriod: 'day', responsePeriod: 'day', normalizedPeriod: 'day' };
  }

  if (['day', 'week', 'month', 'year'].includes(period)) {
    return { queryPeriod: period, responsePeriod: period, normalizedPeriod: period };
  }

  if (period === '1m') return { queryPeriod: 'm1', responsePeriod: 'm1', normalizedPeriod: '1m' };
  if (period === '5m') return { queryPeriod: 'm5', responsePeriod: 'm5', normalizedPeriod: '5m' };
  if (period === '15m') return { queryPeriod: 'm15', responsePeriod: 'm15', normalizedPeriod: '15m' };
  if (period === '30m') return { queryPeriod: 'm30', responsePeriod: 'm30', normalizedPeriod: '30m' };

  return { queryPeriod: 'day', responsePeriod: 'day', normalizedPeriod: 'day' };
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
        const buffer = await fetchText(url, {
          headers: {
            Referer: 'https://finance.qq.com/',
            'User-Agent': 'Mozilla/5.0'
          },
          responseType: 'arrayBuffer'
        });
        const text = iconv.decode(Buffer.from(buffer), 'gbk');
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
        const count = Number(context.count ?? 200);
        const offset = Number(context.offset ?? 0);
        const isMinutePeriod = /^m\d+$/.test(period.queryPeriod);
        const url = isMinutePeriod
          ? `https://ifzq.gtimg.cn/appstock/app/kline/mkline?param=${code},${period.queryPeriod},,${count},${offset}`
          : `https://web.ifzq.gtimg.cn/appstock/app/kline/kline?param=${code},${period.queryPeriod},,,${count},${offset}`;
        const json = await fetchJson(url);
        const data = json?.data?.[code] ?? {};
        const parsed = parseTencentKline(data, period.responsePeriod);
        return {
          code: context.symbol,
          market: context.market,
          cycle: period.normalizedPeriod,
          list: parsed.list,
          time: new Date().toISOString()
        };
      } catch (error) {
        throw this.createError(`Tencent kline failed: ${error.message}`, { cause: error });
      }
    }

    return {
      code: context.symbol,
      market: context.market,
      cycle: resolveTencentPeriod(context.period).normalizedPeriod,
      list: [
        { date: '2026-04-01', time: '09:30', open: 12, high: 12.5, low: 11.9, close: 12.2, volume: 110000, amount: 1342000 },
        { date: '2026-04-02', time: '09:31', open: 12.2, high: 12.4, low: 12.1, close: 12.28, volume: 98000, amount: 1204800 },
        { date: '2026-04-03', time: '09:32', open: 12.28, high: 12.6, low: 12.18, close: 12.34, volume: 123456, amount: 1523456 }
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

export function createTencentProvider() {
  return new TencentProvider();
}
