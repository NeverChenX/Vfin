import { describe, expect, it } from 'vitest';
import { pctToHeatColor, pctToTextClass } from './color-mapping';

describe('pctToHeatColor', () => {
  it('returns brightest green for strongly positive pct (>=3)', () => {
    expect(pctToHeatColor(3.5)).toBe('#0ECB81');
    expect(pctToHeatColor(10)).toBe('#0ECB81');
  });

  it('returns brightest red for strongly negative pct (<= -3)', () => {
    expect(pctToHeatColor(-3.2)).toBe('#c33645');
    expect(pctToHeatColor(-10)).toBe('#c33645');
  });

  it('returns neutral gray for near-zero pct', () => {
    expect(pctToHeatColor(0)).toBe('#4a525e');
    expect(pctToHeatColor(0.05)).toBe('#4a525e');
    expect(pctToHeatColor(-0.05)).toBe('#4a525e');
  });

  it('returns mid-green for mildly positive pct', () => {
    expect(pctToHeatColor(1.0)).toBe('#2f9d6b');
    expect(pctToHeatColor(2.0)).toBe('#2f9d6b');
  });

  it('returns null-safe gray when pct is null', () => {
    expect(pctToHeatColor(null)).toBe('#2B3139');
  });
});

describe('pctToTextClass', () => {
  it('returns text-up for positive', () => {
    expect(pctToTextClass(1.2)).toBe('text-up');
  });
  it('returns text-down for negative', () => {
    expect(pctToTextClass(-0.5)).toBe('text-down');
  });
  it('returns text-flat for zero / null', () => {
    expect(pctToTextClass(0)).toBe('text-flat');
    expect(pctToTextClass(null)).toBe('text-flat');
  });
});
