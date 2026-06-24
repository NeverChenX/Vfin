import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCacheService } from '../src/services/cache-service.js';

const tempDirs = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vfin-cache-'));
  tempDirs.push(dir);
  return dir;
}

describe('cache service', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('persists fresh entries to disk and restores them across service instances', async () => {
    let now = 1000;
    const persistDir = tempDir();
    const first = createCacheService({ now: () => now, persistDir });

    await first.getOrSet('kline:BTCUSD.crypto:730', async () => ({ items: [1, 2, 3] }), { ttlMs: 60_000 });

    const second = createCacheService({ now: () => now + 1, persistDir });
    const value = await second.getOrSet(
      'kline:BTCUSD.crypto:730',
      async () => {
        throw new Error('should not reload fresh cache');
      },
      { ttlMs: 60_000 },
    );

    expect(value).toEqual({ items: [1, 2, 3] });
  });

  it('tries latest data after expiry and falls back to stale disk cache only when refresh fails', async () => {
    let now = 1000;
    const persistDir = tempDir();
    const cache = createCacheService({ now: () => now, persistDir });

    await cache.getOrSet('kline:XAU.cm:500', async () => ({ version: 'old' }), { ttlMs: 100 });
    now = 2000;

    const refreshed = await cache.getOrSet('kline:XAU.cm:500', async () => ({ version: 'latest' }), { ttlMs: 100 });
    expect(refreshed).toEqual({ version: 'latest' });

    now = 3000;
    const staleFallback = await cache.getOrSet(
      'kline:XAU.cm:500',
      async () => {
        throw new Error('upstream down');
      },
      { ttlMs: 100 },
    );

    expect(staleFallback).toEqual({ version: 'latest' });
  });
});
