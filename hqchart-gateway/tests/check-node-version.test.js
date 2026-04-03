import { describe, expect, it } from 'vitest';
import { checkNodeVersion } from '../scripts/check-node-version.js';

describe('checkNodeVersion', () => {
  it('accepts Node 20 and above', () => {
    expect(() => checkNodeVersion('20.0.0')).not.toThrow();
    expect(() => checkNodeVersion('22.15.1')).not.toThrow();
  });

  it('rejects Node versions below 20', () => {
    expect(() => checkNodeVersion('19.9.0')).toThrow(/Node\.js 20\+ is required/i);
  });
});
