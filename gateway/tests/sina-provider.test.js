import { describe, expect, it } from 'vitest';
import { parseSinaFx, parseSinaCommodity, parseSinaIntlIndex } from '../src/providers/live-mappers.js';

describe('parseSinaFx', () => {
  it('parses USDCNY response', () => {
    const raw = 'var hq_str_fx_susdcny="23:56:02,6.7860000000,6.7868000000,6.7834000000,67.0000000000,6.7860000000,6.7888000000,6.7821000000,6.7868000000,在岸人民币,0.0501,0.0034,0.0067,中国外汇交易中心暨全国银行间同业拆借中心,0.0000";';
    const q = parseSinaFx(raw);
    expect(q.price).toBeCloseTo(6.786, 3);
    expect(q.prevClose).toBeCloseTo(6.7868, 4);
    expect(q.high).toBeCloseTo(6.7888, 4);
    expect(q.low).toBeCloseTo(6.7821, 4);
  });
});

describe('parseSinaCommodity', () => {
  it('parses COMEX gold (hf_GC)', () => {
    const raw = 'var hq_str_hf_GC="4539.080,,4538.800,4539.300,4615.600,4533.100,23:57:12,4556.400,4566.000,0,1,2,2026-05-26,纽约黄金,0";';
    const q = parseSinaCommodity(raw);
    expect(q.price).toBeCloseTo(4539.08, 2);
    expect(q.open).toBeCloseTo(4539.30, 2);
    expect(q.high).toBeCloseTo(4615.60, 2);
    expect(q.low).toBeCloseTo(4533.10, 2);
    expect(q.prevClose).toBeCloseTo(4556.40, 2);
  });
});

describe('parseSinaIntlIndex', () => {
  it('parses Nikkei (int_nikkei)', () => {
    const raw = 'var hq_str_int_nikkei="日经指数,44946.64,-408.35,-0.90";';
    const q = parseSinaIntlIndex(raw);
    expect(q.price).toBeCloseTo(44946.64, 2);
    expect(q.prevClose).toBeCloseTo(44946.64 + 408.35, 2);
    expect(q.pctChange).toBeCloseTo(-0.90, 2);
  });
});
