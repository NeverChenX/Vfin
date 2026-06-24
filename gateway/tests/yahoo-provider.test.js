import { afterEach, describe, expect, it, vi } from 'vitest';
import { createYahooProvider } from '../src/providers/yahoo-provider.js';

describe('yahoo provider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns daily klines for Nasdaq, Nikkei, and gold sparkline symbols', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify({
        chart: {
          result: [{
            timestamp: [1781827200, 1781913600],
            indicators: {
              quote: [{
                open: [26493.82, 26410.62],
                high: [26511.55, 26559.74],
                low: [25960.41, 26188.69],
                close: [26021.66, 26517.93],
                volume: [10605787392, 17780101888],
              }],
            },
          }],
        },
      }), { status: 200 }));

    const provider = createYahooProvider();

    for (const context of [
      { symbol: 'IXIC.us', market: 'us' },
      { symbol: 'N225.jp', market: 'jp' },
      { symbol: 'XAU.cm', market: 'cm' },
    ]) {
      const kline = await provider.fetch('kline', {
        ...context,
        providerMode: 'live',
        period: 'day',
        count: 2,
      });

      expect(kline).toMatchObject({
        code: context.symbol,
        market: context.market,
        cycle: 'day',
      });
      expect(kline.list[0]).toMatchObject({
        date: '2026-06-19',
        open: 26493.82,
        high: 26511.55,
        low: 25960.41,
        close: 26021.66,
        volume: 10605787392,
      });
      expect(kline.list).toHaveLength(2);
    }

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('range=2y'),
      expect.any(Object),
    );
  });
});
