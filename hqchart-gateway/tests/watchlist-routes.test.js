import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server.js';
import { createWatchlistService } from '../src/services/watchlist-service.js';

describe('watchlist routes', () => {
  let watchlistService;

  afterEach(() => {
    watchlistService?.close();
    watchlistService = undefined;
  });

  it('supports add, list, idempotent re-add, and delete with normalized symbols', async () => {
    watchlistService = createWatchlistService({ dbPath: ':memory:' });
    const app = createApp({ watchlistService });

    const added = await request(app)
      .post('/api/hqchart/watchlist')
      .send({ symbol: '700' });

    expect(added.status).toBe(200);
    expect(added.body.item.symbol).toBe('00700.hk');
    expect(added.body.item.market).toBe('hk');
    expect(added.body.item.displayName).toBe('00700.hk');

    const addedAgain = await request(app)
      .post('/api/hqchart/watchlist')
      .send({ symbol: '00700.hk' });

    expect(addedAgain.status).toBe(200);
    expect(addedAgain.body.item).toEqual(added.body.item);

    const listed = await request(app).get('/api/hqchart/watchlist');

    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0]).toEqual(added.body.item);

    const removed = await request(app).delete('/api/hqchart/watchlist/700');

    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ removed: '00700.hk' });

    const listedAfterDelete = await request(app).get('/api/hqchart/watchlist');

    expect(listedAfterDelete.status).toBe(200);
    expect(listedAfterDelete.body).toEqual({ items: [] });
  });

  it('returns 400 for invalid add requests', async () => {
    watchlistService = createWatchlistService({ dbPath: ':memory:' });
    const app = createApp({ watchlistService });

    const response = await request(app)
      .post('/api/hqchart/watchlist')
      .send({ symbol: 'invalid' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/invalid symbol/i);
  });
});
