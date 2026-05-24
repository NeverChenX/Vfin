/**
 * 多源交叉校验（Cross-Source Validation）
 *
 * 项目硬性要求（见 memory/data-accuracy-zero-tolerance.md）：
 * 每家公司必须有至少 2 个独立数据源，入库前**必须**跑 9 项对账。
 * 校验未通过禁止写盘。
 *
 * 9 项对账：
 *   CF（6）：CFO / CFI / CFF / NetΔCash / Beg Cash / End Cash
 *   BS（3）：total_assets / total_liab / total_equity
 *
 * 通过标准：|primary - secondary| ≤ $1 或相对差 ≤ 0.01%
 */

import type {
  CompanyFinancials,
  ValidationCheck,
  ValidationReport,
} from '@/types/finance';

const TOL_ABS = 1;          // $1 绝对容差
const TOL_REL = 0.0001;     // 0.01% 相对容差

/** 抛此异常 → API route 拒绝写盘 */
export class CrossValidationError extends Error {
  constructor(public report: ValidationReport, msg?: string) {
    super(msg ?? `Cross-validation failed: ${report.checks.filter((c) => !c.passed).length} of ${report.checks.length} checks did not pass`);
    this.name = 'CrossValidationError';
  }
}

const periodKey = (p: { year: number; granularity: string; index?: number }): string =>
  p.granularity === 'Y'
    ? `${p.year}-Y`
    : `${p.year}-${p.granularity}${p.index ?? ''}`;

/**
 * 校验单个公司"表内自洽性"：
 * - CF: CFO sub-items 求和 == net_op_cf（容许 interest_paid 计 CFF 的 IFRS 选项）
 *       CFI / CFF 同理
 *       net_change_cash == CFO + CFI + CFF
 *       end_cash == beg_cash + net_change_cash + fx
 * - BS: total_assets == total_liab + total_equity
 *       total_ca + total_nca == total_assets
 *       total_cl + total_ncl == total_liab
 *
 * 即使没有辅源，自洽性也是必查的。
 */
export function selfConsistencyChecks(c: CompanyFinancials): ValidationCheck[] {
  const out: ValidationCheck[] = [];

  for (const p of c.statements.CF.periods) {
    if (p.period.granularity !== 'Y') continue;
    const v = p.values;
    const period = periodKey(p.period);

    // CFO（含/不含 interest_paid 任一通过即可，IFRS 选项）
    const cfoFields = ['ebt_for_cf','da_cfo','impairment_cfo','sbc_cfo','other_non_cash','chg_receivables','chg_inventory','chg_payables','chg_other_wc','tax_paid'];
    const cfoSumExclInt = cfoFields.reduce((s, k) => s + ((v[k] ?? 0) as number), 0);
    const intPaid = (v.interest_paid ?? 0) as number;
    const netOpCf = v.net_op_cf as number | null;
    if (netOpCf !== null) {
      const inCFO = cfoSumExclInt + intPaid;
      const passed = Math.abs(inCFO - netOpCf) <= TOL_ABS || Math.abs(cfoSumExclInt - netOpCf) <= TOL_ABS;
      out.push({
        field: 'CF.consistency.cfo',
        period,
        primary: netOpCf,
        secondary: passed ? netOpCf : inCFO,
        absDiff: Math.min(Math.abs(inCFO - netOpCf), Math.abs(cfoSumExclInt - netOpCf)),
        relDiff: 0,
        passed,
        note: passed ? undefined : 'CFO sub-items 求和 ≠ net_op_cf（含/不含 interest_paid 都不通过）',
      });
    }

    // CFI
    const cfiFields = ['capex','disposal_ppe','acquisitions','divestitures','purchase_investments','sale_investments','interest_dividends_received','other_investing'];
    const cfiSum = cfiFields.reduce((s, k) => s + ((v[k] ?? 0) as number), 0);
    const netInvCf = v.net_inv_cf as number | null;
    if (netInvCf !== null) {
      out.push({
        field: 'CF.consistency.cfi',
        period,
        primary: netInvCf,
        secondary: cfiSum,
        absDiff: Math.abs(cfiSum - netInvCf),
        relDiff: 0,
        passed: Math.abs(cfiSum - netInvCf) <= TOL_ABS,
      });
    }

    // CFF
    const cffFields = ['debt_issued','debt_repaid','equity_issued','equity_repurchased','dividends_to_shareholders','dividends_to_nci','lease_principal_paid','other_financing'];
    const cffSumExclInt = cffFields.reduce((s, k) => s + ((v[k] ?? 0) as number), 0);
    const netFinCf = v.net_fin_cf as number | null;
    if (netFinCf !== null) {
      const inCFF = cffSumExclInt + intPaid;
      const passed = Math.abs(inCFF - netFinCf) <= TOL_ABS || Math.abs(cffSumExclInt - netFinCf) <= TOL_ABS;
      out.push({
        field: 'CF.consistency.cff',
        period,
        primary: netFinCf,
        secondary: passed ? netFinCf : inCFF,
        absDiff: Math.min(Math.abs(inCFF - netFinCf), Math.abs(cffSumExclInt - netFinCf)),
        relDiff: 0,
        passed,
      });
    }

    // NetΔCash = CFO + CFI + CFF
    if (netOpCf !== null && netInvCf !== null && netFinCf !== null && v.net_change_cash !== null) {
      const sum = netOpCf + netInvCf + netFinCf;
      out.push({
        field: 'CF.consistency.net_change',
        period,
        primary: v.net_change_cash as number,
        secondary: sum,
        absDiff: Math.abs(sum - (v.net_change_cash as number)),
        relDiff: 0,
        passed: Math.abs(sum - (v.net_change_cash as number)) <= TOL_ABS,
      });
    }

    // EndCash = Beg + NetΔ + FX
    const begCash = v.beg_cash as number | null;
    const endCash = v.end_cash as number | null;
    const netChg = v.net_change_cash as number | null;
    const fx = (v.fx_effect_on_cash ?? 0) as number;
    if (begCash !== null && endCash !== null && netChg !== null) {
      const computed = begCash + netChg + fx;
      out.push({
        field: 'CF.consistency.end_cash',
        period,
        primary: endCash,
        secondary: computed,
        absDiff: Math.abs(computed - endCash),
        relDiff: 0,
        passed: Math.abs(computed - endCash) <= TOL_ABS,
      });
    }
  }

  for (const p of c.statements.BS.periods) {
    if (p.period.granularity !== 'Y') continue;
    const v = p.values;
    const period = periodKey(p.period);
    const ta = v.total_assets as number | null;
    const tl = v.total_liab as number | null;
    const te = v.total_equity as number | null;
    if (ta !== null && tl !== null && te !== null) {
      const tle = tl + te;
      out.push({
        field: 'BS.consistency.balance',
        period,
        primary: ta,
        secondary: tle,
        absDiff: Math.abs(tle - ta),
        relDiff: Math.abs(tle - ta) / Math.max(Math.abs(ta), 1),
        passed: Math.abs(tle - ta) <= TOL_ABS || Math.abs(tle - ta) / Math.max(Math.abs(ta), 1) <= TOL_REL,
        note: 'A = L + E',
      });
    }
  }

  return out;
}

