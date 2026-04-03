import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server.js';
import { createDatabaseConnection } from '../src/db/connection.js';
import { createWatchlistService } from '../src/services/watchlist-service.js';

describe('watchlist routes', () => {
  let watchlistService;
  let tempDir;

  afterEach(() => {
    watchlistService?.close();
    watchlistService = undefined;

    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
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
    expect(response.headers['x-trace-id']).toMatch(/\S+/);
    expect(response.body).toEqual({
      code: 'REQUEST_ERROR',
      message: expect.stringMatching(/invalid symbol/i),
      provider: 'gateway',
      traceId: response.headers['x-trace-id']
    });
  });

  it('falls back to 500 when a route error has an invalid status code', async () => {
    const app = createApp({
      watchlistService: {
        list() {
          const error = new Error('broken watchlist');
          error.statusCode = 700;
          throw error;
        },
        add() {
          throw new Error('not used');
        },
        remove() {
          throw new Error('not used');
        }
      }
    });

    const response = await request(app).get('/api/hqchart/watchlist');

    expect(response.status).toBe(500);
    expect(response.headers['x-trace-id']).toMatch(/\S+/);
    expect(response.body).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'broken watchlist',
      provider: 'gateway',
      traceId: response.headers['x-trace-id']
    });
  });

  it('persists watchlist items across app and database recreation for file-backed sqlite', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqchart-gateway-watchlist-'));
    const dbPath = path.join(tempDir, 'watchlist.sqlite');

    watchlistService = createWatchlistService({ dbPath });
    let app = createApp({ watchlistService });

    const added = await request(app)
      .post('/api/hqchart/watchlist')
      .send({ symbol: '600000' });

    expect(added.status).toBe(200);
    expect(added.body.item.symbol).toBe('600000.sh');

    watchlistService.close();
    watchlistService = createWatchlistService({ dbPath });
    app = createApp({ watchlistService });

    const listed = await request(app).get('/api/hqchart/watchlist');

    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0].symbol).toBe('600000.sh');
  });

  it('can start migrations repeatedly without breaking the schema', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqchart-gateway-migrations-'));
    const dbPath = path.join(tempDir, 'watchlist.sqlite');

    const firstDb = createDatabaseConnection({ dbPath });
    const firstMigrations = firstDb
      .prepare('SELECT id FROM schema_migrations ORDER BY id ASC')
      .all();
    const firstTables = firstDb
      .prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name IN ('schema_migrations', 'watchlist_items')
        ORDER BY name ASC
      `)
      .all();
    firstDb.close();

    const secondDb = createDatabaseConnection({ dbPath });
    const secondMigrations = secondDb
      .prepare('SELECT id FROM schema_migrations ORDER BY id ASC')
      .all();
    secondDb
      .prepare(`
        INSERT INTO watchlist_items (symbol, market, display_name)
        VALUES (?, ?, ?)
      `)
      .run('00700.hk', 'hk', '00700.hk');
    const persistedRows = secondDb
      .prepare('SELECT symbol FROM watchlist_items ORDER BY symbol ASC')
      .all();
    secondDb.close();

    expect(firstTables).toEqual([
      { name: 'schema_migrations' },
      { name: 'watchlist_items' }
    ]);
    expect(firstMigrations).toEqual([{ id: '001_create_watchlist_items.sql' }]);
    expect(secondMigrations).toEqual([{ id: '001_create_watchlist_items.sql' }]);
    expect(persistedRows).toEqual([{ symbol: '00700.hk' }]);
  });
});
