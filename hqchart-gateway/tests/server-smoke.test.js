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
});
