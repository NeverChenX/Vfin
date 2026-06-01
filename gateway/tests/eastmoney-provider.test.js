import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEastmoneyProvider } from '../src/providers/eastmoney-provider.js';
import { parseEastmoneyIntlIndex, parseEastmoneyHkQuote } from '../src/providers/live-mappers.js';

describe('eastmoney provider graceful fallbacks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns zero flows when live capital upstream fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));
    const provider = createEastmoneyProvider();

    const result = await provider.fetch('capital', {
      symbol: '600000.sh',
      market: 'sh',
      providerMode: 'live'
    });

    expect(result.flows).toEqual({
      main: 0,
      large: 0,
      medium: 0,
      small: 0
    });
  });

  it('returns empty records when live trade upstream fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));
    const provider = createEastmoneyProvider();

    const result = await provider.fetch('trade', {
      symbol: '600000.sh',
      market: 'sh',
      providerMode: 'live'
    });

    expect(result.records).toEqual([]);
  });
});

describe('parseEastmoneyIntlIndex', () => {
  it('parses DAX response (scale 100)', () => {
    const raw = { rc: 0, data: { f43: 2520592, f44: 2536164, f45: 2518050, f46: 2535975, f57: 'GDAXI', f58: '德国DAX30', f60: 2538910 } };
    const q = parseEastmoneyIntlIndex(raw, 100);
    expect(q.name).toBe('德国DAX30');
    expect(q.price).toBeCloseTo(25205.92, 2);
    expect(q.prevClose).toBeCloseTo(25389.10, 2);
    expect(q.high).toBeCloseTo(25361.64, 2);
    expect(q.low).toBeCloseTo(25180.50, 2);
    expect(q.open).toBeCloseTo(25359.75, 2);
  });

  it('throws on missing data', () => {
    expect(() => parseEastmoneyIntlIndex({ rc: 0, data: null }, 100)).toThrow();
  });
});

describe('parseEastmoneyHkQuote', () => {
  it('parses live HK payload using f59 as decimal scale (3 → /1000)', () => {
    const raw = {
      rc: 0,
      data: {
        f43: 28620, f44: 28720, f45: 28040, f46: 28040,
        f47: 29809211, f48: 846754880.0,
        f57: '01810', f58: '小米集团-W', f59: 3, f60: 28040,
        f86: 1780278003
      }
    };
    const q = parseEastmoneyHkQuote(raw);
    expect(q.code).toBe('01810');
    expect(q.name).toBe('小米集团-W');
    expect(q.price).toBeCloseTo(28.62, 2);
    expect(q.high).toBeCloseTo(28.72, 2);
    expect(q.low).toBeCloseTo(28.04, 2);
    expect(q.open).toBeCloseTo(28.04, 2);
    expect(q.prevClose).toBeCloseTo(28.04, 2);
    expect(q.volume).toBe(29809211);
    expect(q.turnover).toBeCloseTo(846754880, 0);
    expect(q.time.startsWith('2026-')).toBe(true);
  });

  it('parses HSI-style payload using f59=2 (/100)', () => {
    const raw = {
      rc: 0,
      data: {
        f43: 2539644, f44: 2539644, f45: 2517430, f46: 2518005,
        f57: 'HSI', f58: '恒生指数', f59: 2, f60: 2518239
      }
    };
    const q = parseEastmoneyHkQuote(raw);
    expect(q.price).toBeCloseTo(25396.44, 2);
    expect(q.prevClose).toBeCloseTo(25182.39, 2);
  });

  it('throws on empty data so registry falls back to tencent', () => {
    expect(() => parseEastmoneyHkQuote({ rc: 0, data: null })).toThrow();
  });

  it('throws when f43 is 0 (halted / unknown symbol)', () => {
    expect(() =>
      parseEastmoneyHkQuote({ rc: 0, data: { f43: 0, f57: '99999', f58: 'X' } })
    ).toThrow();
  });
});

describe('EastmoneyProvider.fetchQuote — HK branch', () => {
  it('returns live HK quote shape on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          rc: 0,
          data: {
            f43: 28620, f44: 28720, f45: 28040, f46: 28040,
            f47: 29809211, f48: 846754880.0,
            f57: '01810', f58: '小米集团-W', f59: 3, f60: 28040, f86: 1780278003
          }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    const provider = createEastmoneyProvider();
    const result = await provider.fetch('quote', {
      symbol: '01810.hk',
      market: 'hk',
      providerMode: 'live'
    });
    expect(result.market).toBe('hk');
    expect(result.name).toBe('小米集团-W');
    expect(result.now).toBeCloseTo(28.62, 2);
    expect(result.prevClose).toBeCloseTo(28.04, 2);
    expect(result.volume).toBe(29809211);
  });

  it('throws so registry falls back to tencent when upstream fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
    const provider = createEastmoneyProvider();
    await expect(
      provider.fetch('quote', { symbol: '01810.hk', market: 'hk', providerMode: 'live' })
    ).rejects.toThrow(/Eastmoney HK quote failed/);
  });

  it('routes HK index (HSI) via 100. prefix not 116.00HSI', async () => {
    let capturedUrl = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      capturedUrl = String(url);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            rc: 0,
            data: {
              f43: 2537648, f44: 2540000, f45: 2515000, f46: 2520000,
              f57: 'HSI', f58: '恒生指数', f59: 2, f60: 2518239
            }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
    });
    const provider = createEastmoneyProvider();
    const result = await provider.fetch('quote', {
      symbol: 'HSI.hk',
      market: 'hk',
      providerMode: 'live'
    });
    expect(capturedUrl).toContain('secid=100.HSI');
    expect(capturedUrl).not.toContain('116.');
    expect(result.now).toBeCloseTo(25376.48, 2);
    expect(result.name).toBe('恒生指数');
  });
});
