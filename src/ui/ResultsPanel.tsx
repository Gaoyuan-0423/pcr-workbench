import { useMemo, useState } from 'react';
import type { AnalysisOutput, SampleTargetResult } from '../core/types';
import { formatP } from '../core/stats';
import {
  downloadCsv,
  downloadSvg,
  downloadSvgAsPng,
  downloadWorkbook,
  buildWorkbook,
  resultAoa,
  downloadBlob,
} from '../core/export';
import { DEFAULT_CHART_OPTIONS, type ChartOptions } from '../core/chart-options';
import { buildBarsForGene } from '../core/chart-bars';
import { multiGeneChartSvg } from '../core/chart-svg';
import { buildPrismPzfx } from '../core/pzfx';

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
  const [multiGene, setMultiGene] = useState(false);
  const [chartOpts, setChartOpts] = useState<ChartOptions>(DEFAULT_CHART_OPTIONS);

  const activeGene = genes.includes(gene) ? gene : genes[0] ?? '';

  // 每样本颜色：对照用 controlColor，处理组统一 groupColor
  const colorFor = (r: SampleTargetResult): string =>
    r.isControl ? chartOpts.controlColor : chartOpts.groupColor;

  const geneResults = out.results.filter((r) => r.target === activeGene);

  function baseName(): string {
    const genesTag = multiGene ? 'multi' : activeGene;
    return (fileName.replace(/\.[^.]+$/, '') || 'pcr-workbench') + `-${genesTag || 'results'}`;
  }

  // 图表段（单基因或多基因分段）
  const segments = useMemo(() => {
    const targetGenes = multiGene ? genes : [activeGene];
    return targetGenes
      .filter(Boolean)
      .map((g) => ({
        gene: g,
        bars: buildBarsForGene(
          out.results.filter((r) => r.target === g),
          chartOpts,
          colorFor,
        ),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [out.results, genes, activeGene, multiGene, chartOpts]);

  const svgString = useMemo(() => {
    return multiGeneChartSvg(segments, chartOpts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, chartOpts]);

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
    void downloadSvgAsPng(svgString, baseName() + '.png', { width: chartOpts.width, height: chartOpts.height }).catch((e) => alert(String(e)));
  }

  function exportPrism() {
    const xml = buildPrismPzfx(out.results, {
      projectName: fileName,
      refGenes: out.refGenesUsed,
      controlSamples: out.controlSamples,
    });
    downloadBlob(xml, baseName() + '-prism.pzfx', 'application/xml');
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
          柱状图{chartOpts.title ? `——${chartOpts.title}` : multiGene ? '（多基因分段）' : `（${activeGene}）`}
          <span className="hint">均值 ± {chartOpts.errorBar === 'sem' ? 'SEM' : chartOpts.errorBar === 'none' ? '无' : 'SD'}</span>
        </h2>

        <details className="chart-settings">
          <summary>⚙️ 图表设置（坐标轴 / 配色 / 显著性 / 尺寸 / 多基因）</summary>
          <div className="chart-settings-grid">
            <label>
              标题
              <input type="text" value={chartOpts.title} placeholder="留空 = 基因名" onChange={(e) => setChartOpts({ ...chartOpts, title: e.target.value })} />
            </label>
            <label>
              副标题
              <input type="text" value={chartOpts.subtitle} onChange={(e) => setChartOpts({ ...chartOpts, subtitle: e.target.value })} />
            </label>
            <label>
              Y 轴标题
              <input type="text" value={chartOpts.yLabel} onChange={(e) => setChartOpts({ ...chartOpts, yLabel: e.target.value })} />
            </label>
            <label>
              X 轴标题
              <input type="text" value={chartOpts.xLabel} placeholder="留空 = 不显示" onChange={(e) => setChartOpts({ ...chartOpts, xLabel: e.target.value })} />
            </label>
            <label>
              Y 轴下限
              <input type="number" step="any" placeholder="自动" value={chartOpts.yMin ?? ''} onChange={(e) => setChartOpts({ ...chartOpts, yMin: e.target.value.trim() === '' ? null : Number(e.target.value) })} />
            </label>
            <label>
              Y 轴上限
              <input type="number" step="any" placeholder="自动" value={chartOpts.yMax ?? ''} onChange={(e) => setChartOpts({ ...chartOpts, yMax: e.target.value.trim() === '' ? null : Number(e.target.value) })} />
            </label>
            <label>
              误差棒
              <select value={chartOpts.errorBar} onChange={(e) => setChartOpts({ ...chartOpts, errorBar: e.target.value as 'sd' | 'sem' | 'none' })}>
                <option value="sd">SD</option>
                <option value="sem">SEM</option>
                <option value="none">不显示</option>
              </select>
            </label>
            <label>
              显著性标注
              <select value={chartOpts.showP} onChange={(e) => setChartOpts({ ...chartOpts, showP: e.target.value as 'stars' | 'p' | 'both' | 'none' })}>
                <option value="stars">星号（*/**/***）</option>
                <option value="p">p 值</option>
                <option value="both">星号 + p 值</option>
                <option value="none">不显示</option>
              </select>
            </label>
            <label>
              对照柱颜色
              <input type="color" value={chartOpts.controlColor} onChange={(e) => setChartOpts({ ...chartOpts, controlColor: e.target.value })} />
            </label>
            <label>
              处理柱颜色
              <input type="color" value={chartOpts.groupColor} onChange={(e) => setChartOpts({ ...chartOpts, groupColor: e.target.value })} />
            </label>
            <label>
              图宽（px）
              <input type="number" min={400} max={2400} value={chartOpts.width} onChange={(e) => setChartOpts({ ...chartOpts, width: Math.max(400, Number(e.target.value) || 860) })} />
            </label>
            <label>
              图高（px）
              <input type="number" min={260} max={1600} value={chartOpts.height} onChange={(e) => setChartOpts({ ...chartOpts, height: Math.max(260, Number(e.target.value) || 460) })} />
            </label>
          </div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10, fontSize: '0.88rem' }}>
            <input type="checkbox" checked={multiGene} onChange={(e) => setMultiGene(e.target.checked)} />
            合并多基因作图（分段柱状图：每基因一段，段内为各样本 vs 对照）
          </label>
        </details>

        <div
          className="chart-preview"
          // SVG 字符串由本仓库生成器产出（内容已转义）
          dangerouslySetInnerHTML={{ __html: svgString }}
        />

        <div className="row-actions">
          <button onClick={() => downloadSvg(svgString, baseName() + '.svg')}>导出 SVG（矢量）</button>
          <button className="primary" onClick={exportPng}>
            导出 PNG
          </button>
          <span style={{ flex: 1 }} />
          <button onClick={exportPrism}>导出 Prism 工程（.pzfx）</button>
        </div>
      </div>
    </div>
  );
}

function fmt(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return String(Math.round(v * 1000) / 1000);
}
