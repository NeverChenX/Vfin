'use client';

import { useMemo, useState } from 'react';
import {
  computeDcf,
  computeSensitivity,
  type DcfAssumptions,
} from '@/lib/valuation/dcf';

interface DcfPanelProps {
  defaultBaseRevenue: number;       // 百万
  defaultGrowthRates: number[];     // 长度 = 5
  defaultFcfMargin: number;
  defaultNetCash: number;           // 百万
  defaultDiscountRate?: number;
  defaultPerpetualGrowth?: number;
  currency: 'CNY' | 'HKD' | 'USD';
  /** 数据派生说明（如 "3 年均值"） */
  paramsRationale: {
    baseRevenue: string;
    growthRates: string;
    fcfMargin: string;
    netCash: string;
  };
}

function fmtYi(million: number | null): string {
  if (million === null || !Number.isFinite(million)) return '--';
  const yi = million / 100;
  if (Math.abs(yi) >= 10000) return `${(yi / 10000).toFixed(2)} 万亿`;
  if (Math.abs(yi) >= 100) return `${Math.round(yi).toLocaleString('en-US')}`;
  return yi.toFixed(2);
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

const NUM_INPUT_CLS =
  'w-24 rounded border border-gray-300 px-2 py-1 text-right font-mono text-sm tabular-nums focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

function PctInput({ value, onChange, step = 0.5 }: { value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <input
      type="number"
      className={NUM_INPUT_CLS}
      value={(value * 100).toFixed(1)}
      step={step}
      onChange={(e) => onChange(Number(e.target.value) / 100)}
    />
  );
}

function NumInput({ value, onChange, step = 100 }: { value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <input
      type="number"
      className={NUM_INPUT_CLS}
      value={value.toFixed(2)}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

export function DcfPanel({
  defaultBaseRevenue,
  defaultGrowthRates,
  defaultFcfMargin,
  defaultNetCash,
  defaultDiscountRate = 0.10,
  defaultPerpetualGrowth = 0.03,
  currency,
  paramsRationale,
}: DcfPanelProps) {
  const [baseRev, setBaseRev] = useState(defaultBaseRevenue);
  const [growths, setGrowths] = useState<number[]>(defaultGrowthRates);
  const [fcfMargin, setFcfMargin] = useState(defaultFcfMargin);
  const [discountRate, setDiscountRate] = useState(defaultDiscountRate);
  const [perpetualGrowth, setPerpetualGrowth] = useState(defaultPerpetualGrowth);
  const [netCash, setNetCash] = useState(defaultNetCash);

  const assumptions: DcfAssumptions = useMemo(
    () => ({
      forecastYears: 5,
      revGrowthRates: growths,
      fcfMargin,
      discountRate,
      perpetualGrowthRate: perpetualGrowth,
    }),
    [growths, fcfMargin, discountRate, perpetualGrowth],
  );

  const result = useMemo(
    () => computeDcf(assumptions, { baseRevenue: baseRev, netCash }),
    [assumptions, baseRev, netCash],
  );

  const sensitivity = useMemo(
    () =>
      computeSensitivity({
        base: assumptions,
        baseInputs: { baseRevenue: baseRev, netCash },
        firstYearGrowthGrid: [0.05, 0.10, 0.15, 0.20, 0.25],
        discountRateGrid: [0.06, 0.08, 0.10, 0.12, 0.14],
      }),
    [assumptions, baseRev, netCash],
  );

  const ccy = currency === 'CNY' ? '人民币' : currency;

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">DCF 内在价值估算 (2-stage)</h2>
          <p className="mt-0.5 text-[11px] text-gray-500">
            预测期 5 年 + 终值（Gordon Growth）· 折现 · 加净现金 · 单位{ccy}（亿元）
          </p>
        </div>
        <span className="rounded bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200">
          可调假设
        </span>
      </div>

      {/* Hero 数字 */}
      <div className="grid grid-cols-1 gap-4 border-b border-gray-100 bg-gradient-to-b from-violet-50/60 to-white px-5 py-5 md:grid-cols-3">
        <div className="md:col-span-1">
          <div className="text-[11px] uppercase tracking-wide text-gray-500">股权价值估算</div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-gray-900">
            {fmtYi(result.equityValue)} <span className="text-base font-normal text-gray-500">亿</span>
          </div>
          <div className="mt-1 text-[11px] text-gray-500">
            = EV {fmtYi(result.enterpriseValue)} 亿 + 净现金 {fmtYi(netCash)} 亿
          </div>
        </div>
        <div className="md:col-span-2 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded bg-white p-3 ring-1 ring-gray-200">
            <div className="text-[11px] text-gray-500">预测期 FCF 现值合计</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900">
              {fmtYi(result.forecastPvSum)} 亿
            </div>
          </div>
          <div className="rounded bg-white p-3 ring-1 ring-gray-200">
            <div className="text-[11px] text-gray-500">终值现值</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900">
              {fmtYi(result.terminalValuePv)} 亿
            </div>
            <div className="mt-0.5 text-[10px] text-gray-400">
              (终值 {fmtYi(result.terminalValue)} × 折现)
            </div>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700">
          {result.warnings.map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}

      {/* 假设输入 */}
      <div className="border-b border-gray-100 px-5 py-4">
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
          假设（拖动数字调整 → 结果实时更新）
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Row label="起始营收（百万）" hint={paramsRationale.baseRevenue}>
              <NumInput value={baseRev} onChange={setBaseRev} step={1000} />
            </Row>
            {growths.map((g, i) => (
              <Row key={i} label={`Y${i + 1} 增长率`} hint={i === 0 ? paramsRationale.growthRates : '可独立调'}>
                <PctInput
                  value={g}
                  onChange={(v) => setGrowths((prev) => prev.map((x, j) => (j === i ? v : x)))}
                />
              </Row>
            ))}
          </div>
          <div className="space-y-2">
            <Row label="FCF Margin" hint={paramsRationale.fcfMargin}>
              <PctInput value={fcfMargin} onChange={setFcfMargin} step={0.1} />
            </Row>
            <Row label="WACC (折现率)" hint="科技公司常见 8-12%，风险越高越大">
              <PctInput value={discountRate} onChange={setDiscountRate} step={0.5} />
            </Row>
            <Row label="永续增长率 g∞" hint="必须 < WACC；通常 2-4%">
              <PctInput value={perpetualGrowth} onChange={setPerpetualGrowth} step={0.5} />
            </Row>
            <Row label="净现金（百万）" hint={paramsRationale.netCash}>
              <NumInput value={netCash} onChange={setNetCash} step={1000} />
            </Row>
          </div>
        </div>
      </div>

      {/* 年度预测明细 */}
      <div className="border-b border-gray-100">
        <div className="px-5 pt-3 text-xs font-medium uppercase tracking-wide text-gray-500">
          预测期明细
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Year</th>
              <th className="px-3 py-2 text-right font-medium">增长率</th>
              <th className="px-3 py-2 text-right font-medium">营收 (亿)</th>
              <th className="px-3 py-2 text-right font-medium">FCF (亿)</th>
              <th className="px-3 py-2 text-right font-medium">折现因子</th>
              <th className="px-3 py-2 text-right font-medium">FCF 现值 (亿)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {result.rows.map((r) => (
              <tr key={r.yearOffset}>
                <td className="px-4 py-2 font-medium text-gray-900">Y{r.yearOffset}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtPct(r.growthRate)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtYi(r.revenue)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtYi(r.fcf)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                  {r.discountFactor.toFixed(3)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">
                  {fmtYi(r.fcfPv)}
                </td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-medium">
              <td colSpan={5} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-gray-500">
                预测期合计
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                {fmtYi(result.forecastPvSum)} 亿
              </td>
            </tr>
            <tr className="bg-gray-50">
              <td colSpan={5} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-gray-500">
                + 终值现值 (Gordon: 末年 FCF × (1+g∞) / (WACC − g∞), 再折现)
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                {fmtYi(result.terminalValuePv)} 亿
              </td>
            </tr>
            <tr className="bg-gray-100 font-semibold">
              <td colSpan={5} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-gray-700">
                = 企业价值 EV
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                {fmtYi(result.enterpriseValue)} 亿
              </td>
            </tr>
            <tr className="bg-gray-100">
              <td colSpan={5} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-gray-700">
                + 净现金
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                {fmtYi(netCash)} 亿
              </td>
            </tr>
            <tr className="bg-violet-100 font-bold">
              <td colSpan={5} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-violet-900">
                = 股权价值估算
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-violet-900">
                {fmtYi(result.equityValue)} 亿
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 敏感性矩阵 */}
      <div className="px-5 py-4">
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
          敏感性矩阵：股权价值 (亿{ccy}) — 首年增长率 × WACC
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="px-2 py-1 text-left font-medium text-gray-500">
                  增长率 \ WACC
                </th>
                {sensitivity[0].map((c) => (
                  <th key={c.discountRate} className="px-2 py-1 text-right font-medium text-gray-700">
                    {fmtPct(c.discountRate)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sensitivity.map((row, ri) => (
                <tr key={ri}>
                  <td className="px-2 py-1 font-medium text-gray-700">
                    {fmtPct(row[0].firstYearGrowth)}
                  </td>
                  {row.map((cell, ci) => {
                    const isBase =
                      Math.abs(cell.firstYearGrowth - growths[0]) < 0.001 &&
                      Math.abs(cell.discountRate - discountRate) < 0.001;
                    return (
                      <td
                        key={ci}
                        className={`px-2 py-1 text-right tabular-nums ${
                          isBase
                            ? 'bg-violet-100 font-semibold text-violet-900 ring-1 ring-violet-300'
                            : 'text-gray-700'
                        }`}
                      >
                        {fmtYi(cell.equityValue)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[11px] text-gray-500">
          紫色 = 当前假设；左下角 = 悲观（低增长 + 高 WACC），右上角 = 乐观（高增长 + 低 WACC）
        </div>
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex-1">
        <div className="text-xs font-medium text-gray-700">{label}</div>
        {hint && <div className="text-[10px] text-gray-500">{hint}</div>}
      </div>
      {children}
    </div>
  );
}
