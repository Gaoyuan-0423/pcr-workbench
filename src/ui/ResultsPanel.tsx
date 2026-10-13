import { useMemo, useRef, useState } from 'react';
import type { AnalysisOutput } from '../core/types';
import { formatP } from '../core/stats';
import {
  downloadCsv,
  downloadSvg,
  downloadSvgAsPng,
  downloadWorkbook,
  buildWorkbook,
  resultAoa,
} from '../core/export';
import ChartSvg, { type ChartBar } from './ChartSvg';

interface Props {
  out: AnalysisOutput;
  fileName: string;
  rows: import('../core/analysis').AnalysisRow[];
  flags: import('../core/types').QcFlags;
}

export default function ResultsPanel({ out, fileName, rows, flags }: Props) {
  const genes = useMemo(() => [...new Set(out.results.map((r) => r.target))], [out.results]);
  const [gene, setGene] = useState(genes[0] ?? '');
  const svgRef = useRef<SVGSVGElement>(null);

  const activeGene = genes.includes(gene) ? gene : genes[0] ?? '';
  const geneResults = out.results.filter((r) => r.target === activeGene);

  const bars: ChartBar[] = geneResults.map((r) => ({
    sample: r.sample,
    fcMean: r.fcMean,
    fcSd: r.fcSd,
    isControl: r.isControl,
    significance: r.significance,
  }));

  function baseName(): string {
    return (fileName.replace(/\.[^.]+$/, '') || 'pcr-workbench') + `-${activeGene || 'results'}`;
  }

  function exportExcel() {
    const wb = buildWorkbook(out, rows, flags, {
      fileName,
      refGenes: out.refGenesUsed,
      controlSamples: out.controlSamples,
    });
    downloadWorkbook(wb, baseName() + '.xlsx');
  }

  function exportPng() {
    const svg = svgRef.current;
    if (!svg) return;
    void downloadSvgAsPng(svg, baseName() + '.png').catch((e) => alert(String(e)));
  }

  return (
    <div>
      {out.warnings.length > 0 && (
        <div className="warning-banner">
          {out.warnings.map((w, i) => (
            <div key={i}>⚠️ {w}</div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>
          ΔΔCt 结果表
          <span className="hint">Livak 2^-ΔΔCt · 统计基于每个生物学重复的 ΔCt</span>
        </h2>
        <div className="results-toolbar">
          <div className="gene-tabs" role="tablist" aria-label="选择基因">
            {genes.map((g) => (
              <button key={g} className={g === activeGene ? 'on' : ''} onClick={() => setGene(g)}>
                {g}
              </button>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          <button className="primary" onClick={exportExcel}>
            导出 Excel（多表，含 ΔΔCt）
          </button>
          <button onClick={() => downloadCsv(resultAoa(out), baseName() + '.csv')}>导出结果 CSV</button>
        </div>

        <div className="preview-wrap" style={{ maxHeight: 420 }}>
          <table className="results">
            <thead>
              <tr>
                <th>样本</th>
                <th>组别</th>
                <th>n</th>
                <th>平均 Cq</th>
                <th>内参 Cq</th>
                <th>ΔCt</th>
                <th>ΔΔCt</th>
                <th>Fold Change</th>
                <th>p 值（总体）</th>
                <th>Dunnett p</th>
                <th>显著性</th>
                <th>统计方法</th>
              </tr>
            </thead>
            <tbody>
              {geneResults.map((r) => (
                <tr key={r.sample + r.target} className={r.isControl ? 'ctrl' : ''}>
                  <td>
                    {r.isControl && '对照 · '}
                    {r.sample}
                  </td>
                  <td>{r.group || '—'}</td>
                  <td>{r.n}</td>
                  <td>{fmt(r.meanCq)}</td>
                  <td>{fmt(r.refCq)}</td>
                  <td>{fmt(r.deltaCt)}</td>
                  <td>{fmt(r.ddCt)}</td>
                  <td>
                    {fmt(r.foldChange)}±{fmt(r.fcSd)}
                  </td>
                  <td>{formatP(r.pValue)}</td>
                  <td>{formatP(r.pAdjusted)}</td>
                  <td className="sig">{r.significance || '—'}</td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--muted-text)' }}>{r.statMethod || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card chart-box">
        <h2>
          柱状图（{activeGene || '—'}）
          <span className="hint">均值 ± SD；星号为 vs 对照的校正显著性（多组时 Dunnett）</span>
        </h2>
        <ChartSvg gene={activeGene} bars={bars} svgRef={svgRef} />
        <div className="row-actions">
          <button onClick={() => svgRef.current && downloadSvg(svgRef.current, baseName() + '.svg')}>
            导出 SVG（矢量）
          </button>
          <button className="primary" onClick={exportPng}>
            导出 PNG
          </button>
        </div>
      </div>
    </div>
  );
}

function fmt(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return String(Math.round(v * 1000) / 1000);
}
