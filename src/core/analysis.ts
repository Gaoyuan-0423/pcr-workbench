import type {
  AnalysisConfig,
  AnalysisOutput,
  ColumnMapping,
  QcFlags,
  SampleTargetResult,
} from './types';
import { mean, sd, oneWayAnova, significanceStars, welchTTest } from './stats';

export interface AnalysisRow {
  id: number;
  plate: string;
  well: string;
  sample: string;
  group: string;
  pairId: string;
  target: string;
  cq: number;
  excluded: boolean;
}

/** 从原始数据行 + 列映射抽取规范行。 */
export function extractRows(rows: string[][], mapping: ColumnMapping): AnalysisRow[] {
  const out: AnalysisRow[] = [];
  rows.forEach((row, idx) => {
    const id = idx + 1;
    out.push({
      id,
      plate: mapping.plate >= 0 ? (row[mapping.plate] ?? '').trim() : '',
      well: mapping.well >= 0 ? (row[mapping.well] ?? '').trim() : '',
      sample: mapping.sample >= 0 ? (row[mapping.sample] ?? '').trim() : '',
      group: mapping.group >= 0 ? (row[mapping.group] ?? '').trim() : '',
      pairId: mapping.pairId >= 0 ? (row[mapping.pairId] ?? '').trim() : '',
      target: mapping.target >= 0 ? (row[mapping.target] ?? '').trim() : '',
      cq: mapping.cq >= 0 ? Number.parseFloat((row[mapping.cq] ?? '').replace(',', '.')) : NaN,
      excluded: false,
    });
  });
  return out;
}

/**
 * ΔΔCt（Livak 2^-ΔΔCt）引擎。
 * 1. 同样本同基因复孔聚均值；
 * 2. 多内参基因池化（每样本取可用内参 Cq 均值）；
 * 3. 按每个生物学重复计算 ΔCt（个体值保留，用于统计）；
 * 4. ΔΔCt = 个体 ΔCt − 对照组 ΔCt 均值；FC = 2^-ΔΔCt；
 * 5. 统计：2 组 → 与对照 Welch t；>2 组 → 单因素 ANOVA（全体）。均在个体 ΔCt 上进行。
 */
export function analyzeDeltaDeltaCt(rows: AnalysisRow[], config: AnalysisConfig): AnalysisOutput {
  const warnings: string[] = [];
  const effective = rows.filter((r) => !r.excluded);

  // 1. 复孔聚合
  const agg = new Map<string, AnalysisRow[]>();
  for (const r of effective) {
    if (!r.sample || !r.target || !Number.isFinite(r.cq)) continue;
    const key = `${r.sample}||${r.target}`;
    const arr = agg.get(key);
    if (arr) arr.push(r);
    else agg.set(key, [r]);
  }

  const samples = [...new Set(effective.map((r) => r.sample).filter(Boolean))].sort();
  const genes = [...new Set(effective.map((r) => r.target).filter(Boolean))].sort();
  const refGenes = config.refGenes.filter((g) => genes.includes(g));
  const targetGenes = genes.filter((g) => !refGenes.includes(g));
  const controls = config.controlSamples.filter((s) => samples.includes(s));

  if (refGenes.length === 0) warnings.push('未找到可用的内参基因（请确认基因名）。');
  if (controls.length === 0) warnings.push('未找到对照组样本（请确认对照组设置）。');
  const missingRef = config.refGenes.filter((g) => !genes.includes(g));
  if (missingRef.length) warnings.push(`内参基因未在数据中出现：${missingRef.join('、')}`);
  const missingCtrl = config.controlSamples.filter((s) => !samples.includes(s));
  if (missingCtrl.length) warnings.push(`对照组样本未在数据中出现：${missingCtrl.join('、')}`);

  interface AggEntry {
    sample: string;
    group: string;
    target: string;
    values: number[];
    wells: string[];
    meanCq: number;
    sdCq: number;
  }
  const entries = new Map<string, AggEntry>();
  for (const [key, rs] of agg) {
    const values = rs.map((r) => r.cq);
    entries.set(key, {
      sample: rs[0].sample,
      group: rs[0].group,
      target: rs[0].target,
      values,
      wells: rs.map((r) => r.well).filter(Boolean),
      meanCq: mean(values),
      sdCq: sd(values),
    });
  }

  // 2. 每样本内参池化
  const refCqBySample = new Map<string, number>();
  for (const s of samples) {
    const refs: number[] = [];
    for (const g of refGenes) {
      const e = entries.get(`${s}||${g}`);
      if (e) refs.push(e.meanCq);
    }
    if (refs.length) refCqBySample.set(s, mean(refs));
  }

  // 3. 个体 ΔCt
  interface DeltaEntry {
    sample: string;
    group: string;
    target: string;
    values: number[];
    wells: string[];
    meanCq: number;
    sdCq: number;
    refCq: number;
    deltaCtValues: number[];
    deltaCt: number;
    sdDelta: number;
  }
  const deltas = new Map<string, DeltaEntry>();
  for (const g of targetGenes) {
    for (const s of samples) {
      const e = entries.get(`${s}||${g}`);
      const refCq = refCqBySample.get(s);
      if (!e || refCq === undefined) continue;
      const deltaCtValues = e.values.map((v) => v - refCq);
      deltas.set(`${s}||${g}`, {
        sample: s,
        group: e.group,
        target: g,
        values: e.values,
        wells: e.wells,
        meanCq: e.meanCq,
        sdCq: e.sdCq,
        refCq,
        deltaCtValues,
        deltaCt: mean(deltaCtValues),
        sdDelta: sd(deltaCtValues),
      });
    }
  }

  // 4. 对照组 ΔCt 均值（按基因）
  const ctrlMeanByGene = new Map<string, number>();
  for (const g of targetGenes) {
    const vals: number[] = [];
    for (const s of controls) {
      const d = deltas.get(`${s}||${g}`);
      if (d) vals.push(...d.deltaCtValues);
    }
    if (vals.length) ctrlMeanByGene.set(g, mean(vals));
  }

  // 5. ΔΔCt / FC / 统计
  const results: SampleTargetResult[] = [];
  for (const g of targetGenes) {
    const ctrlMean = ctrlMeanByGene.get(g);
    if (ctrlMean === undefined) continue;
    const geneEntries = [...deltas.values()].filter((d) => d.target === g);
    const ctrlVals: number[] = [];
    for (const d of geneEntries) {
      if (controls.includes(d.sample)) ctrlVals.push(...d.deltaCtValues);
    }

    for (const d of geneEntries) {
      const isControl = controls.includes(d.sample);
      const fcValues = d.deltaCtValues.map((v) => Math.pow(2, -(v - ctrlMean)));
      const fcMean = mean(fcValues);
      const fcSd = sd(fcValues);
      let pValue: number | null = null;
      let statMethod = '';
      if (!isControl && ctrlVals.length >= 2) {
        if (geneEntries.length > 2 && samples.length > 2) {
          const groups = groupValuesBySample(geneEntries, controls);
          if (groups.length >= 2) {
            const a = oneWayAnova(groups);
            pValue = Number.isFinite(a.p) ? a.p : null;
            statMethod = `单因素 ANOVA（F=${a.f.toFixed(2)}, df=${a.df1}/${a.df2}）`;
          }
        }
        if (pValue == null) {
          const t = welchTTest(d.deltaCtValues, ctrlVals);
          pValue = Number.isFinite(t.p) ? t.p : null;
          statMethod = `Welch t（t=${t.t.toFixed(2)}, df=${Number.isFinite(t.df) ? t.df.toFixed(1) : '-'}）`;
        }
      }
      const deltaCt = mean(d.deltaCtValues);
      const ddCt = deltaCt - ctrlMean;
      results.push({
        sample: d.sample,
        group: d.group,
        target: g,
        isControl,
        excluded: false,
        n: d.values.length,
        values: d.values,
        wells: d.wells,
        meanCq: d.meanCq,
        sdCq: d.sdCq,
        refCq: d.refCq,
        deltaCt,
        deltaCtValues: d.deltaCtValues,
        ddCt,
        foldChange: Math.pow(2, -ddCt),
        fcValues,
        fcMean,
        fcSd,
        pValue,
        significance: isControl ? '' : significanceStars(pValue),
        statMethod,
      });
    }
  }

  results.sort((a, b) => {
    if (a.target !== b.target) return a.target.localeCompare(b.target);
    if (a.isControl !== b.isControl) return a.isControl ? -1 : 1;
    return a.sample.localeCompare(b.sample);
  });

  return { results, refGenesUsed: refGenes, controlSamples: controls, warnings };
}

function groupValuesBySample(entries: { sample: string; deltaCtValues: number[] }[], controls: string[]): number[][] {
  const bySample = new Map<string, number[]>();
  for (const d of entries) {
    if (controls.includes(d.sample)) continue;
    const arr = bySample.get(d.sample);
    if (arr) arr.push(...d.deltaCtValues);
    else bySample.set(d.sample, [...d.deltaCtValues]);
  }
  return [...bySample.values()].filter((g) => g.length >= 2);
}

/** QC 标记是否命中某行。 */
export function isFlagged(flags: QcFlags | undefined, id: number): boolean {
  return !!flags && (flags[id]?.length ?? 0) > 0;
}

const COMMON_REF_GENES = [
  'gapdh', 'actb', 'actin', 'b2m', 'hprt1', 'hprt', 'rplp0', 'tbp',
  'sdha', 'ywhaz', 'ubc', '18s', 'rpl13a', 'ppia', 'canx',
];

/** 按名字猜测常见内参基因（GAPDH/ACTB/18S 等），供配置步预勾选。 */
export function guessRefGenes(genes: string[]): string[] {
  return genes.filter((g) => {
    const n = g.toLowerCase().replace(/[\s_-]/g, '');
    return COMMON_REF_GENES.some((r) => n === r.replace(/[\s_-]/g, ''));
  });
}
