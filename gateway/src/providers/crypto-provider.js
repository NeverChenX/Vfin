import { BaseProvider } from './base-provider.js';
import { fetchJson } from './http-client.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function assertBtcUsd(symbol) {
  if (symbol !== 'BTCUSD.crypto') {
    const err = new Error(`Crypto quote: unsupported symbol "${symbol}"`);
    err.statusCode = 502;
    err.code = 'UNSUPPORTED_PROVIDER_OPERATION';
    throw err;
  }
}

function pricesAgree(a, b) {
  if (!a || !b) return false;
  return Math.abs(a - b) / Math.max(a, b) <= 0.01;
}

function dateFromMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return new Date(n).toISOString().slice(0, 10);
}

function parseBinanceKlines(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    date: dateFromMs(row?.[0]),
    open: num(row?.[1]),
    high: num(row?.[2]),
    low: num(row?.[3]),
    close: num(row?.[4]),
    volume: num(row?.[5]),
    amount: num(row?.[7]),
  })).filter((item) => item.date && item.close !== null && item.close > 0);
}

const QUOTE_TIMEOUT_MS = 4_000;

const QUOTE_SOURCES = [
  {
    source: 'Binance 24hr ticker',
    url: 'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT',
    read: (json) => {
      const price = num(json?.lastPrice);
      if (price === null) return null;
      return {
        price,
        prevClose: num(json?.openPrice),
        open: num(json?.openPrice),
        high: num(json?.highPrice),
        low: num(json?.lowPrice),
        volume: num(json?.volume),
        turnover: num(json?.quoteVolume),
        timestampMs: num(json?.closeTime),
      };
    },
  },
  {
    source: 'CoinGecko simple price',
    url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true',
    read: (json) => {
      const price = num(json?.bitcoin?.usd);
      if (price === null) return null;
      return {
        price,
        volume: null,
        turnover: num(json?.bitcoin?.usd_24h_vol),
      };
    },
  },
  {
    source: 'OKX BTC-USDT ticker',
    url: 'https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT',
    read: (json) => {
      const row = json?.data?.[0];
      const price = num(row?.last);
      if (price === null) return null;
      return {
        price,
        open: num(row?.open24h),
        high: num(row?.high24h),
        low: num(row?.low24h),
        volume: num(row?.vol24h),
        turnover: num(row?.volCcy24h),
        timestampMs: num(row?.ts),
      };
    },
  },
  {
    source: 'Coinbase BTC-USD stats',
    url: 'https://api.exchange.coinbase.com/products/BTC-USD/stats',
    options: { headers: { 'User-Agent': 'VFin/1.0' } },
    read: (json) => {
      const price = num(json?.last);
      if (price === null) return null;
      return {
        price,
        open: num(json?.open),
        high: num(json?.high),
        low: num(json?.low),
        volume: num(json?.volume),
      };
    },
  },
];

async function fetchQuoteSource(attempt) {
  const json = await fetchJsonResilient(attempt.url, {
    ...(attempt.options ?? {}),
    timeoutMs: QUOTE_TIMEOUT_MS,
    disableCurlFallback: true,
  });
  const parsed = attempt.read(json);
  return parsed ? { source: attempt.source, ...parsed } : null;
}

function findAgreeingPair(quotes) {
  for (let i = 0; i < quotes.length; i += 1) {
    for (let j = i + 1; j < quotes.length; j += 1) {
      if (pricesAgree(quotes[i].price, quotes[j].price)) {
        return [quotes[i], quotes[j]];
      }
    }
  }
  return null;
}

async function fetchJsonResilient(url, options = {}) {
  try {
    return await fetchJson(url, options);
  } catch (fetchError) {
    if (options.disableCurlFallback) throw fetchError;
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

export class CryptoProvider extends BaseProvider {
  constructor() {
    super({ name: 'crypto' });
  }

  async fetchQuote(context) {
    this.ensureMockableMode(context.providerMode, 'quote');
    assertBtcUsd(context.symbol);

    if (context.providerMode !== 'live') {
      return {
        symbol: 'BTCUSD.crypto',
        market: 'crypto',
        name: '比特币',
        now: 100000,
        prevClose: 99000,
        open: 99000,
        high: 101000,
        low: 98000,
        volume: 123.45,
        turnover: 12345000,
        timestamp: new Date().toISOString(),
        validationStatus: 'verified',
        validationSources: ['Binance 24hr ticker', 'CoinGecko simple price'],
      };
    }

    const results = await Promise.allSettled(QUOTE_SOURCES.map(fetchQuoteSource));
    const quotes = results
      .map((result) => result.status === 'fulfilled' ? result.value : null)
      .filter(Boolean);

    if (quotes.length === 0) {
      throw this.createError('Crypto quote: no structured source returned BTC price');
    }

    const pair = findAgreeingPair(quotes);
    if (!pair && quotes.length > 1) {
      throw this.createError('Crypto sources disagree for BTCUSD.crypto');
    }

    const selected = pair?.[0] ?? quotes[0];
    const closeTime = selected.timestampMs;
    return {
      symbol: 'BTCUSD.crypto',
      market: 'crypto',
      name: '比特币',
      now: selected.price,
      prevClose: selected.prevClose ?? selected.open ?? null,
      open: selected.open ?? selected.prevClose ?? null,
      high: selected.high ?? null,
      low: selected.low ?? null,
      volume: selected.volume ?? null,
      turnover: selected.turnover ?? null,
      timestamp: closeTime ? new Date(closeTime).toISOString() : new Date().toISOString(),
      validationStatus: pair ? 'verified' : 'degraded_single_source',
      validationSources: pair ? [pair[0].source, pair[1].source] : [selected.source],
    };
  }

  async fetchKline(context) {
    this.ensureMockableMode(context.providerMode, 'kline');
    assertBtcUsd(context.symbol);

    if ((context.period ?? 'day') !== 'day') {
      throw this.createError('Crypto kline: only daily period is supported', {
        statusCode: 502,
        code: 'UNSUPPORTED_PROVIDER_OPERATION',
      });
    }

    if (context.providerMode !== 'live') {
      return {
        code: 'BTCUSD.crypto',
        market: 'crypto',
        cycle: 'day',
        list: [
          { date: '2026-06-19', open: 62958.01, high: 63666, low: 62316.44, close: 63543.91, volume: 14247.424, amount: 896102952.77 },
          { date: '2026-06-20', open: 63543.9, high: 64388, low: 63184.21, close: 64298.01, volume: 9522.103, amount: 607077211.75 },
        ],
        time: new Date().toISOString(),
      };
    }

    const count = Math.max(2, Math.min(Number(context.count ?? 30), 1000));
    const rows = await fetchJsonResilient(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=${count}`, {
      timeoutMs: 15_000,
    });
    const list = parseBinanceKlines(rows);
    if (list.length === 0) {
      throw this.createError('Crypto kline: empty Binance kline payload');
    }
    return {
      code: 'BTCUSD.crypto',
      market: 'crypto',
      cycle: 'day',
      list,
      time: new Date().toISOString(),
    };
  }
}

export function createCryptoProvider() {
  return new CryptoProvider();
}
