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
  const mcPos =
    result.currentMarketCap !== null && span !== 0
      ? ((result.currentMarketCap - bear) / span) * 100
      : null;

  // 允许市值落在区间外（红色/绿色提示），但 clip 显示到边界
  const sotpClip = Math.max(0, Math.min(100, sotpPos));
  const mcClip = mcPos === null ? null : Math.max(0, Math.min(100, mcPos));
  const mcOutOfRange =
    result.currentMarketCap !== null &&
    (result.currentMarketCap < bear || result.currentMarketCap > bull);

  return (
    <div className="rounded-lg border border-[var(--color-border-base)] bg-[var(--color-bg-elev1)] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">敏感性分析</h2>
        <span className="text-xs text-[var(--color-text-tertiary)]">peer 中位数 ±20%</span>
      </div>
      <div className="relative mt-5 h-2 rounded-full bg-gradient-to-r from-[rgba(246,70,93,0.45)] via-[rgba(240,185,11,0.35)] to-[rgba(14,203,129,0.45)]">
        <div
          className="absolute -top-1 h-4 w-0.5 bg-[var(--color-brand)]"
          style={{ left: `${sotpClip}%` }}
          title={`推算估值基准: ${formatMoney(result.sotpTotal, result.currency)}`}
        />
        {mcClip !== null && (
          <div
            className={`absolute -top-1 h-4 w-0.5 ${mcOutOfRange ? 'bg-[var(--color-down)]' : 'bg-[var(--color-up)]'}`}
            style={{ left: `${mcClip}%` }}
            title={`当前市值: ${formatMoney(result.currentMarketCap, result.currency)}${
              mcOutOfRange ? ' (超出 ±20% 区间)' : ''
            }`}
          />
        )}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-[var(--color-text-secondary)] tabular-nums">
        <div>
          <div className="text-[var(--color-text-tertiary)]">Bear (−20%)</div>
          <div className="font-medium text-[var(--color-text-primary)]">{formatMoney(bear, result.currency)}</div>
        </div>
        <div className="text-center">
          <div className="text-[var(--color-text-tertiary)]">推算估值基准</div>
          <div className="font-medium text-[var(--color-brand)]">
            {formatMoney(result.sotpTotal, result.currency)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[var(--color-text-tertiary)]">Bull (+20%)</div>
          <div className="font-medium text-[var(--color-text-primary)]">{formatMoney(bull, result.currency)}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11px] text-[var(--color-text-tertiary)]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-0.5 bg-[var(--color-brand)]" /> 推算估值基准
        </span>
        {result.currentMarketCap !== null ? (
          <span className="flex items-center gap-1">
            <span
              className={`inline-block h-3 w-0.5 ${mcOutOfRange ? 'bg-[var(--color-down)]' : 'bg-[var(--color-up)]'}`}
            />{' '}
            当前市值{mcOutOfRange ? '（超出区间）' : ''}
          </span>
        ) : (
          <span>缺少实际市值，暂不显示市值刻度</span>
        )}
      </div>
    </div>
  );
}
