import iconv from 'iconv-lite';
import { BaseProvider } from './base-provider.js';
import { fetchText } from './http-client.js';
import { parseSinaQuote, parseSinaUSKline } from './live-mappers.js';
import { createTimestamp } from '../utils/time.js';

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
      // 新浪支持美股日线K线
      if (context.market === 'us') {
        return this._fetchUSKline(context);
      }
      throw this.createError('Sina kline not supported', { statusCode: 502, code: 'UNSUPPORTED_PROVIDER_OPERATION' });
    }

    return {
      symbol: context.symbol,
      market: context.market,
      period: context.period ?? 'day',
      list: [
        { date: '2026-04-01', open: 12, high: 12.5, low: 11.9, close: 12.2, volume: 110000, amount: 1342000 },
        { date: '2026-04-02', open: 12.2, high: 12.4, low: 12.1, close: 12.28, volume: 98000, amount: 1204800 },
        { date: '2026-04-03', open: 12.28, high: 12.6, low: 12.18, close: 12.34, volume: 123456, amount: 1523456 }
      ],
      timestamp: createTimestamp()
    };
  }

  async _fetchUSKline(context) {
    const code = context.symbol?.includes('.') ? context.symbol.split('.')[0] : context.symbol;
    const count = Number(context.count ?? 200);
    const url = `https://stock.finance.sina.com.cn/usstock/api/json_v2.php/US_MinKService.getDailyK?symbol=${code}&type=daily`;
    try {
      const text = await fetchText(url, {
        headers: {
          Referer: 'https://finance.sina.com.cn',
          'User-Agent': 'Mozilla/5.0'
        }
      });
      const items = JSON.parse(text);
      const parsed = parseSinaUSKline(items);
      // 只返回最近 count 条数据
      const list = parsed.list.length > count ? parsed.list.slice(-count) : parsed.list;
      return {
        code: context.symbol,
        market: context.market,
        cycle: context.period ?? 'day',
        list,
        time: createTimestamp()
      };
    } catch (error) {
      throw this.createError(`Sina US kline failed: ${error.message}`, { cause: error });
    }
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

export function createSinaProvider() {
  return new SinaProvider();
}
