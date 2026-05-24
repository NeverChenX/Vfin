import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server.js';

describe('market routes', () => {
  it('returns normalized stock payload in mock mode', async () => {
    const app = createApp();

    const response = await request(app)
      .get('/api/stock')
      .query({ symbol: '600000', providerMode: 'mock' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      symbol: '600000.sh',
      market: 'sh',
      name: 'Mock 600000.sh',
      price: 12.34,
      open: 12.1,
      high: 12.6,
      low: 12,
      volume: 123456,
      amount: 1523456
    });
    expect(response.body.provider).toBeDefined();
    expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(response.headers['x-trace-id']).toMatch(/\S+/);
  });

  it('returns unified upstream error payload with trace id when providers fail', async () => {
    const app = createApp();

    const response = await request(app)
      .get('/api/stock')
      .query({ symbol: '600000', providerMode: 'force-error' });

    expect(response.status).toBe(502);
    expect(response.headers['x-trace-id']).toMatch(/\S+/);
    expect(response.body).toEqual({
      code: 'ALL_PROVIDERS_FAILED',
      message: 'All providers failed for quote',
      provider: 'gateway',
      traceId: response.headers['x-trace-id']
    });
  });

  it('returns 400 for invalid provider mode requests', async () => {
    const app = createApp();

    const response = await request(app)
      .get('/api/stock')
      .query({ symbol: '600000', providerMode: 'bad' });

    expect(response.status).toBe(400);
  });

  it('returns 400 for unknown provider requests', async () => {
    const app = createApp();

    const response = await request(app)
      .get('/api/stock')
      .query({ symbol: '600000', provider: 'unknown', providerMode: 'mock' });

    expect(response.status).toBe(400);
  });

  it('supports allHistory flag for kline requests', async () => {
    const app = createApp();

    const response = await request(app)
      .get('/api/kline')
      .query({ symbol: '601390.sh', period: 'day', providerMode: 'mock', allHistory: 'true' });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.items)).toBe(true);
    expect(response.body.items.length).toBeGreaterThan(1);
    expect(response.body.period).toBe('day');
  });
});
