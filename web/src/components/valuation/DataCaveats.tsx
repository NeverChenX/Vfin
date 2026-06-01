import type { ValuationConfig } from '@/types/valuation';

interface Props {
  cfg: ValuationConfig;
}

export function DataCaveats({ cfg }: Props) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
      <div className="font-semibold">⚠ 数据时点 / 局限说明</div>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          SOTP 整体截止日：<span className="font-mono">{cfg.sotpAsOf}</span>
        </li>
        {cfg.netCash !== null && (
          <li>
            净现金时点：<span className="font-mono">{cfg.netCashAsOf}</span>（口径：现金 + 短期投资 − 总有息负债）
          </li>
        )}
        <li>Peer 倍数 asOf 详见每行展开</li>
        <li>
          本模型 <strong>不</strong>包含：控股折价、未上市资产、税务影响、特殊持股结构
        </li>
        <li>结果仅供研究参考，不构成投资建议</li>
      </ul>
    </div>
  );
}
