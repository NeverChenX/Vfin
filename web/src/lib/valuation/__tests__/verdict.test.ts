import { describe, it, expect } from 'vitest';
import {
  classifyVerdict,
  valuationCoverageRatio,
  valuationGapSummary,
  verdictLabel,
  verdictTone,
} from '../verdict';

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

describe('valuationGapSummary', () => {
  it('低估时返回低估金额和百分比', () => {
    const summary = valuationGapSummary(9323.9, 5830.1);
    expect(summary?.direction).toBe('低估');
    expect(summary?.amount).toBeCloseTo(3493.8, 6);
    expect(summary?.pct).toBeCloseTo(0.5992693092742852, 12);
  });

  it('高估时返回高估金额和百分比', () => {
    expect(valuationGapSummary(800, 1000)).toEqual({
      direction: '高估',
      amount: 200,
      pct: 0.2,
    });
  });

  it('缺少市值时返回 null', () => {
    expect(valuationGapSummary(800, null)).toBeNull();
  });
});

describe('valuationCoverageRatio', () => {
  it('返回当前市值除以推算估值', () => {
    expect(valuationCoverageRatio(9323.9, 5830.1)).toBeCloseTo(5830.1 / 9323.9, 12);
  });

  it('缺少推算估值或推算估值为 0 时返回 null', () => {
    expect(valuationCoverageRatio(null, 5830.1)).toBeNull();
    expect(valuationCoverageRatio(0, 5830.1)).toBeNull();
  });
});
