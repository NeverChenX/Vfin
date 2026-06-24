import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCryptoProvider } from '../src/providers/crypto-provider.js';

describe('crypto provider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns BTC quote only when Binance and CoinGecko agree', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        lastPrice: '100000.00',
        openPrice: '99000.00',
        highPrice: '101000.00',
        lowPrice: '98000.00',
        volume: '123.45',
        quoteVolume: '12345000.00',
        closeTime: 1782000000000,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        bitcoin: {
          usd: 100050,
          usd_24h_change: 1.2,
          usd_24h_vol: 12000000,
        },
      }), { status: 200 }));

    const provider = createCryptoProvider();
    const quote = await provider.fetch('quote', {
      symbol: 'BTCUSD.crypto',
      market: 'crypto',
      providerMode: 'live',
    });

    expect(quote).toMatchObject({
      symbol: 'BTCUSD.crypto',
      market: 'crypto',
      name: '比特币',
      now: 100000,
      prevClose: 99000,
      high: 101000,
      low: 98000,
      volume: 123.45,
      turnover: 12345000,
      validationStatus: 'verified',
      validationSources: ['Binance 24hr ticker', 'CoinGecko simple price'],
    });
  });

  it('returns degraded single-source BTC quote when secondary sources are unavailable', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        lastPrice: '100000.00',
        openPrice: '99000.00',
        highPrice: '101000.00',
        lowPrice: '98000.00',
        volume: '123.45',
        quoteVolume: '12345000.00',
        closeTime: 1782000000000,
      }), { status: 200 }))
      .mockRejectedValueOnce(new Error('coingecko down'))
      .mockRejectedValueOnce(new Error('okx down'))
      .mockRejectedValueOnce(new Error('coinbase down'));

    const provider = createCryptoProvider();
    const quote = await provider.fetch('quote', {
      symbol: 'BTCUSD.crypto',
      market: 'crypto',
      providerMode: 'live',
    });

    expect(quote).toMatchObject({
      now: 100000,
      validationStatus: 'degraded_single_source',
      validationSources: ['Binance 24hr ticker'],
    });
  });

  it('returns degraded BTC quote from a secondary structured source when Binance is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('binance timeout'))
      .mockRejectedValueOnce(new Error('coingecko timeout'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ last: '100100.00', high24h: '101000.00', low24h: '98000.00', vol24h: '123.45', volCcy24h: '12357345.00', ts: '1782000000000' }],
      }), { status: 200 }))
      .mockRejectedValueOnce(new Error('coinbase timeout'));

    const provider = createCryptoProvider();
    const quote = await provider.fetch('quote', {
      symbol: 'BTCUSD.crypto',
      market: 'crypto',
      providerMode: 'live',
    });

    expect(quote).toMatchObject({
      now: 100100,
      high: 101000,
      low: 98000,
      volume: 123.45,
      turnover: 12357345,
      validationStatus: 'degraded_single_source',
      validationSources: ['OKX BTC-USDT ticker'],
    });
  });

  it('throws when available crypto sources disagree', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        lastPrice: '100000.00',
        openPrice: '99000.00',
        highPrice: '101000.00',
        lowPrice: '98000.00',
        volume: '123.45',
        quoteVolume: '12345000.00',
        closeTime: 1782000000000,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ bitcoin: { usd: 90000 } }), { status: 200 }));

    const provider = createCryptoProvider();

    await expect(provider.fetch('quote', {
      symbol: 'BTCUSD.crypto',
      market: 'crypto',
      providerMode: 'live',
    })).rejects.toThrow(/crypto sources disagree/i);
  });

  it('returns Binance daily klines for BTC sparkline', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([
        [1781827200000, '62958.01', '63666.00', '62316.44', '63543.91', '14247.424', 1781913599999, '896102952.77'],
        [1781913600000, '63543.90', '64388.00', '63184.21', '64298.01', '9522.103', 1781999999999, '607077211.75'],
      ]), { status: 200 }));

    const provider = createCryptoProvider();
    const kline = await provider.fetch('kline', {
      symbol: 'BTCUSD.crypto',
      market: 'crypto',
      providerMode: 'live',
      period: 'day',
      count: 2,
    });

    expect(kline).toMatchObject({
      code: 'BTCUSD.crypto',
      market: 'crypto',
      cycle: 'day',
    });
    expect(kline.list[0]).toEqual({
      date: '2026-06-19',
      open: 62958.01,
      high: 63666,
      low: 62316.44,
      close: 63543.91,
      volume: 14247.424,
      amount: 896102952.77,
    });
    expect(kline.list).toHaveLength(2);
  });
});
