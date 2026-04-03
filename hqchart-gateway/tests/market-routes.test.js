import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server.js';

describe('market routes', () => {
  it('returns normalized stock payload in mock mode', async () => {
    const app = createApp();

    const response = await request(app)
      .get('/api/hqchart/stock')
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
  });

  it('returns an error status for stock requests when providers fail', async () => {
    const app = createApp();

    const response = await request(app)
      .get('/api/hqchart/stock')
      .query({ symbol: '600000', providerMode: 'force-error' });

    expect(response.status).toBeGreaterThanOrEqual(500);
  });
});
