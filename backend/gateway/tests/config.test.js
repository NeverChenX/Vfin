import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the default port when PORT is missing', () => {
    expect(loadConfig({})).toEqual({ port: 18080 });
  });

  it('uses a valid numeric port', () => {
    expect(loadConfig({ PORT: '18081' })).toEqual({ port: 18081 });
  });

  it.each([
    ['18080abc'],
    ['-1'],
    ['0'],
    ['65536']
  ])('falls back for invalid PORT value %s and warns', (port) => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(loadConfig({ PORT: port })).toEqual({ port: 18080 });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
