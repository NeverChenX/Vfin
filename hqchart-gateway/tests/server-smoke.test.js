import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server.js';

describe('gateway health smoke', () => {
  it('returns ok on live health endpoint', async () => {
    const app = createApp();

    const response = await request(app).get('/api/hqchart/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('preserves an incoming request id header', async () => {
    const app = createApp();

    const response = await request(app)
      .get('/api/hqchart/health/live')
      .set('X-Request-Id', 'incoming-request-id');

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBe('incoming-request-id');
    expect(response.headers['x-trace-id']).toBe('incoming-request-id');
  });

  it('generates a request id when one is missing', async () => {
    const app = createApp();

    const response = await request(app).get('/api/hqchart/health/live');

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(response.headers['x-trace-id']).toBe(response.headers['x-request-id']);
  });

  it('returns a trace id for invalid json requests', async () => {
    const app = createApp();

    const response = await request(app)
      .post('/api/hqchart/watchlist')
      .set('Content-Type', 'application/json')
      .send('{"symbol":');

    expect(response.status).toBe(400);
    expect(response.headers['x-trace-id']).toMatch(/\S+/);
    expect(response.body.traceId).toBe(response.headers['x-trace-id']);
  });
});
