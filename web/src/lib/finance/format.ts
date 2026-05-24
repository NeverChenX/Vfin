import type { RawUnit, DisplayUnit, Currency } from '@/types/finance';

const TO_YUAN: Record<RawUnit, number> = {
  yuan: 1,
  wan: 1e4,
  yi: 1e8,
};

const CURRENCY_SUFFIX: Record<Currency, string> = {
  CNY: '元',
  USD: '美元',
  HKD: '港元',
};

const UNIT_PREFIX: Record<RawUnit, string> = {
  yuan: '',
  wan: '万',
  yi: '亿',
};

export function unitLabel(u: RawUnit, currency: Currency = 'CNY'): string {
  return UNIT_PREFIX[u] + CURRENCY_SUFFIX[currency];
}

export function convert(value: number, from: RawUnit, to: RawUnit): number {
  return (value * TO_YUAN[from]) / TO_YUAN[to];
}

export function pickAutoUnit(maxAbsValueInRaw: number, rawUnit: RawUnit): RawUnit {
  const yuanAbs = Math.abs(maxAbsValueInRaw) * TO_YUAN[rawUnit];
  // 阈值降到 1e9（十亿）— 让港股 $9B / 美股 $10B+ 都自动切到"亿"档
  if (yuanAbs >= 1e9) return 'yi';
  if (yuanAbs >= 1e6) return 'wan';
  return 'yuan';
}

export function resolveDisplayUnit(
  displayUnit: DisplayUnit,
  maxRawValue: number,
  rawUnit: RawUnit,
): RawUnit {
  return displayUnit === 'auto' ? pickAutoUnit(maxRawValue, rawUnit) : displayUnit;
}

function withThousands(s: string): string {
  const [intPart, decPart] = s.split('.');
  const intSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decPart ? `${intSep}.${decPart}` : intSep;
}

export function formatNumber(
  value: number | null,
  options: {
    rawUnit: RawUnit;
    displayUnit: RawUnit;
    maximumFractionDigits?: number;
  },
): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const converted = convert(value, options.rawUnit, options.displayUnit);
  const digits = options.maximumFractionDigits ?? 2;
  const body = withThousands(Math.abs(converted).toFixed(digits));
  return converted < 0 ? `(${body})` : body;
}

export function formatPercent(
  ratio: number | null,
  options?: { signed?: boolean; digits?: number },
): string {
  if (ratio === null || !Number.isFinite(ratio)) return '—';
  const digits = options?.digits ?? 1;
  const pct = ratio * 100;
  const abs = Math.abs(pct).toFixed(digits);
  if (options?.signed) {
    if (pct > 0) return `+${abs}%`;
    if (pct < 0) return `-${abs}%`;
    return `0.${'0'.repeat(digits)}%`;
  }
  return `${pct.toFixed(digits)}%`;
}
