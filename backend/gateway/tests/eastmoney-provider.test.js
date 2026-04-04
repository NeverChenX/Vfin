import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEastmoneyProvider } from '../src/providers/eastmoney-provider.js';

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
