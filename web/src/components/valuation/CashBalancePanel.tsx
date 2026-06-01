import type { CompanyFinancials } from '@/types/finance';
import { deriveNetCashConservative, type DerivedValue } from '@/lib/valuation/derive';

interface Props {
  company: CompanyFinancials;
}

function fmtMillionYuan(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '--';
  const yi = v / 100;
  if (Math.abs(yi) >= 100) return `${Math.round(yi).toLocaleString('en-US')} 亿`;
  return `${yi.toFixed(2)} 亿`;
}

function fmtRawYuan(raw: number | null): string {
  if (raw === null || !Number.isFinite(raw)) return '--';
  // raw 单位是元；亿 = 1e8
  const yi = raw / 1e8;
  if (Math.abs(yi) >= 100) return `${yi.toFixed(2).replace(/\.00$/, '')} 亿`;
  if (Math.abs(yi) >= 1) return `${yi.toFixed(2)} 亿`;
  // 不到 1 亿用万
  const wan = raw / 1e4;
  return `${Math.round(wan).toLocaleString('en-US')} 万`;
}

export function CashBalancePanel({ company }: Props) {
  const netCash = deriveNetCashConservative(company);

  if (!netCash) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        无 BS 数据可供派生净现金。请检查公司 JSON 的{' '}
        <code className="rounded bg-amber-100 px-1">statements.BS.periods</code>。
      </div>
    );
  }

  const hasValue = netCash.value !== null;
  const nullComponents = netCash.components.filter((c) => c.rawValue === null);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">净现金（保守口径）</h2>
          <p className="mt-0.5 text-[11px] text-gray-500">
            派生自 BS · 截至 <span className="font-mono">{netCash.asOf}</span>
          </p>
        </div>
        <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-blue-200">
          {hasValue ? '✓ 派生' : '✗ 公式含 null'}
        </span>
      </div>

      <div className="px-5 py-4">
        <div className="text-3xl font-semibold tabular-nums text-gray-900">
          {fmtMillionYuan(netCash.value)}
        </div>
        <div className="mt-1 text-xs text-gray-500">单位：人民币（元）</div>
      </div>

      <div className="border-t border-gray-100 bg-gray-50 px-5 py-3">
        <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
          公式分解
        </div>
        <div className="mt-2 font-mono text-[11px] text-gray-600">{netCash.formula}</div>
        <ul className="mt-3 space-y-1 text-xs">
          {netCash.components.map((c) => (
            <li
              key={c.name}
              className={`flex items-center justify-between ${
                c.rawValue === null ? 'text-red-600' : 'text-gray-700'
              }`}
            >
              <span className="font-mono">{c.name}</span>
              <span className="tabular-nums">
                {c.rawValue === null ? <span className="font-semibold">缺数据 (null)</span> : fmtRawYuan(c.rawValue)}
              </span>
            </li>
          ))}
        </ul>
        {nullComponents.length > 0 && (
          <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
            ⚠ {nullComponents.length} 项缺数据，净现金无法计算。请在公司 JSON 的 BS
            字段中补全，或在 <code className="font-mono">valuation.netCashOverride</code> 中手填经核对的真值（含 sourceUrl）。
          </div>
        )}
        <DataCaveat netCash={netCash} />
      </div>
    </div>
  );
}

function DataCaveat({ netCash }: { netCash: DerivedValue }) {
  const allZero = netCash.components
    .filter((c) => c.name.startsWith('−'))
    .every((c) => c.rawValue === 0);
  if (!allZero) return null;
  return (
    <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
      ⚠ <strong>所有有息负债项 = 0</strong>，这通常意味着数据源（如 stockanalysis.com）
      把短期借款 / 长期借款 / 应付债券合并到了 <code className="font-mono">other_cl</code> /{' '}
      <code className="font-mono">other_ncl</code>。真实净现金可能显著低于派生值。
      建议在 <code className="font-mono">valuation.netCashOverride</code> 中填入从公司年报或 Wind 终端核对的真值。
    </div>
  );
}
