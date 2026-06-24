import { describe, it, expect } from 'vitest';
import { computeSegmentValuation, computeSotp } from '../sotp';
import type { BusinessSegment, ValuationConfig } from '@/types/valuation';
import xiaomi from '@/data/companies/01810.json';

function seg(overrides: Partial<BusinessSegment> = {}): BusinessSegment {
  return {
    id: 'test',
    name: 'Test Seg',
    method: 'PS',
    metricLabel: '板块净利润',
    metricValue: 1000,
    metricAsOf: '2025-12-31',
    peers: [
      { name: 'A', ticker: 'A', netIncome: 1000, marketValue: 2000, asOf: '2025-12-31', source: 's' },
      { name: 'B', ticker: 'B', netIncome: 1000, marketValue: 4000, asOf: '2025-12-31', source: 's' },
      { name: 'C', ticker: 'C', netIncome: 1000, marketValue: 3000, asOf: '2025-12-31', source: 's' },
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
  it('全数据齐全: peerMedian=peer估值/peer净利润中位数, impliedValue=板块净利润*peerMedian', () => {
    const r = computeSegmentValuation(seg());
    expect(r.peerMedian).toBe(3.0);
    expect(r.peerMean).toBeCloseTo(3.0);
    expect(r.peerCount).toBe(3);
    expect(r.impliedValue).toBe(3000);
    expect(r.excluded).toBe(false);
  });

  it('按对标公司净利润和估值反推板块估值', () => {
    const r = computeSegmentValuation(seg({
      metricValue: 1000,
      peers: [
        {
          name: 'Peer',
          ticker: 'P',
          netIncome: 5000,
          marketValue: 50000,
          asOf: '2025',
          source: 's',
        },
      ],
    }));

    expect(r.peerMedian).toBe(10);
    expect(r.impliedValue).toBe(10000);
  });

  it('优先使用已验证的 peer 估值倍数，避免用单季利润误算 PE', () => {
    const r = computeSegmentValuation(seg({
      method: 'PE',
      metricLabel: 'Q1 2026 推导净利润',
      metricValue: 2720.775,
      peers: [
        {
          name: '美的集团',
          ticker: '000333.SZ',
          netIncome: 12674.556,
          marketValue: 632821,
          valuationMultiple: 14.32,
          valuationMultipleLabel: 'PE-TTM',
          asOf: '2026-06-15',
          source: 's',
        },
      ],
    }));

    expect(r.peerMedian).toBe(14.32);
    expect(r.peerImpliedMultiples['000333.SZ']).toBe(14.32);
    expect(r.impliedValue).toBeCloseTo(38961.498, 3);
  });

  it('偶数 peer 中位 = 中间两个均值', () => {
    const r = computeSegmentValuation(seg({
      peers: [
        { name: 'A', ticker: 'A', netIncome: 1000, marketValue: 2000, asOf: '2025', source: 's' },
        { name: 'B', ticker: 'B', netIncome: 1000, marketValue: 4000, asOf: '2025', source: 's' },
      ],
    }));
    expect(r.peerMedian).toBe(3.0);
    expect(r.peerMean).toBe(3.0);
    expect(r.impliedValue).toBe(3000);
  });

  it('单 peer → 中位=均值=该 peer', () => {
    const r = computeSegmentValuation(seg({
      peers: [{ name: 'A', ticker: 'A', netIncome: 1000, marketValue: 5000, asOf: '2025', source: 's' }],
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

  it('PE 口径遇到负利润不做机械正估值', () => {
    const r = computeSegmentValuation(seg({
      method: 'PE',
      metricValue: -1000,
      peers: [
        { name: 'Loss', ticker: 'L', netIncome: -100, marketValue: 1000, asOf: '2025', source: 's' },
      ],
    }));

    expect(r.peerCount).toBe(0);
    expect(r.peerMedian).toBeNull();
    expect(r.impliedValue).toBeNull();
    expect(r.excluded).toBe(true);
    expect(r.excludeReason).toMatch(/负利润|PE/);
  });

  it('PS 口径可用收入作为正指标估值亏损业务', () => {
    const r = computeSegmentValuation(seg({
      method: 'PS',
      metricLabel: 'Q1 收入',
      metricValue: 20000,
      peers: [
        { name: 'Revenue Peer', ticker: 'R', netIncome: 100000, marketValue: 120000, asOf: '2025', source: 's' },
      ],
    }));

    expect(r.peerCount).toBe(1);
    expect(r.peerMedian).toBe(1.2);
    expect(r.impliedValue).toBe(24000);
    expect(r.excluded).toBe(false);
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

describe('01810 SOTP config', () => {
  it('手机与互联网服务使用 Apple 双源校验 PE-TTM，不用单源市值除净利润反推 PE', () => {
    const segment = xiaomi.valuation.segments.find((s) => s.id === 'smartphones_internet_services');
    expect(segment).toBeTruthy();
    expect(segment?.method).toBe('PE');
    expect(segment?.metricLabel).toBe('Q1 2026 推导净利润年化 (CNY 百万)');
    expect(segment?.peers[0].ticker).toBe('AAPL');
    expect(segment?.peers[0].valuationMultiple).toBeGreaterThan(35);
    expect(segment?.peers[0].valuationMultiple).toBeLessThan(36);
    expect(segment?.peers[0].valuationMultipleLabel).toMatch(/PE-TTM/);
    expect(segment?.peers[0].source).toMatch(/double|双源/i);

    const result = computeSegmentValuation(segment as BusinessSegment);
    expect(result.peerMedian).toBeCloseTo(segment?.peers[0].valuationMultiple as number, 2);
    expect(result.impliedValue).toBeCloseTo(
      (segment?.metricValue as number) * (segment?.peers[0].valuationMultiple as number),
      3,
    );
  });

  it('IoT 与生活消费品使用双源校验 PE-TTM，且板块利润先年化', () => {
    const segment = xiaomi.valuation.segments.find((s) => s.id === 'iot_lifestyle');
    expect(segment).toBeTruthy();
    expect(segment?.method).toBe('PE');
    expect(segment?.metricLabel).toBe('Q1 2026 推导净利润年化 (CNY 百万)');
    expect(segment?.metricValue).toBeCloseTo(2720.775 * 4, 3);
    expect(segment?.peers[0].ticker).toBe('000333.SZ');
    expect(segment?.peers[0].valuationMultiple).toBeCloseTo(13.96, 2);
    expect(segment?.peers[0].valuationMultipleLabel).toMatch(/PE-TTM/);

    const result = computeSegmentValuation(segment as BusinessSegment);
    expect(result.peerMedian).toBeCloseTo(13.96, 2);
    expect(result.peerMedian).toBeLessThan(20);
    expect(result.impliedValue).toBeCloseTo(10883.1 * 13.96, 3);
  });

  it('智能电动汽车及 AI 等创新业务亏损时用年化收入和理想汽车市值 P/S 估值', () => {
    const segment = xiaomi.valuation.segments.find((s) => s.id === 'smart_ev_ai_new');
    expect(segment).toBeTruthy();
    expect(segment?.method).toBe('PS');
    expect(segment?.metricLabel).toBe('Q1 2026 收入年化');
    expect(segment?.metricValue).toBeCloseTo(19864.4 * 4, 3);
    expect(segment?.peers).toHaveLength(1);
    expect(segment?.peers[0].ticker).toBe('2015.HK');
    expect(segment?.peers[0].netIncome).toBeCloseTo(22982.911 * 4, 3);
    expect(segment?.peers[0].marketValue).toBeGreaterThan(90000);

    const result = computeSegmentValuation(segment as BusinessSegment);
    expect(result.peerMedian).toBeCloseTo(1.0595, 4);
    expect(result.impliedValue).toBeGreaterThan(84000);
    expect(result.impliedValue).toBeLessThan(84500);
  });
});
