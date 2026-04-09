import { BaseProvider } from './base-provider.js';
import { fetchJson, fetchText } from './http-client.js';
import { parseTencentQuote, parseTencentMinute, parseTencentKline, parseTencentMinuteToKline, parseTencentMultiDayMinuteToKline } from './live-mappers.js';
import iconv from 'iconv-lite';
import { createTimestamp } from '../utils/time.js';

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
          prevClose: data.prevClose,
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
          time: createTimestamp()
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
        const isMinutePeriod = /^m\d+$/.test(period.queryPeriod);
        // 分钟K线：腾讯API最大限制约800条
        // 1分钟约4天, 5分钟约17天, 15分钟约50天, 30分钟约100天
        const defaultCount = isMinutePeriod ? 800 : 200;
        const count = Number(context.count ?? defaultCount);
        const offset = Number(context.offset ?? 0);

        if (isMinutePeriod) {
          // 腾讯API限制：
          // 1. offset参数无效，无法分页
          // 2. count>800时会返回更少数据（约320条）
          // 3. 最大有效count为800，可获取约800条数据
          const maxCount = Math.min(count, 800);
          const mklineUrl = `https://ifzq.gtimg.cn/appstock/app/kline/mkline?param=${code},${period.queryPeriod},,${maxCount},${offset}`;
          const mklineJson = await fetchJson(mklineUrl);
          const mklineData = mklineJson?.data?.[code] ?? {};

          // 腾讯API正常返回
          if (mklineJson?.code === 0) {
            const parsed = parseTencentKline(mklineData, period.responsePeriod);
            return {
              code: context.symbol,
              market: context.market,
              cycle: period.normalizedPeriod,
              list: parsed.list,
              time: createTimestamp()
            };
          }

          // mkline not supported for this market (港股/美股) — fall back to 5-day minute data
          // day/query?p=5 returns 5 days of 1-minute data, which we aggregate into N-minute bars
          const dayUrl = `https://web.ifzq.gtimg.cn/appstock/app/day/query?code=${code}&p=5`;
          const dayJson = await fetchJson(dayUrl);
          const dayData = dayJson?.data?.[code]?.data ?? {};

          if (Object.keys(dayData).length > 0) {
            const parsed = parseTencentMultiDayMinuteToKline(dayData, period.normalizedPeriod);
            return {
              code: context.symbol,
              market: context.market,
              cycle: period.normalizedPeriod,
              list: parsed.list,
              time: createTimestamp()
            };
          }

          // Final fallback: today-only minute data (美股可能连5日分时也没有)
          const minuteUrl = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${code}`;
          const minuteJson = await fetchJson(minuteUrl);
          const minuteRaw = minuteJson?.data?.[code]?.data ?? {};
          const parsed = parseTencentMinuteToKline(minuteRaw, period.normalizedPeriod);

          // 美股分钟线腾讯不支持：只能拿到1条收盘价（休市占位符），触发 fallback 让其他 provider 尝试
          if (parsed.list.length <= 1 && context.market === 'us') {
            throw this.createError(
              `Tencent minute kline has no intraday data for US stock ${context.symbol}`,
              { statusCode: 502, code: 'INSUFFICIENT_DATA' }
            );
          }

          return {
            code: context.symbol,
            market: context.market,
            cycle: period.normalizedPeriod,
            list: parsed.list,
            time: createTimestamp()
          };
        }

        const url = `https://web.ifzq.gtimg.cn/appstock/app/kline/kline?param=${code},${period.queryPeriod},,,${count},${offset}`;
        const json = await fetchJson(url);
        const data = json?.data?.[code] ?? {};
        const parsed = parseTencentKline(data, period.responsePeriod);

        // 腾讯API对美股只返回极少数据（如IPO点+最新点），数据不可用
        // 仅对1-3条的"稀疏数据"触发fallback，0条可能是临时网络问题，走正常错误路径
        if (parsed.list.length >= 1 && parsed.list.length <= 3 && count > 10 && context.market === 'us') {
          throw this.createError(
            `Tencent kline returned only ${parsed.list.length} bars for ${context.symbol} (expected ~${count})`,
            { statusCode: 502, code: 'INSUFFICIENT_DATA' }
          );
        }

        return {
          code: context.symbol,
          market: context.market,
          cycle: period.normalizedPeriod,
          list: parsed.list,
          time: createTimestamp()
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
