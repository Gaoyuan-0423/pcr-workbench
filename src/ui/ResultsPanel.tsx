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
  autoReport?: import('../core/auto').QualityReport | null;
  guessBasis?: string;
  autoMelt?: import('../core/melt').MeltGeneSummary[];
}

const SEVERITY_LABEL: Record<string, { zh: string; cls: string }> = {
  error: { zh: '严重', cls: 'sev-error' },
  warning: { zh: '警告', cls: 'sev-warning' },
  info: { zh: '提示', cls: 'sev-info' },
};

export default function ResultsPanel({ out, fileName, rows, flags, autoReport, guessBasis, autoMelt }: Props) {
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
      efficiencies: out.efficiencies,
      melt: autoMelt,
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
      {autoReport && (
        <div className="card report-card">
          <div className="report-head">
            <div
              className="score-ring"
              style={{ backgroundImage: `conic-gradient(${autoReport.score >= 85 ? '#16a34a' : autoReport.score >= 60 ? '#d97706' : '#dc2626'} ${autoReport.score * 1}%, #e8eef0 0)` }}
            >
              <span className="score-num">{autoReport.score}</span>
              <span className="score-cap">质量分</span>
            </div>
            <div className="report-summary">
              <h2 style={{ marginBottom: 4 }}>🪄 一键智能分析报告</h2>
              <p>{autoReport.summary}</p>
              {guessBasis && (
                <p className="hint-line">实验配置为自动推断（{guessBasis}）。可在第 3 步调整后重新计算。</p>
              )}
            </div>
          </div>
          {autoReport.issues.length > 0 && (
            <div className="report-section">
              <strong>发现的问题（{autoReport.issues.length}）</strong>
              <ul className="issue-list">
                {autoReport.issues.map((i, idx) => (
                  <li key={idx} className={SEVERITY_LABEL[i.severity]?.cls}>
                    <span className="sev-chip">{SEVERITY_LABEL[i.severity]?.zh ?? i.severity}</span>
                    <span>{i.message}</span>
                    {i.target && <code>{i.target}</code>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {autoReport.advice.length > 0 && (
            <div className="report-section">
              <strong>优化方向（{autoReport.advice.length}）</strong>
              <ul className="advice-list">
                {autoReport.advice.map((a, idx) => (
                  <li key={idx}>💡 {a.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {autoMelt && autoMelt.length > 0 && (
        <div className="card">
          <h2>
            熔解曲线检查
            <span className="hint">由 RDML 原始熔解数据峰检测；多峰提示非特异扩增或引物二聚体</span>
          </h2>
          <div className="std-list">
            {autoMelt.map((m) => (
              <div className={`std-row ${m.multi.length > 0 ? 'std-warn' : 'std-good'}`} key={m.gene}>
                <strong>{m.gene}</strong>
                <span>
                  {m.checked} 孔：单峰 {m.single} · 多峰 {m.multi.length}
                  {m.multi.length > 0 && m.multi[0].tm != null ? `（${m.multi.map((w) => `${w.well}@${w.tm}°C`).join('、')}）` : ''} ·
                  无峰 {m.none}
                </span>
                <span className="tag" style={{ marginLeft: 'auto' }}>
                  {m.multi.length > 0 ? '⚠️ 建议跑胶确认产物特异性' : '✓ 通过'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
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
          <span className="hint">
            {out.effMode ? 'Pfaffl 效率校正 · ' : 'Livak 2^-ΔΔCt · '}
            统计基于每个生物学重复的 ΔCt
          </span>
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
