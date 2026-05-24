#!/usr/bin/env node
// 模拟数据生成器
// 输出：src/data/companies/<ticker>.json
// 仅包含 periods 数据，schema 由 src/lib/finance/schemas.ts 提供（单一来源）。

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'src', 'data', 'companies');
mkdirSync(OUT_DIR, { recursive: true });

// ════════════════════════════════════════════════════════════════
// Schemas（与 src/lib/finance/schemas.ts 保持同步；BS 已按"总→分→明细"排序）
// ════════════════════════════════════════════════════════════════
const IS_SUBJECTS = [
  { id: 'rev_main',     kind: 'item',     formula: null },
  { id: 'rev_other',    kind: 'item',     formula: null },
  { id: 'rev_total',    kind: 'subtotal', formula: 'rev_main + rev_other' },
  { id: 'cogs_main',    kind: 'item',     formula: null },
  { id: 'cogs_other',   kind: 'item',     formula: null },
  { id: 'gross_profit', kind: 'subtotal', formula: 'rev_total - cogs_main - cogs_other' },
  { id: 'opex',         kind: 'item',     formula: null },
  { id: 'rd_exp',       kind: 'item',     formula: null },
  { id: 'da_exp',       kind: 'item',     formula: null },
  { id: 'ebit',         kind: 'subtotal', formula: 'gross_profit - opex - rd_exp - da_exp' },
  { id: 'interest_exp', kind: 'item',     formula: null },
  { id: 'invest_inc',   kind: 'item',     formula: null },
  { id: 'ebt',          kind: 'subtotal', formula: 'ebit - interest_exp + invest_inc' },
  { id: 'tax_exp',      kind: 'item',     formula: null },
  { id: 'net_income',   kind: 'subtotal', formula: 'ebt - tax_exp' },
  { id: 'oci',          kind: 'item',     formula: null },
  { id: 'compr_inc',    kind: 'total',    formula: 'net_income + oci' },
];

const BS_SUBJECTS = [
  { id: 'total_assets',      kind: 'total',    formula: 'total_ca + total_nca' },
  { id: 'total_ca',          kind: 'subtotal', formula: 'cash + ar + inventory + other_ca' },
  { id: 'cash',              kind: 'item',     formula: null },
  { id: 'ar',                kind: 'item',     formula: null },
  { id: 'inventory',         kind: 'item',     formula: null },
  { id: 'other_ca',          kind: 'item',     formula: null },
  { id: 'total_nca',         kind: 'subtotal', formula: 'ppe + cip + intangibles + lt_equity_inv + other_nca' },
  { id: 'ppe',               kind: 'item',     formula: null },
  { id: 'cip',               kind: 'item',     formula: null },
  { id: 'intangibles',       kind: 'item',     formula: null },
  { id: 'lt_equity_inv',     kind: 'item',     formula: null },
  { id: 'other_nca',         kind: 'item',     formula: null },
  { id: 'total_liab',        kind: 'subtotal', formula: 'total_cl + total_ncl' },
  { id: 'total_cl',          kind: 'subtotal', formula: 'st_debt + ap + other_cl' },
  { id: 'st_debt',           kind: 'item',     formula: null },
  { id: 'ap',                kind: 'item',     formula: null },
  { id: 'other_cl',          kind: 'item',     formula: null },
  { id: 'total_ncl',         kind: 'subtotal', formula: 'lt_debt + other_ncl' },
  { id: 'lt_debt',           kind: 'item',     formula: null },
  { id: 'other_ncl',         kind: 'item',     formula: null },
  { id: 'total_equity',      kind: 'subtotal', formula: 'parent_equity + minority_equity' },
  { id: 'parent_equity',     kind: 'subtotal', formula: 'share_capital + capital_reserve + retained_earnings' },
  { id: 'share_capital',     kind: 'item',     formula: null },
  { id: 'capital_reserve',   kind: 'item',     formula: null },
  { id: 'retained_earnings', kind: 'item',     formula: null },
  { id: 'minority_equity',   kind: 'item',     formula: null },
  { id: 'total_liab_equity', kind: 'total',    formula: 'total_liab + total_equity' },
];

const CF_SUBJECTS = [
  { id: 'op_cf_in',        kind: 'item',     formula: null },
  { id: 'op_cf_out',       kind: 'item',     formula: null },
  { id: 'net_op_cf',       kind: 'subtotal', formula: 'op_cf_in - op_cf_out' },
  { id: 'inv_cf_in',       kind: 'item',     formula: null },
  { id: 'inv_cf_out',      kind: 'item',     formula: null },
  { id: 'net_inv_cf',      kind: 'subtotal', formula: 'inv_cf_in - inv_cf_out' },
  { id: 'fin_cf_in',       kind: 'item',     formula: null },
  { id: 'fin_cf_out',      kind: 'item',     formula: null },
  { id: 'net_fin_cf',      kind: 'subtotal', formula: 'fin_cf_in - fin_cf_out' },
  { id: 'net_change_cash', kind: 'subtotal', formula: 'net_op_cf + net_inv_cf + net_fin_cf' },
  { id: 'beg_cash',        kind: 'item',     formula: null },
  { id: 'end_cash',        kind: 'total',    formula: 'beg_cash + net_change_cash' },
];

// ════════════════════════════════════════════════════════════════
// 期间清单
// ════════════════════════════════════════════════════════════════
const PERIODS = [
  ...[2021, 2022, 2023, 2024, 2025].map((y) => ({ year: y, granularity: 'Y' })),
  ...[[2024, 1], [2024, 2], [2025, 1], [2025, 2]].map(([y, i]) => ({ year: y, granularity: 'H', index: i })),
  ...[
    [2024, 1], [2024, 2], [2024, 3], [2024, 4],
    [2025, 1], [2025, 2], [2025, 3], [2025, 4],
  ].map(([y, i]) => ({ year: y, granularity: 'Q', index: i })),
];

// ════════════════════════════════════════════════════════════════
// 公司基础数据（2024 年度，单位：亿元）
// ════════════════════════════════════════════════════════════════
const COMPANIES = [
  {
    ticker: '003816', name: '中国广核', shortName: 'CGN', industry: '核电运营',
    currency: 'CNY', unit: 'yi', accountingStandard: 'CAS',
    cfBegCash2024: 285.10,
    base: {
      IS: {
        rev_main: 825.40, rev_other: 12.30,
        cogs_main: 490.00, cogs_other: 8.50,
        opex: 41.00, rd_exp: 8.40, da_exp: 55.00,
        interest_exp: 45.60, invest_inc: 8.40,
        tax_exp: 28.20, oci: 2.30,
      },
      BS: {
        cash: 320.50, ar: 145.20, inventory: 38.60, other_ca: 88.40,
        ppe: 2840.30, cip: 680.40, intangibles: 78.20, lt_equity_inv: 245.10, other_nca: 156.80,
        st_debt: 285.40, ap: 168.50, other_cl: 220.30,
        lt_debt: 1485.20, other_ncl: 220.80,
        share_capital: 50.50, capital_reserve: 480.20, minority_equity: 880.30,
      },
      CF: {
        op_cf_in: 1240.30, op_cf_out: 920.40,
        inv_cf_in: 35.20, inv_cf_out: 280.50,
        fin_cf_in: 540.20, fin_cf_out: 580.40,
      },
    },
    growth: { IS: 1.08, BS: 1.07, CF: 1.07 },
    growthOverride: {
      IS: { rev_main: 1.07, cogs_main: 1.06, interest_exp: 1.03, rd_exp: 1.18, da_exp: 1.06, tax_exp: 1.10 },
      BS: { ppe: 1.08, cip: 1.10, lt_debt: 1.05, cash: 1.04 },
      CF: { inv_cf_out: 1.06 },
    },
    shapeOverride: {
      IS: { interest_exp: 'STRONG_DN', rd_exp: 'STRONG_UP', oci: 'ZIGZAG' },
      BS: { cip: 'INV_U', lt_debt: 'STRONG_DN', cash: 'WAVE' },
      CF: { fin_cf_in: 'STRONG_DN', inv_cf_out: 'SPIKE_LAST' },
    },
    qWeights: [0.24, 0.25, 0.27, 0.24],
  },
  {
    ticker: '600900', name: '长江电力', shortName: 'CYPC', industry: '水电运营',
    currency: 'CNY', unit: 'yi', accountingStandard: 'CAS',
    cfBegCash2024: 168.40,
    base: {
      IS: {
        rev_main: 826.00, rev_other: 16.50,
        cogs_main: 240.00, cogs_other: 6.50,
        opex: 19.60, rd_exp: 1.80, da_exp: 220.00,
        interest_exp: 78.60, invest_inc: 95.20,
        tax_exp: 70.40, oci: -3.20,
      },
      BS: {
        cash: 145.20, ar: 86.40, inventory: 12.30, other_ca: 320.80,
        ppe: 3450.20, cip: 220.30, intangibles: 165.80, lt_equity_inv: 1240.40, other_nca: 188.50,
        st_debt: 320.80, ap: 65.20, other_cl: 188.50,
        lt_debt: 1820.40, other_ncl: 220.30,
        share_capital: 244.70, capital_reserve: 580.40, minority_equity: 145.30,
      },
      CF: {
        op_cf_in: 1085.40, op_cf_out: 432.10,
        inv_cf_in: 88.50, inv_cf_out: 220.30,
        fin_cf_in: 480.20, fin_cf_out: 845.20,
      },
    },
    growth: { IS: 1.06, BS: 1.05, CF: 1.05 },
    growthOverride: {
      IS: { rev_main: 1.05, cogs_main: 1.04, interest_exp: 1.02, da_exp: 1.03, invest_inc: 1.12 },
      BS: { ppe: 1.04, lt_equity_inv: 1.09, lt_debt: 1.02 },
      CF: {},
    },
    shapeOverride: {
      IS: { rev_main: 'WAVE', invest_inc: 'VOLATILE', oci: 'U_SHAPE' },
      BS: { lt_equity_inv: 'STRONG_UP', lt_debt: 'DOWN', cash: 'VOLATILE' },
      CF: { fin_cf_out: 'WAVE_DN', inv_cf_in: 'VOLATILE' },
    },
    qWeights: [0.10, 0.18, 0.50, 0.22],
  },
  {
    ticker: '600406', name: '国电南瑞', shortName: 'NARI', industry: '电网设备',
    currency: 'CNY', unit: 'yi', accountingStandard: 'CAS',
    cfBegCash2024: 220.30,
    base: {
      IS: {
        rev_main: 532.40, rev_other: 8.20,
        cogs_main: 376.00, cogs_other: 4.50,
        opex: 42.70, rd_exp: 42.80, da_exp: 12.00,
        interest_exp: -3.20, invest_inc: 6.40,
        tax_exp: 12.50, oci: 0.80,
      },
      BS: {
        cash: 285.40, ar: 320.80, inventory: 145.20, other_ca: 80.40,
        ppe: 88.50, cip: 12.40, intangibles: 48.20, lt_equity_inv: 35.40, other_nca: 28.50,
        st_debt: 48.20, ap: 245.30, other_cl: 188.50,
        lt_debt: 18.40, other_ncl: 32.50,
        share_capital: 80.40, capital_reserve: 88.50, minority_equity: 18.40,
      },
      CF: {
        op_cf_in: 720.80, op_cf_out: 588.50,
        inv_cf_in: 18.50, inv_cf_out: 65.20,
        fin_cf_in: 8.40, fin_cf_out: 32.50,
      },
    },
    growth: { IS: 1.14, BS: 1.10, CF: 1.12 },
    growthOverride: {
      IS: { rev_main: 1.12, cogs_main: 1.10, rd_exp: 1.20, interest_exp: 1.00, da_exp: 1.08 },
      BS: { ppe: 1.08, ar: 1.13, inventory: 1.12 },
      CF: {},
    },
    shapeOverride: {
      IS: { rev_main: 'STRONG_UP', rd_exp: 'STRONG_UP', interest_exp: 'ZIGZAG' },
      BS: { inventory: 'VOLATILE', ar: 'STRONG_UP', cip: 'SPIKE_MID' },
      CF: { inv_cf_in: 'WAVE', fin_cf_in: 'DIP' },
    },
    qWeights: [0.15, 0.20, 0.25, 0.40],
  },
];

// ════════════════════════════════════════════════════════════════
// Shape 表（每个科目随 5 年的非线性形态，2024 = idx 3 = 1.00 锚定基准）
// ════════════════════════════════════════════════════════════════
const SHAPES = {
  UP:         [0.78, 0.86, 0.93, 1.00, 1.07],   // 单调温和上升
  STRONG_UP:  [0.55, 0.70, 0.86, 1.00, 1.18],   // 较陡上升
  DOWN:       [1.18, 1.12, 1.06, 1.00, 0.94],   // 单调下降
  STRONG_DN:  [1.45, 1.30, 1.16, 1.00, 0.82],   // 较陡下降
  WAVE:       [0.88, 1.10, 0.92, 1.00, 1.06],   // 起伏波折（涨）
  WAVE_DN:    [1.10, 0.88, 1.05, 1.00, 0.92],   // 起伏波折（跌）
  SPIKE_LAST: [0.85, 0.92, 0.88, 1.00, 1.45],   // 末年突跳
  SPIKE_MID:  [0.92, 0.95, 1.45, 1.00, 1.10],   // 中间年份突跳
  DIP:        [1.05, 1.10, 0.65, 1.00, 1.08],   // 中间年份回落
  FLAT:       [0.99, 1.01, 0.98, 1.00, 1.02],   // 接近持平
  VOLATILE:   [0.65, 1.30, 0.80, 1.00, 1.15],   // 高波动
  INV_U:      [0.78, 0.92, 1.05, 1.00, 0.85],   // 倒 U（先升后降）
  U_SHAPE:    [1.20, 1.05, 0.85, 1.00, 1.15],   // U 形（先降后升）
  ZIGZAG:     [0.85, 1.05, 0.90, 1.00, 0.92],   // 锯齿
  RAMP_UP:    [0.70, 0.82, 0.94, 1.00, 1.06],   // 急升后趋缓
  RAMP_DOWN:  [1.30, 1.18, 1.08, 1.00, 0.92],   // 急降后趋缓
};

function shapeMul(shape, deltaYears) {
  const arr = SHAPES[shape];
  if (!arr) return 1.0;
  const t = Math.max(0, Math.min(4, deltaYears + 3));
  const lo = Math.floor(t);
  const hi = Math.ceil(t);
  if (lo === hi) return arr[lo];
  const frac = t - lo;
  return arr[lo] * (1 - frac) + arr[hi] * frac;
}

// 默认科目 → shape 映射（所有公司通用，每家公司可覆盖）
const DEFAULT_SHAPES = {
  // IS
  rev_main: 'UP',
  rev_other: 'VOLATILE',
  cogs_main: 'UP',
  cogs_other: 'WAVE_DN',
  opex: 'STRONG_UP',
  rd_exp: 'SPIKE_LAST',
  da_exp: 'UP',
  interest_exp: 'DOWN',
  invest_inc: 'VOLATILE',
  tax_exp: 'UP',
  oci: 'ZIGZAG',
  // BS
  cash: 'WAVE',
  ar: 'UP',
  inventory: 'VOLATILE',
  other_ca: 'DIP',
  ppe: 'UP',
  cip: 'INV_U',
  intangibles: 'FLAT',
  lt_equity_inv: 'STRONG_UP',
  other_nca: 'WAVE',
  st_debt: 'VOLATILE',
  ap: 'UP',
  other_cl: 'WAVE_DN',
  lt_debt: 'DOWN',
  other_ncl: 'FLAT',
  share_capital: 'FLAT',
  capital_reserve: 'FLAT',
  minority_equity: 'STRONG_UP',
  // CF
  op_cf_in: 'UP',
  op_cf_out: 'UP',
  inv_cf_in: 'VOLATILE',
  inv_cf_out: 'WAVE',
  fin_cf_in: 'STRONG_DN',
  fin_cf_out: 'WAVE_DN',
};

// ════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════
const round2 = (n) => Math.round(n * 100) / 100;

function applyGrowth(base, defaultGrowth, growthOverride, deltaYears, shapeOverride) {
  const out = {};
  for (const [k, v] of Object.entries(base)) {
    const g = growthOverride?.[k] ?? defaultGrowth;
    const shape = shapeOverride?.[k] ?? DEFAULT_SHAPES[k];
    const sm = shape ? shapeMul(shape, deltaYears) : 1.0;
    out[k] = v * Math.pow(g, deltaYears) * sm;
  }
  return out;
}

function scaleAll(values, factor) {
  const out = {};
  for (const [k, v] of Object.entries(values)) out[k] = v * factor;
  return out;
}

function bsTimeIndex(p) {
  const { year, granularity, index } = p;
  if (granularity === 'Y') return (year - 2023) * 4;
  if (granularity === 'H') return (year - 2023) * 4 - 4 + index * 2;
  if (granularity === 'Q') return (year - 2023) * 4 - 4 + index;
  throw new Error(`bad granularity: ${granularity}`);
}

function evalFormula(formula, values) {
  const tokens = formula.split(/\s+/);
  let total = 0;
  let op = '+';
  for (const tok of tokens) {
    if (tok === '+' || tok === '-') { op = tok; continue; }
    const v = values[tok] ?? 0;
    total = op === '+' ? total + v : total - v;
  }
  return total;
}

function computeSubtotals(subjects, values) {
  const result = { ...values };
  // 多次遍历直到稳定（处理依赖关系）
  for (let pass = 0; pass < 4; pass++) {
    for (const subj of subjects) {
      if ((subj.kind === 'subtotal' || subj.kind === 'total') && subj.formula) {
        result[subj.id] = round2(evalFormula(subj.formula, result));
      }
    }
  }
  return result;
}

function halfWeight(qWeights, halfIndex) {
  return halfIndex === 1 ? qWeights[0] + qWeights[1] : qWeights[2] + qWeights[3];
}

function periodSortKey(p) {
  const offset = p.granularity === 'H' ? p.index * 2 : p.granularity === 'Q' ? p.index : 4;
  return p.year * 10 + offset;
}

// ────────────────────────────────────────────────────────────────
// Per-period generation
// ────────────────────────────────────────────────────────────────
function generateISPeriod(company, period) {
  const annual = applyGrowth(company.base.IS, company.growth.IS, company.growthOverride?.IS, period.year - 2024, company.shapeOverride?.IS);
  let scaled;
  if (period.granularity === 'Y') scaled = annual;
  else if (period.granularity === 'H') scaled = scaleAll(annual, halfWeight(company.qWeights, period.index));
  else scaled = scaleAll(annual, company.qWeights[period.index - 1]);
  const rounded = {};
  for (const [k, v] of Object.entries(scaled)) rounded[k] = round2(v);
  return computeSubtotals(IS_SUBJECTS, rounded);
}

function generateBSPeriod(company, period) {
  const t = bsTimeIndex(period);
  const deltaYears = (t - 4) / 4;
  const items = applyGrowth(company.base.BS, company.growth.BS, company.growthOverride?.BS, deltaYears, company.shapeOverride?.BS);
  const rounded = {};
  for (const [k, v] of Object.entries(items)) rounded[k] = round2(v);
  let withSubs = computeSubtotals(BS_SUBJECTS, rounded);
  const targetTotalEquity = withSubs.total_assets - withSubs.total_liab;
  const targetParentEquity = targetTotalEquity - withSubs.minority_equity;
  withSubs.retained_earnings = round2(targetParentEquity - withSubs.share_capital - withSubs.capital_reserve);
  withSubs = computeSubtotals(BS_SUBJECTS, withSubs);
  return withSubs;
}

function generateCFItems(company, period) {
  const annual = applyGrowth(company.base.CF, company.growth.CF, company.growthOverride?.CF, period.year - 2024, company.shapeOverride?.CF);
  let scaled;
  if (period.granularity === 'Y') scaled = annual;
  else if (period.granularity === 'H') scaled = scaleAll(annual, halfWeight(company.qWeights, period.index));
  else scaled = scaleAll(annual, company.qWeights[period.index - 1]);
  const rounded = {};
  for (const [k, v] of Object.entries(scaled)) rounded[k] = round2(v);
  return computeSubtotals(CF_SUBJECTS, rounded);
}

function chainCFCash(periodsCF, begCashAtStart) {
  const result = [];
  let prevEnd = begCashAtStart;
  for (const p of periodsCF) {
    const values = { ...p.values };
    values.beg_cash = round2(prevEnd);
    values.end_cash = round2(values.beg_cash + values.net_change_cash);
    prevEnd = values.end_cash;
    result.push({ period: p.period, values });
  }
  return result;
}

// ════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════
let totalRecords = 0;
for (const company of COMPANIES) {
  const isPeriods = PERIODS.map((p) => ({ period: p, values: generateISPeriod(company, p) }));
  const bsPeriods = PERIODS.map((p) => ({ period: p, values: generateBSPeriod(company, p) }));
  const cfRaw = PERIODS.map((p) => ({ period: p, values: generateCFItems(company, p) }));

  const cfByGran = { Y: [], H: [], Q: [] };
  for (const p of cfRaw) cfByGran[p.period.granularity].push(p);
  for (const gran of ['Y', 'H', 'Q']) {
    cfByGran[gran].sort((a, b) => periodSortKey(a.period) - periodSortKey(b.period));
  }
  const cfChained = [];
  for (const gran of ['Y', 'H', 'Q']) {
    const periods = cfByGran[gran];
    if (!periods.length) continue;
    const earliest = periods[0].period;
    const periodSize = gran === 'Y' ? 4 : gran === 'H' ? 2 : 1;
    const earliestBegT = bsTimeIndex(earliest) - periodSize;
    const deltaYears = earliestBegT / 4;
    const begAtEarliest = company.cfBegCash2024 * Math.pow(company.growth.BS, deltaYears);
    cfChained.push(...chainCFCash(periods, begAtEarliest));
  }

  isPeriods.sort((a, b) => periodSortKey(a.period) - periodSortKey(b.period));
  bsPeriods.sort((a, b) => periodSortKey(a.period) - periodSortKey(b.period));
  cfChained.sort((a, b) => periodSortKey(a.period) - periodSortKey(b.period));

  const output = {
    ticker: company.ticker,
    name: company.name,
    shortName: company.shortName,
    industry: company.industry,
    currency: company.currency,
    unit: company.unit,
    accountingStandard: company.accountingStandard,
    statements: {
      IS: { periods: isPeriods },
      BS: { periods: bsPeriods },
      CF: { periods: cfChained },
    },
  };

  const outPath = join(OUT_DIR, `${company.ticker}.json`);
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  totalRecords += isPeriods.length + bsPeriods.length + cfChained.length;
  console.log(`✓ ${company.ticker} ${company.name} → ${outPath}`);
}

const registry = COMPANIES.map((c) => ({
  ticker: c.ticker, name: c.name, shortName: c.shortName, industry: c.industry,
}));
writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(registry, null, 2));

console.log(`\n${COMPANIES.length} 家公司，共 ${totalRecords} 个 period 记录`);
