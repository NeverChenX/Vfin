/**
 * 简单 formula 解析器，只支持 + / -。
 *
 * 用法：
 *   evalFormula('rev_main + rev_other', { rev_main: 100, rev_other: 20 }) → 120
 *
 * 缺失字段策略：
 *   - 默认 strict=false：任一字段为 null/undefined → 视为 0（部分可算就显示部分）
 *   - strict=true：任一字段为 null → 整个返回 null
 *
 * 安全：只匹配 [a-z_][a-z_0-9]* 标识符，不允许任意 JS 表达式注入。
 */
export function evalFormula(
  formula: string,
  values: Record<string, number | null | undefined>,
  opts: { strict?: boolean } = {},
): number | null {
  // 形如 "a + b - c"
  const tokenRe = /([+-]?)\s*([a-z_][a-z0-9_]*)/gi;
  let result = 0;
  let hasAny = false;
  for (const [, op, name] of formula.matchAll(tokenRe)) {
    const v = values[name];
    if (v === null || v === undefined || !Number.isFinite(v)) {
      if (opts.strict) return null;
      continue; // null-as-zero
    }
    hasAny = true;
    result += (op === '-' ? -1 : 1) * v;
  }
  return hasAny ? result : null;
}
