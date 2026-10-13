import { describe, expect, it } from 'vitest';
import { analyzeDeltaDeltaCt, extractRows } from './analysis';
import { DEFAULT_QC, emptyMapping } from './types';

// 手算基准：GAPDH 内参（效率 100%，E=2），LDHA 目标（效率 200%，E=3）
// 对照 C1：GAPDH 20,20；LDHA 20,20 —— Ct_T,对照均值=20，Ct_R,对照均值=20
// 处理 T1：GAPDH 20,20；LDHA 19,19
// Pfaffl：FC = 3^(20−19) / 2^(20−20) = 3；Livak 会给 2^1 = 2
function buildRows(data: (string | number)[][]) {
  return extractRows(data.map((r) => r.map(String)), {
    ...emptyMapping(),
    sample: 0,
    target: 1,
    cq: 2,
  });
}
const DATA = [
  ['C1', 'GAPDH', 20], ['C1', 'GAPDH', 20],
  ['T1', 'GAPDH', 20], ['T1', 'GAPDH', 20],
  ['C1', 'LDHA', 20], ['C1', 'LDHA', 20],
  ['T1', 'LDHA', 19], ['T1', 'LDHA', 19],
];
const base = { controlSamples: ['C1'], refGenes: ['GAPDH'], qc: DEFAULT_QC };

describe('Pfaffl 效率校正', () => {
  it('手算对照：目标 E=200% 时 FC = 3（Livak 会给 2）', () => {
    const rows = buildRows(DATA);
    const out = analyzeDeltaDeltaCt(rows, { ...base, efficiencies: { LDHA: 200 } });
    expect(out.effMode).toBe(true);
    const t1 = out.results.find((r) => r.sample === 'T1')!;
    expect(t1.foldChange).toBeCloseTo(3, 8);
    expect(t1.fcValues.every((v) => Math.abs(v - 3) < 1e-9)).toBe(true);
    expect(t1.statMethod).toContain('Pfaffl');
    const c1 = out.results.find((r) => r.isControl)!;
    expect(c1.foldChange).toBeCloseTo(1, 8);
  });

  it('全部 100% 时严格退化为 Livak', () => {
    const rows = buildRows(DATA);
    const out = analyzeDeltaDeltaCt(rows, base);
    expect(out.effMode).toBe(false);
    const t1 = out.results.find((r) => r.sample === 'T1')!;
    expect(t1.foldChange).toBeCloseTo(2, 8);
    expect(t1.statMethod).not.toContain('Pfaffl');
  });

  it('内参效率参与校正：E 换算为 1+pct/100（150% → E=2.5）', () => {
    // 参照指数 = Ct_R,对照均值 − refCq = 20 − 20 = 0 → E_R 不影响该数据；FC = 2^1 / E_R^0 = 2
    const rows = buildRows(DATA);
    const out = analyzeDeltaDeltaCt(rows, { ...base, efficiencies: { GAPDH: 150 } });
    expect(out.effMode).toBe(true);
    const t1 = out.results.find((r) => r.sample === 'T1')!;
    expect(t1.foldChange).toBeCloseTo(2, 8);
  });

  it('组合效率 + 参照指数非零：FC = 3^1 / 2.5^0.5', () => {
    // T1 的 GAPDH 20,20,19,19 → refCq=19.5，参照指数 = 20 − 19.5 = 0.5；E_R = 1+150/100 = 2.5
    const rows = buildRows([
      ...DATA,
      ['T1', 'GAPDH', 19], ['T1', 'GAPDH', 19],
    ]);
    const out = analyzeDeltaDeltaCt(rows, { ...base, efficiencies: { LDHA: 200, GAPDH: 150 } });
    const t1 = out.results.find((r) => r.sample === 'T1')!;
    expect(t1.foldChange).toBeCloseTo(3 / Math.sqrt(2.5), 8);
  });

  it('配置缺省时等价于全部 100%', () => {
    const rows = buildRows(DATA);
    const a = analyzeDeltaDeltaCt(rows, base);
    const b = analyzeDeltaDeltaCt(rows, { ...base, efficiencies: { GAPDH: 100, LDHA: 100 } });
    expect(b.effMode).toBe(false);
    expect(a.results.map((r) => r.foldChange)).toEqual(b.results.map((r) => r.foldChange));
  });
});
