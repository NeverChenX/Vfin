import { describe, expect, it } from 'vitest';
import { CORE_MARKET_INDICES, MARKET_INDEX_SPARKLINE } from './MarketIndexCards';

describe('CORE_MARKET_INDICES', () => {
  it('includes Bitcoin on the home index cards', () => {
    expect(CORE_MARKET_INDICES).toContainEqual(
      expect.objectContaining({
        symbol: 'BTCUSD.crypto',
        label: '比特币',
        marketBadge: 'BTC',
        forceLabel: true,
      }),
    );
  });

  it('places gold immediately after Bitcoin on the home index cards', () => {
    const btcIndex = CORE_MARKET_INDICES.findIndex((item) => item.symbol === 'BTCUSD.crypto');
    expect(CORE_MARKET_INDICES[btcIndex + 1]).toEqual(
      expect.objectContaining({
        symbol: 'XAU.cm',
        label: '黄金',
        marketBadge: 'XAU',
        forceLabel: true,
      }),
    );
  });

  it('includes a Japanese index on the home index cards', () => {
    expect(CORE_MARKET_INDICES).toContainEqual(
      expect.objectContaining({
        symbol: 'N225.jp',
        label: '日经指数',
        marketBadge: 'JP',
        forceLabel: true,
      }),
    );
  });

  it('uses two-year, wider, compact sparklines on home index cards', () => {
    expect(MARKET_INDEX_SPARKLINE).toEqual({
      count: 500,
      width: 150,
      height: 24,
    });
  });

  it('uses calendar two-year sparkline data for Bitcoin', () => {
    expect(CORE_MARKET_INDICES.find((item) => item.symbol === 'BTCUSD.crypto')).toEqual(
      expect.objectContaining({
        sparklineCount: 730,
      }),
    );
  });
});
