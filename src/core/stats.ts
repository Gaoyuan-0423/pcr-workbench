// 统计数值实现：Welch t 检验与单因素 ANOVA。
// p 值经由正则化不完全 beta 函数（Lanczos lgamma + 连分式），对照标准统计表验证。

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** 样本标准差（n-1）；n<2 返回 NaN。 */
export function sd(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return NaN;
  const m = mean(xs);
  let v = 0;
  for (const x of xs) v += (x - m) * (x - m);
  return Math.sqrt(v / (n - 1));
}

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

export function lgamma(x: number): number {
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  const z = x - 1;
  let a = LANCZOS[0];
  const t = z + 7.5;
  for (let i = 1; i < LANCZOS.length; i++) a += LANCZOS[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 300;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** 正则化不完全贝塔函数 I_x(a, b)。 */
export function betaInc(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Student t 分布的单侧累积概率 P(T ≤ t)。 */
export function studentTCdf(t: number, df: number): number {
  if (df <= 0) return NaN;
  const x = df / (df + t * t);
  const p = 0.5 * betaInc(df / 2, 0.5, x);
  return t > 0 ? 1 - p : p;
}

/** F 分布的累积概率 P(F ≤ f)。 */
export function fCdf(f: number, df1: number, df2: number): number {
  if (f < 0 || df1 <= 0 || df2 <= 0) return NaN;
  const x = (df1 * f) / (df1 * f + df2);
  return betaInc(df1 / 2, df2 / 2, x);
}

export interface TTestResult {
  t: number;
  df: number;
  p: number;
}

/** Welch t 检验（双侧，方差不齐），返回 t 统计量、Welch–Satterthwaite 自由度与 p 值。 */
export function welchTTest(a: number[], b: number[]): TTestResult {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 < 2 || n2 < 2) return { t: NaN, df: NaN, p: NaN };
  const m1 = mean(a);
  const m2 = mean(b);
  const v1 = sd(a) ** 2;
  const v2 = sd(b) ** 2;
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  if (!Number.isFinite(se) || se === 0) return { t: 0, df: n1 + n2 - 2, p: 1 };
  const t = (m1 - m2) / se;
  const num = (v1 / n1 + v2 / n2) ** 2;
  const den = (v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1);
  const df = den > 0 ? num / den : n1 + n2 - 2;
  const p = 2 * (1 - studentTCdf(Math.abs(t), df));
  return { t, df, p: Math.min(1, Math.max(0, p)) };
}

export interface AnovaResult {
  f: number;
  df1: number;
  df2: number;
  p: number;
}

/** 单因素 ANOVA；组数 <2 或总样本 ≤ 组数时返回 NaN。 */
export function oneWayAnova(groups: number[][]): AnovaResult {
  const gs = groups.filter((g) => g.length > 0);
  const k = gs.length;
  const n = gs.reduce((s, g) => s + g.length, 0);
  if (k < 2 || n <= k) return { f: NaN, df1: NaN, df2: NaN, p: NaN };
  const all = gs.flat();
  const grand = mean(all);
  let ssb = 0;
  let ssw = 0;
  for (const g of gs) {
    const m = mean(g);
    ssb += g.length * (m - grand) * (m - grand);
    for (const x of g) ssw += (x - m) * (x - m);
  }
  const df1 = k - 1;
  const df2 = n - k;
  const msb = ssb / df1;
  const msw = ssw / df2;
  if (msw === 0) return { f: 0, df1, df2, p: 1 };
  const f = msb / msw;
  const p = 1 - fCdf(f, df1, df2);
  return { f, df1, df2, p: Math.min(1, Math.max(0, p)) };
}

export function significanceStars(p: number | null): string {
  if (p == null || !Number.isFinite(p)) return '';
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return 'ns';
}

export function formatP(p: number | null): string {
  if (p == null || !Number.isFinite(p)) return '-';
  if (p < 0.0001) return '<0.0001';
  return p.toFixed(4);
}
