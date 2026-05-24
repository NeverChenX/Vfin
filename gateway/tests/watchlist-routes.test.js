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
      .post('/api/watchlist')
      .send({ symbol: '700' });

    expect(added.status).toBe(200);
    expect(added.body.item.symbol).toBe('00700.hk');
    expect(added.body.item.market).toBe('hk');
    expect(added.body.item.displayName).toBe('00700.hk');

    const addedAgain = await request(app)
      .post('/api/watchlist')
      .send({ symbol: '00700.hk' });

    expect(addedAgain.status).toBe(200);
    expect(addedAgain.body.item).toEqual(added.body.item);

    const listed = await request(app).get('/api/watchlist');

    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0]).toEqual(added.body.item);

    const removed = await request(app).delete('/api/watchlist/700');

    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ removed: '00700.hk' });

    const listedAfterDelete = await request(app).get('/api/watchlist');

    expect(listedAfterDelete.status).toBe(200);
    expect(listedAfterDelete.body).toEqual({ items: [] });
  });

  it('returns 400 for invalid add requests', async () => {
    watchlistService = createWatchlistService({ dbPath: ':memory:' });
    const app = createApp({ watchlistService });

    const response = await request(app)
      .post('/api/watchlist')
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

  it('filters and cleans legacy invalid symbols during list', async () => {
    const db = createDatabaseConnection({ dbPath: ':memory:' });
    db.prepare(
      `
        INSERT INTO watchlist_items (symbol, market, display_name)
        VALUES (?, ?, ?)
      `
    ).run('INVALID.us', 'us', 'INVALID.us');
    db.prepare(
      `
        INSERT INTO watchlist_items (symbol, market, display_name)
        VALUES (?, ?, ?)
      `
    ).run('00700.hk', 'hk', '00700.hk');

    watchlistService = createWatchlistService({ db });
    const app = createApp({ watchlistService });

    const listed = await request(app).get('/api/watchlist');
    expect(listed.status).toBe(200);
    expect(listed.body.items.map((item) => item.symbol)).toEqual(['00700.hk']);

    const persisted = db
      .prepare('SELECT symbol FROM watchlist_items ORDER BY symbol ASC')
      .all();
    expect(persisted).toEqual([{ symbol: '00700.hk' }]);
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

    const response = await request(app).get('/api/watchlist');

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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vfin-gateway-watchlist-'));
    const dbPath = path.join(tempDir, 'watchlist.sqlite');

    watchlistService = createWatchlistService({ dbPath });
    let app = createApp({ watchlistService });

    const added = await request(app)
      .post('/api/watchlist')
      .send({ symbol: '600000' });

    expect(added.status).toBe(200);
    expect(added.body.item.symbol).toBe('600000.sh');

    watchlistService.close();
    watchlistService = createWatchlistService({ dbPath });
    app = createApp({ watchlistService });

    const listed = await request(app).get('/api/watchlist');

    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0].symbol).toBe('600000.sh');
  });

  it('add moves an existing symbol to a new category when explicitly requested', async () => {
    watchlistService = createWatchlistService({ dbPath: ':memory:' });
    const app = createApp({ watchlistService });

    const initial = await request(app)
      .post('/api/watchlist')
      .send({ symbol: '01766', category: '我的持仓' });
    expect(initial.status).toBe(200);
    expect(initial.body.item.symbol).toBe('01766.hk');
    expect(initial.body.item.category).toBe('我的持仓');

    // 用户尝试把同一只股票加到自选股 — 应当移动分类，而不是被旧记录吞掉
    const moved = await request(app)
      .post('/api/watchlist')
      .send({ symbol: '01766', category: '自选股' });
    expect(moved.status).toBe(200);
    expect(moved.body.item.symbol).toBe('01766.hk');
    expect(moved.body.item.category).toBe('自选股');

    const listed = await request(app).get('/api/watchlist');
    const matches = listed.body.items.filter((i) => i.symbol === '01766.hk');
    expect(matches).toHaveLength(1);
    expect(matches[0].category).toBe('自选股');
  });

  it('sync-portfolio aligns 我的持仓 with portfolio_data.json (adds missing, removes stale)', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vfin-gateway-sync-'));
    const portfolioPath = path.join(tempDir, 'portfolio_data.json');
    process.env.PORTFOLIO_DATA_PATH = portfolioPath;

    fs.writeFileSync(
      portfolioPath,
      JSON.stringify({
        stocks: [
          { code: '601766', mkt: 'A股' }, // 中国中车
          { code: '700', mkt: '港股' },
          { code: '现金', mkt: '现金' }
        ]
      })
    );

    watchlistService = createWatchlistService({ dbPath: ':memory:' });
    const app = createApp({ watchlistService });

    const first = await request(app).post('/api/watchlist/sync-portfolio');
    expect(first.status).toBe(200);
    expect(first.body.imported).toBe(2);
    expect(first.body.removed).toBe(0);
    expect(first.body.items.map((i) => i.symbol).sort()).toEqual(['00700.hk', '601766.sh']);

    // 用户在自选股分类下手动加一只股票，sync 不该动它
    await request(app).post('/api/watchlist').send({ symbol: '600000', category: '自选股' });

    // 模拟：抛售中国中车 —— 从 portfolio 文件中移除
    fs.writeFileSync(
      portfolioPath,
      JSON.stringify({ stocks: [{ code: '700', mkt: '港股' }] })
    );

    const second = await request(app).post('/api/watchlist/sync-portfolio');
    expect(second.status).toBe(200);
    expect(second.body.imported).toBe(0);
    expect(second.body.removed).toBe(1);
    expect(second.body.removedSymbols).toEqual(['601766.sh']);

    const listed = await request(app).get('/api/watchlist');
    const symbolsByCategory = {};
    for (const item of listed.body.items) {
      (symbolsByCategory[item.category] ||= []).push(item.symbol);
    }
    expect(symbolsByCategory['我的持仓']).toEqual(['00700.hk']);
    expect(symbolsByCategory['自选股']).toEqual(['600000.sh']);

    delete process.env.PORTFOLIO_DATA_PATH;
  });

  it('sync-portfolio respects user-moved symbols (does not pull them back into 我的持仓)', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vfin-gateway-sync-respect-'));
    const portfolioPath = path.join(tempDir, 'portfolio_data.json');
    process.env.PORTFOLIO_DATA_PATH = portfolioPath;

    fs.writeFileSync(
      portfolioPath,
      JSON.stringify({
        stocks: [
          { code: '700', mkt: '港股' },
          { code: '1766', mkt: '港股' }
        ]
      })
    );

    watchlistService = createWatchlistService({ dbPath: ':memory:' });
    const app = createApp({ watchlistService });

    await request(app).post('/api/watchlist/sync-portfolio');
    // 用户手动把港股 01766 从"我的持仓"挪到"自选股"
    await request(app).post('/api/watchlist').send({ symbol: '01766', category: '自选股' });

    // 再 sync 一次：portfolio_data.json 没变化
    const second = await request(app).post('/api/watchlist/sync-portfolio');
    expect(second.status).toBe(200);
    expect(second.body.imported).toBe(0); // 不该被重新加回我的持仓
    expect(second.body.removed).toBe(0);

    const listed = await request(app).get('/api/watchlist');
    const match = listed.body.items.filter((i) => i.symbol === '01766.hk');
    expect(match).toHaveLength(1);
    expect(match[0].category).toBe('自选股'); // 用户的手动分类被保留

    delete process.env.PORTFOLIO_DATA_PATH;
  });

  it('can start migrations repeatedly without breaking the schema', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vfin-gateway-migrations-'));
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
    expect(firstMigrations).toEqual([{ id: '001_create_watchlist_items.sql' }, { id: '002_add_category.sql' }]);
    expect(secondMigrations).toEqual([{ id: '001_create_watchlist_items.sql' }, { id: '002_add_category.sql' }]);
    expect(persistedRows).toEqual([{ symbol: '00700.hk' }]);
  });
});
