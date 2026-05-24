#!/usr/bin/env node
/**
 * 数据完整性自检（P0 红线脚本）
 *
 * 见 memory/data-accuracy-zero-tolerance.md "P0 第一优先级铁律"。
 * 用法：
 *   node scripts/check-data-completeness.mjs            # 检查所有公司
 *   node scripts/check-data-completeness.mjs 01811      # 单个公司
 *
 * 退出码：
 *   0 = 全部通过
 *   1 = 发现关键字段缺失或 _validation 缺失 / failed
 *
 * 检查项：
 *   1. 每家公司每个年度，下列"核心科目"必须非 null（或 schema 有 formula 可反算）：
 *      IS: rev_total / gross_profit / ebit / ebt / net_income
 *      BS: total_assets / total_liab / total_equity
 *      CF: net_op_cf / net_inv_cf / net_fin_cf / end_cash
 *   2. _validation 字段必须存在
 *   3. _validation.passed 必须 true 或者 _validation.notes 必须明确说明为什么 false
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'src', 'data', 'companies');

// 核心字段及反算公式（与 schemas.ts 保持同步）
const CORE_FIELDS = {
  IS: {
    rev_total: 'rev_main + rev_other',
    gross_profit: 'rev_total - cogs_main - cogs_other',
    ebit: 'ebt + interest_exp - interest_inc - invest_inc - fx_gain - non_op_net',
    ebt: 'net_income + tax_exp',
    net_income: 'ebt - tax_exp',
  },
  BS: {
    total_assets: null, // 直接披露
    total_liab: null,
    total_equity: null,
  },
  CF: {
    net_op_cf: null,
    net_inv_cf: null,
    net_fin_cf: null,
    end_cash: 'beg_cash + net_change_cash + fx_effect_on_cash',
  },
};

function evalFormula(formula, values) {
  const re = /([+-]?)\s*([a-z_][a-z0-9_]*)/gi;
  let result = 0, hasAny = false;
  for (const [, op, name] of formula.matchAll(re)) {
    const v = values[name];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    hasAny = true;
    result += (op === '-' ? -1 : 1) * v;
  }
  return hasAny ? result : null;
}

function resolveValue(field, formula, values) {
  const raw = values[field];
  if (raw !== null && raw !== undefined) return raw;
  if (!formula) return null;
  return evalFormula(formula, values);
}

function checkCompany(filepath) {
  const issues = [];
  const data = JSON.parse(readFileSync(filepath, 'utf-8'));
  const ticker = data.ticker;

  // 1. _validation 元数据
  if (!data._validation) {
    issues.push({ severity: 'P0', msg: '缺 _validation 元数据' });
  } else if (data._validation.passed === false) {
    const notes = data._validation.notes ?? [];
    if (notes.length === 0) {
      issues.push({ severity: 'P0', msg: '_validation.passed=false 但没有 notes 解释原因' });
    }
  }

  // 2. 核心字段
  for (const [stmt, fields] of Object.entries(CORE_FIELDS)) {
    const periods = data.statements?.[stmt]?.periods ?? [];
    for (const p of periods) {
      if (p.period.granularity !== 'Y') continue;
      const yr = p.period.year;
      for (const [field, formula] of Object.entries(fields)) {
        const v = resolveValue(field, formula, p.values);
        if (v === null || v === undefined) {
          issues.push({
            severity: 'P0',
            msg: `${stmt}.${field} ${yr}-Y = null（formula="${formula ?? '直接披露'}" 也算不出）`,
          });
        }
      }
    }
  }

  return { ticker, issues };
}

function main() {
  const argTicker = process.argv[2];
  const files = readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json') && !f.startsWith('index'))
    .filter((f) => !argTicker || f.startsWith(argTicker));

  let totalIssues = 0;
  const reports = [];
  for (const f of files) {
    const r = checkCompany(join(DATA_DIR, f));
    reports.push(r);
    totalIssues += r.issues.length;
  }

  // 打印
  for (const r of reports) {
    if (r.issues.length === 0) {
      console.log(`✓ ${r.ticker}: 全部核心字段完整`);
    } else {
      console.log(`✗ ${r.ticker}: ${r.issues.length} 个 P0 问题`);
      for (const i of r.issues.slice(0, 20)) {
        console.log(`    [${i.severity}] ${i.msg}`);
      }
      if (r.issues.length > 20) console.log(`    ... 还有 ${r.issues.length - 20} 个`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  if (totalIssues === 0) {
    console.log('🟢 全部公司核心字段完整，零容忍红线通过');
    process.exit(0);
  } else {
    console.log(`🔴 共发现 ${totalIssues} 个 P0 问题 — 违反零容忍铁律`);
    console.log('   请查 memory/data-accuracy-zero-tolerance.md 处理流程');
    process.exit(1);
  }
}

main();
