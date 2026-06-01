import type { SotpResult } from '@/types/valuation';
import { formatMoney } from '@/lib/valuation/format';

interface Props {
  result: SotpResult;
}

export function SensitivityStrip({ result }: Props) {
  // peer 倍数 ±20% → segmentsTotal 等比缩放
  const bear = result.segmentsTotal * 0.8 + (result.netCash ?? 0);
  const bull = result.segmentsTotal * 1.2 + (result.netCash ?? 0);
  const span = bull - bear;

  // 把 SOTP 基准、当前市值各自定位到 [bear, bull] 区间内的 0%-100%
  const sotpPos = span !== 0 ? ((result.sotpTotal - bear) / span) * 100 : 50;
  const mcPos = span !== 0 ? ((result.currentMarketCap - bear) / span) * 100 : 50;

  // 允许市值落在区间外（红色/绿色提示），但 clip 显示到边界
  const sotpClip = Math.max(0, Math.min(100, sotpPos));
  const mcClip = Math.max(0, Math.min(100, mcPos));
  const mcOutOfRange =
    result.currentMarketCap < bear || result.currentMarketCap > bull;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">敏感性分析</h2>
        <span className="text-xs text-gray-500">peer 中位数 ±20%</span>
      </div>
      <div className="relative mt-5 h-2 rounded-full bg-gradient-to-r from-red-200 via-gray-200 to-emerald-200">
        <div
          className="absolute -top-1 h-4 w-0.5 bg-gray-900"
          style={{ left: `${sotpClip}%` }}
          title={`SOTP 基准: ${formatMoney(result.sotpTotal, result.currency)}`}
        />
        <div
          className={`absolute -top-1 h-4 w-0.5 ${mcOutOfRange ? 'bg-red-600' : 'bg-blue-600'}`}
          style={{ left: `${mcClip}%` }}
          title={`当前市值: ${formatMoney(result.currentMarketCap, result.currency)}${
            mcOutOfRange ? ' (超出 ±20% 区间)' : ''
          }`}
        />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-gray-600 tabular-nums">
        <div>
          <div className="text-gray-500">Bear (−20%)</div>
          <div className="font-medium text-gray-900">{formatMoney(bear, result.currency)}</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500">SOTP 基准</div>
          <div className="font-medium text-gray-900">
            {formatMoney(result.sotpTotal, result.currency)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-gray-500">Bull (+20%)</div>
          <div className="font-medium text-gray-900">{formatMoney(bull, result.currency)}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-0.5 bg-gray-900" /> SOTP 基准
        </span>
        <span className="flex items-center gap-1">
          <span
            className={`inline-block h-3 w-0.5 ${mcOutOfRange ? 'bg-red-600' : 'bg-blue-600'}`}
          />{' '}
          当前市值{mcOutOfRange ? '（超出区间）' : ''}
        </span>
      </div>
    </div>
  );
}
