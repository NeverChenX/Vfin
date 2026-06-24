import { BaseProvider } from './base-provider.js';
import { fetchJson } from './http-client.js';
import { createTimestamp } from '../utils/time.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const YAHOO_CHART_SYMBOLS = {
  'IXIC.us': '^IXIC',
  'N225.jp': '^N225',
  'XAU.cm': 'GC=F',
};

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function dateFromUnixSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return new Date(n * 1000).toISOString().slice(0, 10);
}

function parseYahooChart(json) {
  const result = json?.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};

  return timestamps.map((timestamp, index) => ({
    date: dateFromUnixSeconds(timestamp),
    open: num(quote.open?.[index]),
    high: num(quote.high?.[index]),
    low: num(quote.low?.[index]),
    close: num(quote.close?.[index]),
    volume: num(quote.volume?.[index]),
    amount: 0,
  })).filter((item) => item.date && item.close > 0);
}

async function fetchJsonResilient(url, options = {}) {
  try {
    return await fetchJson(url, options);
  } catch (fetchError) {
    if (process.env.NODE_ENV === 'test') throw fetchError;
    const maxTimeSeconds = Math.max(1, Math.ceil((options.timeoutMs ?? 8_000) / 1000));
    const args = ['-sS', '-L', '--max-time', String(maxTimeSeconds)];
    for (const [key, value] of Object.entries(options.headers ?? {})) {
      args.push('-H', `${key}: ${value}`);
    }
    args.push(url);
    try {
      const { stdout } = await execFileAsync('curl', args, {
        timeout: maxTimeSeconds * 1000 + 1000,
        maxBuffer: 1024 * 1024,
      });
      return JSON.parse(stdout);
    } catch (curlError) {
      throw fetchError ?? curlError;
    }
  }
}

export class YahooProvider extends BaseProvider {
  constructor() {
    super({ name: 'yahoo' });
  }

  async fetchKline(context) {
    this.ensureMockableMode(context.providerMode, 'kline');

    const yahooSymbol = YAHOO_CHART_SYMBOLS[context.symbol];
    if (!yahooSymbol) {
      throw this.createError(`Yahoo kline: unsupported symbol "${context.symbol}"`, {
        statusCode: 502,
        code: 'UNSUPPORTED_PROVIDER_OPERATION',
      });
    }

    if (context.providerMode !== 'live') {
      return {
        code: context.symbol,
        market: context.market,
        cycle: context.period ?? 'day',
        list: [
          { date: '2026-06-18', open: 100, high: 102, low: 99, close: 101, volume: 1000, amount: 0 },
          { date: '2026-06-19', open: 101, high: 103, low: 100, close: 102, volume: 1100, amount: 0 },
        ],
        time: createTimestamp(),
      };
    }

    const count = Number(context.count ?? 30);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=2y&interval=1d`;
    try {
      const json = await fetchJsonResilient(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeoutMs: 10_000,
      });
      const list = parseYahooChart(json).slice(-count);
      if (list.length === 0) {
        throw new Error('empty Yahoo chart payload');
      }
      return {
        code: context.symbol,
        market: context.market,
        cycle: context.period ?? 'day',
        list,
        time: createTimestamp(),
      };
    } catch (error) {
      throw this.createError(`Yahoo kline failed: ${error.message}`, { cause: error });
    }
  }
}

export function createYahooProvider() {
  return new YahooProvider();
}
