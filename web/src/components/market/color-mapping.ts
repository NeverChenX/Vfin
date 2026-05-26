/**
 * 把涨跌幅 pct（%）映射到 7 档热力色 + null（不可用）。
 * 色阶与设计文档第 2 节的 wireframe 一致。
 */

const HEAT_COLORS = {
  n3: '#c33645',  // <= -3
  n2: '#c95464',  // (-3, -2]
  n1: '#8b5060',  // (-2, -0.1)
  z:  '#4a525e',  // [-0.1, 0.1]
  p1: '#4d7a64',  // (0.1, 1)
  p2: '#2f9d6b',  // [1, 3)
  p3: '#0ECB81',  // >= 3
  unavailable: '#2B3139',
} as const;

export function pctToHeatColor(pct: number | null): string {
  if (pct === null || Number.isNaN(pct)) return HEAT_COLORS.unavailable;
  if (pct >= 3) return HEAT_COLORS.p3;
  if (pct >= 1) return HEAT_COLORS.p2;
  if (pct > 0.1) return HEAT_COLORS.p1;
  if (pct >= -0.1) return HEAT_COLORS.z;
  if (pct > -2) return HEAT_COLORS.n1;
  if (pct > -3) return HEAT_COLORS.n2;
  return HEAT_COLORS.n3;
}

export function pctToTextClass(pct: number | null): 'text-up' | 'text-down' | 'text-flat' {
  if (pct === null || Number.isNaN(pct) || pct === 0) return 'text-flat';
  return pct > 0 ? 'text-up' : 'text-down';
}
