// 熔解曲线 QC：从温度-荧光原始曲线（RDML mdp）检测熔解峰。
//   1. 按 ΔT 归一一阶差分（≈ −dF/dT，荧光下降最快的温度 = 熔解峰）
//   2. 滑动平均平滑
//   3. 局部极小（= 负导数峰）超过相对阈值计为峰；两峰至少间隔 MIN_PEAK_SEP °C
// 输出峰数与主峰 Tm，供"单峰 ✓ / 多峰 ⚠️（非特异扩增）/ 无峰"三级判定。

export interface MeltPoint {
  tmp: number;
  fluor: number;
}

export interface MeltCurveQc {
  peaks: number;
  /** 主峰 Tm（最高峰），无峰为 null */
  tm: number | null;
}

const MIN_PEAK_SEP = 3; // °C
const SMOOTH_WINDOW = 3;
/** 峰温下限：低于此温度的"峰"在 SYBR 工作流中几乎都是基线/噪声 */
const MIN_PEAK_TMP = 60; // °C
/** 峰显著性：|导数| ≥ 5 × 中位|导数|（噪声尺度），且 ≥ 主峰幅值的 15% */
const NOISE_FACTOR = 5;
const REL_THRESHOLD = 0.15;

export function analyzeMeltCurve(points: MeltPoint[]): MeltCurveQc {
  const pts = points
    .filter((p) => Number.isFinite(p.tmp) && Number.isFinite(p.fluor))
    .sort((a, b) => a.tmp - b.tmp);
  if (pts.length < 5) return { peaks: 0, tm: null };

  // 一阶差分（按实际 ΔT 归一）
  const dev: { tmp: number; d: number }[] = [];
  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i].tmp - pts[i - 1].tmp;
    if (dt <= 0) continue;
    dev.push({ tmp: (pts[i].tmp + pts[i - 1].tmp) / 2, d: (pts[i].fluor - pts[i - 1].fluor) / dt });
  }
  if (dev.length < 3) return { peaks: 0, tm: null };

  // 滑动平均平滑
  const sm = dev.map((_, i) => {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - SMOOTH_WINDOW + 1); j <= Math.min(dev.length - 1, i + SMOOTH_WINDOW - 1); j++) {
      s += dev[j].d;
      c++;
    }
    return { tmp: dev[i].tmp, d: s / c };
  });

  // 局部极小 = 熔解峰（荧光骤降处）
  const minima: { tmp: number; d: number }[] = [];
  for (let i = 1; i < sm.length - 1; i++) {
    if (sm[i].d < sm[i - 1].d && sm[i].d <= sm[i + 1].d && sm[i].tmp >= MIN_PEAK_TMP) minima.push(sm[i]);
  }
  if (minima.length === 0) return { peaks: 0, tm: null };

  const maxAbs = Math.max(...minima.map((m) => Math.abs(m.d)));
  if (maxAbs <= 0) return { peaks: 0, tm: null };
  // 噪声尺度：全导数的中位绝对值（基线波动水平）
  const absAll = sm.map((s) => Math.abs(s.d)).sort((a, b) => a - b);
  const medianAbs = absAll[Math.floor(absAll.length / 2)];
  const threshold = Math.max(medianAbs * NOISE_FACTOR, maxAbs * REL_THRESHOLD);
  const significant = minima.filter((m) => Math.abs(m.d) >= threshold);

  // 合并相距过近的峰（保留幅值更大的）
  const merged: { tmp: number; d: number }[] = [];
  for (const m of significant.sort((a, b) => a.tmp - b.tmp)) {
    const last = merged[merged.length - 1];
    if (last && m.tmp - last.tmp < MIN_PEAK_SEP) {
      if (Math.abs(m.d) > Math.abs(last.d)) merged[merged.length - 1] = m;
    } else {
      merged.push(m);
    }
  }
  if (merged.length === 0) return { peaks: 0, tm: null };

  const main = merged.reduce((a, b) => (Math.abs(b.d) > Math.abs(a.d) ? b : a));
  return { peaks: merged.length, tm: Math.round(main.tmp * 10) / 10 };
}

// ── 按"样本 × 基因"汇总熔解 QC（输入为 RDML 解析出的原始曲线）──

export interface RdmlMeltCurve {
  plate: string;
  well: string;
  sample: string;
  target: string;
  points: MeltPoint[];
}

export interface MeltWellQc {
  sample: string;
  well: string;
  peaks: number;
  tm: number | null;
}

export interface MeltGeneSummary {
  gene: string;
  checked: number;
  single: number;
  none: number;
  multi: MeltWellQc[];
}

/** 每基因汇总：单峰=通过、多峰=非特异、无峰=未扩增或无产物。 */
export function summarizeMeltByGene(curves: RdmlMeltCurve[]): MeltGeneSummary[] {
  const byGene = new Map<string, MeltWellQc[]>();
  for (const c of curves) {
    if (c.points.length < 5) continue;
    const qc = analyzeMeltCurve(c.points);
    const arr = byGene.get(c.target) ?? [];
    arr.push({ sample: c.sample, well: c.well, peaks: qc.peaks, tm: qc.tm });
    byGene.set(c.target, arr);
  }
  const out: MeltGeneSummary[] = [];
  for (const [gene, wells] of byGene) {
    out.push({
      gene,
      checked: wells.length,
      single: wells.filter((w) => w.peaks === 1).length,
      none: wells.filter((w) => w.peaks === 0).length,
      multi: wells.filter((w) => w.peaks > 1),
    });
  }
  return out.sort((a, b) => a.gene.localeCompare(b.gene));
}
