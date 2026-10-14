// 图表定制：横纵坐标、标题/副标题、误差棒类型、P 值/星号显示、配色、尺寸、多基因分段。

export interface ChartOptions {
  title: string;
  subtitle: string;
  yLabel: string;
  xLabel: string;
  /** Y 轴范围；空 = 自动 */
  yMin: number | null;
  yMax: number | null;
  /** Y 轴刻度类型；对数用于 FC 跨数量级的场景 */
  yScale: 'linear' | 'log2' | 'log10';
  /** 截断 Y 轴：上限以下正常、以上裁剪并画截断标记（上限留空时自动取次高值） */
  axisBreak: boolean;
  /** 误差棒类型 */
  errorBar: 'sd' | 'sem' | 'none';
  /** 显著性标注：星号 / p 值 / 两者 / 不显示 */
  showP: 'stars' | 'p' | 'both' | 'none';
  /** 对照柱颜色 */
  controlColor: string;
  /** 处理组柱颜色（循环用于多处理组） */
  groupColor: string;
  /** 输出尺寸（px） */
  width: number;
  height: number;
  /** 柱子显示名覆盖：原始样本名 → 图上名称 */
  labelOverrides: Record<string, string>;
}

export const DEFAULT_CHART_OPTIONS: ChartOptions = {
  title: '',
  subtitle: 'Relative expression · Fold Change (mean ± SD)',
  yLabel: 'Fold Change',
  xLabel: '',
  yMin: 0,
  yMax: null,
  yScale: 'linear',
  axisBreak: false,
  errorBar: 'sd',
  showP: 'stars',
  controlColor: '#9fb3ba',
  groupColor: '#0e7c66',
  width: 860,
  height: 460,
  labelOverrides: {},
};

/** 单值校正的展示文本：星号 / p 值 / 两者 / 无。 */
export function annotationFor(
  mode: ChartOptions['showP'],
  p: number | null,
  stars: string,
): string | null {
  if (mode === 'none') return null;
  if (mode === 'stars') return stars && stars !== 'ns' ? stars : stars === 'ns' ? 'ns' : null;
  if (mode === 'p') return p != null ? 'p=' + p.toFixed(3) : null;
  // both
  const star = stars && stars !== 'ns' ? stars : '';
  const pv = p != null ? 'p=' + p.toFixed(3) : '';
  return (star + (star && pv ? ' ' : '') + pv) || null;
}

/** 均值与误差棒（SD 或 SEM）。 */
export function meanAndError(
  values: number[],
  mode: ChartOptions['errorBar'],
): { mean: number; err: number } {
  if (values.length === 0) return { mean: NaN, err: NaN };
  const m = values.reduce((s, x) => s + x, 0) / values.length;
  if (mode === 'none' || values.length < 2) return { mean: m, err: 0 };
  let v = 0;
  for (const x of values) v += (x - m) * (x - m);
  const sd = Math.sqrt(v / (values.length - 1));
  return { mean: m, err: mode === 'sem' ? sd / Math.sqrt(values.length) : sd };
}
