import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeHkConnect, createHkConnectService } from '../src/services/hk-connect-service.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockKamtResponse(body) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  );
}

describe('computeHkConnect — eastmoney kamt 字段 + 单位换算', () => {
  it('从 dayNetAmtIn (单位 万元) 换算为 元，南向/北向加总正确', async () => {
    mockKamtResponse({
      rc: 0,
      data: {
        sh2hk: { dayNetAmtIn: 4200000.0, dayAmtRemain: 0.0, dayAmtThreshold: 4200000.0 }, // 420 亿元
        sz2hk: { dayNetAmtIn: 1500000.0, dayAmtRemain: 0.0, dayAmtThreshold: 4200000.0 }, // 150 亿元
        hk2sh: { dayNetAmtIn: -800000.0, dayAmtRemain: 0.0, dayAmtThreshold: 5200000.0 }, // -80 亿元
        hk2sz: { dayNetAmtIn: 200000.0,  dayAmtRemain: 0.0, dayAmtThreshold: 5200000.0 }  //  20 亿元
      }
    });
    const r = await computeHkConnect();
    // 南向：(420 + 150) 亿元 = 570 亿元 = 5.7e10 元
    expect(r.southboundNet).toBe((4200000 + 1500000) * 10000);
    expect(r.southboundNet).toBe(57_000_000_000);
    // 北向：(-80 + 20) 亿元 = -60 亿元
    expect(r.northboundNet).toBe((-800000 + 200000) * 10000);
    expect(r.northboundNet).toBe(-6_000_000_000);
  });

  it('某一通道完全缺失时仍能返回部分汇总（不 null 整个）', async () => {
    mockKamtResponse({
      rc: 0,
      data: {
        sh2hk: { dayNetAmtIn: 1000000.0 }, // 100 亿
        sz2hk: null,                        // 缺失
        hk2sh: { dayNetAmtIn: 500000.0 },   // 50 亿
        hk2sz: null
      }
    });
    const r = await computeHkConnect();
    expect(r.southboundNet).toBe(1000000 * 10000); // 仅 sh2hk
    expect(r.northboundNet).toBe(500000 * 10000);  // 仅 hk2sh
  });

  it('全部通道都缺 dayNetAmtIn → 返回 null（前端显示 --）', async () => {
    mockKamtResponse({
      rc: 0,
      data: {
        sh2hk: { dayAmtThreshold: 4200000.0 }, // 没 dayNetAmtIn 字段
        sz2hk: { dayAmtThreshold: 4200000.0 },
        hk2sh: { dayAmtThreshold: 5200000.0 },
        hk2sz: { dayAmtThreshold: 5200000.0 }
      }
    });
    const r = await computeHkConnect();
    expect(r.southboundNet).toBeNull();
    expect(r.northboundNet).toBeNull();
  });

  it('旧字段名 netBuyAmt/today/f4 不再被错误读取（防止回归）', async () => {
    mockKamtResponse({
      rc: 0,
      data: {
        sh2hk: { netBuyAmt: 99999, today: 99999, f4: 99999 }, // 故意只给旧名
        sz2hk: { netBuyAmt: 99999, today: 99999, f4: 99999 },
        hk2sh: { netBuyAmt: 99999, today: 99999, f4: 99999 },
        hk2sz: { netBuyAmt: 99999, today: 99999, f4: 99999 }
      }
    });
    const r = await computeHkConnect();
    // 没 dayNetAmtIn 应当 null，绝不能读旧字段（旧字段是 eastmoney 不存在的 ghost）
    expect(r.southboundNet).toBeNull();
    expect(r.northboundNet).toBeNull();
  });
});

describe('createHkConnectService — 缓存', () => {
  it('TTL 内不重复 fetch', async () => {
    const fetcher = vi.fn().mockResolvedValue({ southboundNet: 1, northboundNet: 2, southboundDays: null });
    const svc = createHkConnectService({ ttlMs: 60_000, fetcher });
    const a = await svc.get();
    const b = await svc.get();
    expect(a).toBe(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
