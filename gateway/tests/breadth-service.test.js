import { describe, expect, it, vi } from 'vitest';
import { dailyLimitBps, computeBreadth, createBreadthService } from '../src/services/breadth-service.js';

describe('dailyLimitBps — 按板块/ST 判定涨跌停阈值（×100 BP）', () => {
  it('沪市主板 60xxxx → 995 (±10%)', () => {
    expect(dailyLimitBps('600519', '贵州茅台')).toBe(995);
    expect(dailyLimitBps('601318', '中国平安')).toBe(995);
  });
  it('深市主板 00xxxx → 995 (±10%)', () => {
    expect(dailyLimitBps('000001', '平安银行')).toBe(995);
    expect(dailyLimitBps('002594', '比亚迪')).toBe(995);
  });
  it('创业板 300/301 → 1995 (±20%)', () => {
    expect(dailyLimitBps('300750', '宁德时代')).toBe(1995);
    expect(dailyLimitBps('301236', '软通动力')).toBe(1995);
  });
  it('科创板 688 → 1995 (±20%)', () => {
    expect(dailyLimitBps('688031', '星环科技-U')).toBe(1995);
    expect(dailyLimitBps('688107', '安路科技')).toBe(1995);
  });
  it('北交所 8/4/920 → 2995 (±30%)', () => {
    expect(dailyLimitBps('920190', '雷神科技')).toBe(2995);
    expect(dailyLimitBps('830799', '艾融软件')).toBe(2995);
    expect(dailyLimitBps('430510', '丰光精密')).toBe(2995);
  });
  it('ST / *ST → 495 (±5%)，名称中含 ST 即覆盖代码板块', () => {
    expect(dailyLimitBps('600084', '*ST 中葡')).toBe(495);
    expect(dailyLimitBps('000017', 'ST 中华A')).toBe(495);
    // ST 创业板（罕见但存在）也按 ±5%
    expect(dailyLimitBps('300337', '*ST 银邦')).toBe(495);
  });
});

describe('computeBreadth — 翻页 + 不同板块同时计数', () => {
  it('混合板块 case：主板 9.95% 算涨停、创业板 9.95% 不算（差 1 个）', async () => {
    const page = {
      items: [
        { f3: 1000, f12: '600519', f14: '贵州茅台' },       // +10% 主板 → limitUp
        { f3: 995,  f12: '000001', f14: '平安银行' },       // +9.95% 主板 → limitUp
        { f3: 990,  f12: '600036', f14: '招商银行' },       // +9.9% 主板 → 不算
        { f3: 1990, f12: '300750', f14: '宁德时代' },       // +19.9% 创业板 → 不算
        { f3: 2000, f12: '688031', f14: '星环科技-U' },     // +20% 科创板 → limitUp
        { f3: 3000, f12: '920190', f14: '雷神科技' },       // +30% 北交所 → limitUp
        { f3: 500,  f12: '600084', f14: '*ST 中葡' },       // +5% ST → limitUp
        { f3: 490,  f12: '600084', f14: '*ST 中葡' },       // +4.9% ST → 不算
        { f3: -1000, f12: '601318', f14: '中国平安' },      // -10% 主板 → limitDown
        { f3: 100,  f12: '600030', f14: '中信证券' },       // +1% → up，不涨停
        { f3: -100, f12: '600028', f14: '中国石化' },       // -1% → down
        { f3: 0,    f12: '600519', f14: '贵州茅台' }        // 持平
      ],
      total: 12
    };
    const fetcher = vi.fn().mockResolvedValue(page);
    // 注入：通过 computeBreadth 内部 fetchPage 拦截不易，但我们可以 monkey-patch fetch
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { diff: page.items, total: page.total } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    const result = await computeBreadth({ pageCap: 1 });
    expect(result.total).toBe(12);
    expect(result.up).toBe(9);     // f3 > 0 的总数
    expect(result.down).toBe(2);   // f3 < 0
    expect(result.flat).toBe(1);   // f3 == 0
    expect(result.limitUp).toBe(5);   // 主板1000、主板995、科创2000、北交3000、ST500
    expect(result.limitDown).toBe(1); // 主板-1000
  });
});

describe('createBreadthService — 缓存 + market guard', () => {
  it('非 cn market 抛 400', async () => {
    const svc = createBreadthService({ fetcher: async () => ({ total: 0, up: 0, down: 0, flat: 0, limitUp: 0, limitDown: 0 }) });
    await expect(svc.get('hk')).rejects.toThrow(/Unsupported breadth market/);
  });
  it('TTL 内命中缓存', async () => {
    const fetcher = vi.fn().mockResolvedValue({ total: 5, up: 3, down: 2, flat: 0, limitUp: 0, limitDown: 0 });
    const svc = createBreadthService({ ttlMs: 60_000, fetcher });
    const a = await svc.get('cn');
    const b = await svc.get('cn');
    expect(a).toBe(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
