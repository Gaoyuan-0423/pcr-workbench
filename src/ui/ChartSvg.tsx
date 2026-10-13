import { useMemo } from 'react';

export interface ChartBar {
  sample: string;
  fcMean: number;
  fcSd: number;
  isControl: boolean;
  significance: string;
}

interface Props {
  gene: string;
  bars: ChartBar[];
  svgRef?: React.Ref<SVGSVGElement>;
}

const W = 860;
const H = 460;
const M = { top: 64, right: 28, bottom: 72, left: 84 };

/** 手写 SVG 柱状图：Fold Change ± SD，对照组灰色、星号标注显著性。 */
export default function ChartSvg({ gene, bars, svgRef }: Props) {
  const maxFc = useMemo(() => {
    let m = 0;
    for (const b of bars) m = Math.max(m, b.fcMean + (Number.isFinite(b.fcSd) ? b.fcSd : 0));
    return m > 0 ? m : 1;
  }, [bars]);

  const yMax = niceCeil(maxFc * 1.18);
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const yOf = (v: number) => M.top + plotH - (v / yMax) * plotH;
  const n = Math.max(bars.length, 1);
  const slot = plotW / n;
  const barW = Math.min(slot * 0.62, 64);

  const yTicks = useMemo(() => {
    const out: number[] = [];
    const step = niceCeil(yMax / 5);
    for (let v = 0; v <= yMax; v += step) out.push(v);
    return out;
  }, [yMax]);

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${gene} 柱状图`} xmlns="http://www.w3.org/2000/svg">
      <rect x={0} y={0} width={W} height={H} fill="#ffffff" />
      <text x={M.left} y={26} fontSize={17} fontWeight={700} fill="#1d2b32">
        {gene}
      </text>
      <text x={M.left} y={46} fontSize={12} fill="#5f7480">
        Relative expression · Fold Change (2^-ΔΔCt, mean ± SD)
      </text>

      {yTicks.map((v) => (
        <g key={v}>
          <line x1={M.left} x2={W - M.right} y1={yOf(v)} y2={yOf(v)} stroke={v === 0 ? '#1d2b32' : '#e4ebee'} strokeWidth={v === 0 ? 1.2 : 1} />
          <text x={M.left - 8} y={yOf(v) + 4} fontSize={11.5} fill="#5f7480" textAnchor="end">
            {formatTick(v)}
          </text>
        </g>
      ))}
      <line x1={M.left} x2={M.left} y1={M.top} y2={M.top + plotH} stroke="#1d2b32" strokeWidth={1.2} />

      {bars.map((b, i) => {
        const cx = M.left + slot * i + slot / 2;
        const x = cx - barW / 2;
        const y = yOf(Math.max(0, b.fcMean));
        const height = Math.max(0, M.top + plotH - y);
        const sd = Number.isFinite(b.fcSd) ? b.fcSd : 0;
        const yTop = yOf(b.fcMean + sd);
        const yBot = yOf(Math.max(0, b.fcMean - sd));
        const fill = b.isControl ? '#9fb3ba' : '#0e7c66';
        return (
          <g key={b.sample}>
            <rect x={x} y={y} width={barW} height={height} fill={fill} rx={2} />
            <line x1={cx} x2={cx} y1={yTop} y2={yBot} stroke="#1d2b32" strokeWidth={1.3} />
            <line x1={cx - barW * 0.22} x2={cx + barW * 0.22} y1={yTop} y2={yTop} stroke="#1d2b32" strokeWidth={1.3} />
            <line x1={cx - barW * 0.22} x2={cx + barW * 0.22} y1={yBot} y2={yBot} stroke="#1d2b32" strokeWidth={1.3} />
            {b.significance && b.significance !== 'ns' && (
              <text x={cx} y={yTop - 8} fontSize={15} fontWeight={700} textAnchor="middle" fill="#1d2b32">
                {b.significance}
              </text>
            )}
            {b.significance === 'ns' && (
              <text x={cx} y={yTop - 8} fontSize={11} textAnchor="middle" fill="#8a9aa3">
                ns
              </text>
            )}
            <text x={cx} y={H - M.bottom + 18} fontSize={11.5} textAnchor="middle" fill="#1d2b32">
              {b.sample.length > 14 ? b.sample.slice(0, 13) + '…' : b.sample}
            </text>
          </g>
        );
      })}
      <text x={22} y={M.top + plotH / 2} fontSize={12.5} fill="#1d2b32" textAnchor="middle" transform={`rotate(-90 22 ${M.top + plotH / 2})`}>
        Fold Change
      </text>
    </svg>
  );
}

function niceCeil(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (m * base >= v) return m * base;
  }
  return 10 * base;
}

function formatTick(v: number): string {
  if (v === 0) return '0';
  if (v >= 1000) return `${Math.round(v / 1000)}k`;
  return String(Math.round(v * 100) / 100);
}
