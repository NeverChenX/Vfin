import { describe, it, expect } from 'vitest';
import { computeSegmentValuation, computeSotp } from '../sotp';
import type { BusinessSegment, ValuationConfig } from '@/types/valuation';

function seg(overrides: Partial<BusinessSegment> = {}): BusinessSegment {
  return {
    id: 'test',
    name: 'Test Seg',
    method: 'PS',
    metricLabel: 'TTM Rev',
    metricValue: 1000,
    metricAsOf: '2025-12-31',
    peers: [
      { name: 'A', ticker: 'A', multiple: 2.0, asOf: '2025-12-31', source: 's' },
      { name: 'B', ticker: 'B', multiple: 4.0, asOf: '2025-12-31', source: 's' },
      { name: 'C', ticker: 'C', multiple: 3.0, asOf: '2025-12-31', source: 's' },
    ],
    rationale: '',
    ...overrides,
  };
}

function cfg(segments: BusinessSegment[], netCash: number | null = 500): ValuationConfig {
  return {
    sotpCurrency: 'CNY',
    sotpAsOf: '2025-12-31',
    netCash,
    netCashAsOf: '2025-12-31',
    marketCapOverride: null,
    segments,
  };
}

describe('computeSegmentValuation', () => {
  it('全数据齐全: peerMedian=3, impliedValue=1000*3=3000', () => {
    const r = computeSegmentValuation(seg());
    expect(r.peerMedian).toBe(3.0);
    expect(r.peerMean).toBeCloseTo(3.0);
    expect(r.peerCount).toBe(3);
    expect(r.impliedValue).toBe(3000);
    expect(r.excluded).toBe(false);
  });

  it('偶数 peer 中位 = 中间两个均值', () => {
    const r = computeSegmentValuation(seg({
      peers: [
        { name: 'A', ticker: 'A', multiple: 2.0, asOf: '2025', source: 's' },
        { name: 'B', ticker: 'B', multiple: 4.0, asOf: '2025', source: 's' },
      ],
    }));
    expect(r.peerMedian).toBe(3.0);
    expect(r.peerMean).toBe(3.0);
    expect(r.impliedValue).toBe(3000);
  });

  it('单 peer → 中位=均值=该 peer', () => {
    const r = computeSegmentValuation(seg({
      peers: [{ name: 'A', ticker: 'A', multiple: 5.0, asOf: '2025', source: 's' }],
    }));
    expect(r.peerMedian).toBe(5.0);
    expect(r.peerMean).toBe(5.0);
    expect(r.peerCount).toBe(1);
    expect(r.impliedValue).toBe(5000);
    expect(r.excluded).toBe(false);
  });

  it('metric=null → impliedValue=null, excluded=true, reason 含"指标"', () => {
    const r = computeSegmentValuation(seg({ metricValue: null }));
    expect(r.impliedValue).toBeNull();
    expect(r.excluded).toBe(true);
    expect(r.excludeReason).toMatch(/指标/);
  });

  it('peers=[] → peerMedian=null, impliedValue=null, excluded=true, reason 含"对标"', () => {
    const r = computeSegmentValuation(seg({ peers: [] }));
    expect(r.peerMedian).toBeNull();
    expect(r.peerMean).toBeNull();
    expect(r.peerCount).toBe(0);
    expect(r.impliedValue).toBeNull();
    expect(r.excluded).toBe(true);
    expect(r.excludeReason).toMatch(/对标/);
  });
});

describe('computeSotp', () => {
  it('单业务: sotp = metric × median + netCash', () => {
    const r = computeSotp(cfg([seg()], 500), 4000);
    expect(r.segmentsTotal).toBe(3000);
    expect(r.netCash).toBe(500);
    expect(r.sotpTotal).toBe(3500);
    expect(r.currentMarketCap).toBe(4000);
    expect(r.impliedUpsidePct).toBeCloseTo(-0.125);
    expect(r.excludedCount).toBe(0);
    expect(r.verdict).toBe('MILD_OVER');
  });

  it('多业务: 加总 = 各 segment + netCash', () => {
    const r = computeSotp(cfg([
      seg({ id: 's1', metricValue: 1000 }),
      seg({ id: 's2', metricValue: 2000 }),
    ], 1000), 9000);
    expect(r.segmentsTotal).toBe(9000);
    expect(r.sotpTotal).toBe(10000);
    expect(r.impliedUpsidePct).toBeCloseTo(0.1111, 3);
    expect(r.verdict).toBe('MILD_UNDER');
  });

  it('某 segment 缺数据被剔除, 剩余仍加总', () => {
    const r = computeSotp(cfg([
      seg({ id: 's1' }),
      seg({ id: 's2', metricValue: null }),
      seg({ id: 's3', peers: [] }),
    ], 0), 3000);
    expect(r.segmentsTotal).toBe(3000);
    expect(r.sotpTotal).toBe(3000);
    expect(r.excludedCount).toBe(2);
    expect(r.segments.filter((s) => s.excluded).length).toBe(2);
  });

  it('netCash=null 当 0 处理', () => {
    const r = computeSotp(cfg([seg()], null), 3000);
    expect(r.netCash).toBeNull();
    expect(r.sotpTotal).toBe(3000);
  });

  it('netCash 为负正确扣减', () => {
    const r = computeSotp(cfg([seg()], -500), 2000);
    expect(r.sotpTotal).toBe(2500);
  });

  it('SOTP == 市值 → upside=0 → FAIR', () => {
    const r = computeSotp(cfg([seg()], 0), 3000);
    expect(r.impliedUpsidePct).toBe(0);
    expect(r.verdict).toBe('FAIR');
  });

  it('SOTP 显著高于市值 → STRONG_UNDER', () => {
    const r = computeSotp(cfg([seg({ metricValue: 5000 })], 0), 5000);
    expect(r.verdict).toBe('STRONG_UNDER');
  });

  it('SOTP 显著低于市值 → STRONG_OVER', () => {
    const r = computeSotp(cfg([seg({ metricValue: 100 })], 0), 1000);
    expect(r.verdict).toBe('STRONG_OVER');
  });

  it('不变式: sotpTotal === segmentsTotal + (netCash ?? 0)', () => {
    for (const nc of [null, 0, 500, -500]) {
      const r = computeSotp(cfg([seg()], nc), 4000);
      expect(r.sotpTotal).toBe(r.segmentsTotal + (nc ?? 0));
    }
  });

  it('全部 segment 被剔除 → sotpTotal = 0 + netCash', () => {
    const r = computeSotp(cfg([
      seg({ metricValue: null }),
      seg({ peers: [] }),
    ], 500), 1000);
    expect(r.segmentsTotal).toBe(0);
    expect(r.excludedCount).toBe(2);
    expect(r.sotpTotal).toBe(500);
  });

  it('currency 与 asOf 透传', () => {
    const c = cfg([seg()]);
    const r = computeSotp(c, 4000);
    expect(r.currency).toBe('CNY');
    expect(r.asOf).toBe('2025-12-31');
  });
});
