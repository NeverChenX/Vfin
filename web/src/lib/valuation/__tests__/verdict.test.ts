import { describe, it, expect } from 'vitest';
import { classifyVerdict, verdictLabel, verdictTone } from '../verdict';

describe('classifyVerdict', () => {
  it('returns STRONG_UNDER when upside > +20%', () => {
    expect(classifyVerdict(0.25)).toBe('STRONG_UNDER');
    expect(classifyVerdict(0.50)).toBe('STRONG_UNDER');
  });
  it('returns MILD_UNDER when upside in (+5%, +20%]', () => {
    expect(classifyVerdict(0.20)).toBe('MILD_UNDER');
    expect(classifyVerdict(0.10)).toBe('MILD_UNDER');
    expect(classifyVerdict(0.06)).toBe('MILD_UNDER');
  });
  it('returns FAIR when upside in [-5%, +5%]', () => {
    expect(classifyVerdict(0.05)).toBe('FAIR');
    expect(classifyVerdict(0)).toBe('FAIR');
    expect(classifyVerdict(-0.05)).toBe('FAIR');
  });
  it('returns MILD_OVER when upside in [-20%, -5%)', () => {
    expect(classifyVerdict(-0.06)).toBe('MILD_OVER');
    expect(classifyVerdict(-0.20)).toBe('MILD_OVER');
  });
  it('returns STRONG_OVER when upside < -20%', () => {
    expect(classifyVerdict(-0.21)).toBe('STRONG_OVER');
    expect(classifyVerdict(-0.50)).toBe('STRONG_OVER');
  });
});

describe('verdictLabel', () => {
  it('returns Chinese labels for all 5 verdicts', () => {
    expect(verdictLabel('STRONG_UNDER')).toBe('显著低估');
    expect(verdictLabel('MILD_UNDER')).toBe('合理偏低');
    expect(verdictLabel('FAIR')).toBe('合理');
    expect(verdictLabel('MILD_OVER')).toBe('合理偏高');
    expect(verdictLabel('STRONG_OVER')).toBe('显著高估');
  });
});

describe('verdictTone', () => {
  it('returns semantic tone for each verdict', () => {
    expect(verdictTone('STRONG_UNDER')).toBe('positive-strong');
    expect(verdictTone('MILD_UNDER')).toBe('positive');
    expect(verdictTone('FAIR')).toBe('neutral');
    expect(verdictTone('MILD_OVER')).toBe('negative');
    expect(verdictTone('STRONG_OVER')).toBe('negative-strong');
  });
});
