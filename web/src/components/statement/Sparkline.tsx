interface SparklineProps {
  values: Array<number | null>;
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({ values, width = 96, height = 22, className = '' }: SparklineProps) {
  const points = values
    .map((v, i) => ({ i, v }))
    .filter((p): p is { i: number; v: number } => p.v !== null && Number.isFinite(p.v));

  if (points.length < 2) {
    return <svg width={width} height={height} className={className} aria-hidden="true" />;
  }

  const min = Math.min(...points.map((p) => p.v));
  const max = Math.max(...points.map((p) => p.v));
  const range = max - min || Math.abs(max) || 1;
  const padX = 2;
  const padY = 3;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const n = values.length - 1 || 1;

  const xy = points.map((p) => ({
    x: padX + (p.i / n) * innerW,
    y: padY + (1 - (p.v - min) / range) * innerH,
  }));

  const path = xy.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = xy[xy.length - 1];
  const first = xy[0];
  const trendUp = points[points.length - 1].v >= points[0].v;
  // 与全站 tokens 一致：绿涨 #0ECB81 / 红跌 #F6465D（币安原版）
  const stroke = trendUp ? '#0ECB81' : '#F6465D';
  const fill = trendUp ? 'rgba(14, 203, 129, 0.12)' : 'rgba(246, 70, 93, 0.12)';
  const areaPath = `${path} L${last.x.toFixed(1)},${height - padY} L${first.x.toFixed(1)},${height - padY} Z`;

  return (
    <svg width={width} height={height} className={className} aria-hidden="true">
      <path d={areaPath} fill={fill} stroke="none" />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="1.8" fill={stroke} />
    </svg>
  );
}
