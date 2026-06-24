import { describe, expect, it, vi } from 'vitest';
import { addSymbolToWatchlist } from './watchlist-client';

describe('addSymbolToWatchlist', () => {
  it('posts the selected symbol to the watchlist endpoint', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      item: { symbol: '600519.sh' },
    }), { status: 200 }));

    const result = await addSymbolToWatchlist('600519.sh', fetcher);

    expect(fetcher).toHaveBeenCalledWith('/api/hq/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: '600519.sh' }),
    });
    expect(result.item?.symbol).toBe('600519.sh');
  });

  it('throws the upstream error message when adding fails', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'invalid symbol',
    }), { status: 400 }));

    await expect(addSymbolToWatchlist('bad', fetcher)).rejects.toThrow('invalid symbol');
  });
});
