export function yoyDelta(curr: number | null, prev: number | null): number | null {
  if (
    curr === null || prev === null ||
    !Number.isFinite(curr) || !Number.isFinite(prev) ||
    prev === 0
  ) return null;
  return (curr - prev) / Math.abs(prev);
}

export function commonSizeRatio(value: number | null, denom: number | null): number | null {
  if (
    value === null || denom === null ||
    !Number.isFinite(value) || !Number.isFinite(denom) ||
    denom === 0
  ) return null;
  return value / denom;
}

export function denomKeyForStatement(s: 'IS' | 'BS' | 'CF'): string {
  switch (s) {
    case 'IS': return 'rev_total';
    case 'BS': return 'total_assets';
    case 'CF': return 'op_cf_in';
  }
}
