import { describe, it, expect } from 'vitest';
import { formatMoney, formatMultiple, formatPct } from '../format';

/**
 * 单位换算:
 *   1 百万 = 100 万 = 0.01 亿
 *   1 亿 = 100 百万
 *
 * 显示规则 (CNY/HKD):
 *   ≥ 1 亿 (≥100 百万)        用 "亿"
 *     ≥ 100 亿 (≥10000 百万)  用整数: "7,200 亿"
 *     < 100 亿                用 2 位小数: "18.50 亿"
 *   < 1 亿                   用 "万"
 *
 * 显示规则 (USD):
 *   ≥ 1 B (≥1000 百万) 用 "B" 2 位小数
 *   < 1 B              用 "M" 整数
 */

describe('formatMoney', () => {
  it('CNY/HKD ≥100 亿 用整数', () => {
    expect(formatMoney(720000, 'CNY')).toBe('CNY 7,200 亿');
    expect(formatMoney(10000, 'CNY')).toBe('CNY 100 亿');
  });
  it('CNY/HKD ≥1 亿且 <100 亿 用 2 位小数', () => {
    expect(formatMoney(1850, 'HKD')).toBe('HKD 18.50 亿');
    expect(formatMoney(100, 'CNY')).toBe('CNY 1.00 亿');
  });
  it('CNY/HKD <1 亿 用万', () => {
    expect(formatMoney(50, 'CNY')).toBe('CNY 5,000 万');
    expect(formatMoney(0.5, 'CNY')).toBe('CNY 50 万');
  });
  it('USD ≥1 B 用 B', () => {
    expect(formatMoney(2500, 'USD')).toBe('USD 2.50 B');
  });
  it('USD <1 B 用 M', () => {
    expect(formatMoney(950, 'USD')).toBe('USD 950 M');
  });
  it('null/NaN/undefined → "--"', () => {
    expect(formatMoney(null, 'CNY')).toBe('--');
    expect(formatMoney(NaN, 'CNY')).toBe('--');
    expect(formatMoney(undefined as unknown as number, 'CNY')).toBe('--');
  });
  it('合法 0 不归并成 "--"', () => {
    expect(formatMoney(0, 'CNY')).toBe('CNY 0 万');
    expect(formatMoney(0, 'USD')).toBe('USD 0 M');
  });
  it('负数（净负债）保留负号', () => {
    expect(formatMoney(-50000, 'CNY')).toBe('CNY -500 亿');
    expect(formatMoney(-100, 'USD')).toBe('USD -100 M');
  });
});

describe('formatMultiple', () => {
  it('1 位小数 + x', () => {
    expect(formatMultiple(1.67)).toBe('1.7x');
    expect(formatMultiple(20)).toBe('20.0x');
  });
  it('null → "--"', () => {
    expect(formatMultiple(null)).toBe('--');
  });
});

describe('formatPct', () => {
  it('百分比 1 位小数 + 正负号', () => {
    expect(formatPct(0.123)).toBe('+12.3%');
    expect(formatPct(-0.123)).toBe('-12.3%');
    expect(formatPct(0)).toBe('+0.0%');
  });
  it('null / NaN → "--"', () => {
    expect(formatPct(null)).toBe('--');
    expect(formatPct(NaN)).toBe('--');
  });
});
