import { useMemo } from 'react';
import type { AnalysisRow } from '../core/analysis';
import { isFlagged } from '../core/analysis';
import { detectPlateLayout, parseWell } from '../core/plate';
import type { AnalysisConfig, QcFlags, QcSettings } from '../core/types';
import PlateView, { type PlateCell } from './PlateView';

interface Props {
  rows: AnalysisRow[];
  flags: QcFlags;
  config: AnalysisConfig;
  onConfig: (c: AnalysisConfig) => void;
  excluded: Record<number, boolean>;
  onExcluded: (next: Record<number, boolean>) => void;
}

function numOrNull(v: string): number {
  if (v.trim() === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export default function ConfigPanel({ rows, flags, config, onConfig, excluded, onExcluded }: Props) {
  const samples = useMemo(() => [...new Set(rows.map((r) => r.sample).filter(Boolean))].sort(), [rows]);
  const genes = useMemo(() => [...new Set(rows.map((r) => r.target).filter(Boolean))].sort(), [rows]);

  const layout = useMemo(() => {
    const wells = rows.map((r) => r.well).filter(Boolean);
    return detectPlateLayout(wells);
  }, [rows]);

  const cells = useMemo(() => {
    const m = new Map<string, PlateCell>();
    for (const r of rows) {
      if (!parseWell(r.well)) continue;
      m.set(wellKey(r.well), {
        sample: r.sample,
        target: r.target,
        excluded: excluded[r.id] ?? false,
        flagged: isFlagged(flags, r.id),
      });
    }
    return m;
  }, [rows, excluded, flags]);

  const flaggedRows = rows.filter((r) => isFlagged(flags, r.id) && !excluded[r.id]);
  const flagCount = Object.keys(flags).length;
  const excludedCount = Object.values(excluded).filter(Boolean).length;

  function toggleWell(well: string) {
    const ids = rows.filter((r) => normalizeWell(r.well) === well).map((r) => r.id);
    const anyIncluded = ids.some((id) => !excluded[id]);
    const next = { ...excluded };
    for (const id of ids) next[id] = anyIncluded;
    onExcluded(next);
  }

  function excludeFlagged() {
    const next = { ...excluded };
    for (const r of flaggedRows) next[r.id] = true;
    onExcluded(next);
  }

  function setQc(patch: Partial<QcSettings>) {
    onConfig({ ...config, qc: { ...config.qc, ...patch } });
  }

  const qcInput = (key: keyof QcSettings, label: string, placeholder: string) => (
    <label>
      {label}
      <input
        type="number"
        step="any"
        placeholder={placeholder}
        value={Number.isFinite(config.qc[key]) ? String(config.qc[key]) : ''}
        onChange={(e) => setQc({ [key]: numOrNull(e.target.value) } as Partial<QcSettings>)}
      />
    </label>
  );

  return (
    <div>
      {layout && (
        <div className="card">
          <h2>
            孔板布局（{layout.kind === '384' ? '384' : layout.kind === '96' ? '96' : '自定义'}孔）
            <span className="hint">点击孔位可剔除 / 恢复整组复孔</span>
          </h2>
          <PlateView layout={layout} cells={cells} onToggle={toggleWell} />
        </div>
      )}

      <div className="card">
        <h2>实验配置</h2>
        <div className="config-grid">
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              对照组样本 <span style={{ color: 'var(--danger)' }}>*</span>
            </div>
            <div className="check-list">
              {samples.map((s) => (
                <label key={s}>
                  <input
                    type="checkbox"
                    checked={config.controlSamples.includes(s)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...config.controlSamples, s]
                        : config.controlSamples.filter((x) => x !== s);
                      onConfig({ ...config, controlSamples: next });
                    }}
                  />
                  {s}
                  <span className="tag">{rows.filter((r) => r.sample === s).length} 孔</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              内参基因（可多选，池化） <span style={{ color: 'var(--danger)' }}>*</span>
            </div>
            <div className="check-list">
              {genes.map((g) => (
                <label key={g}>
                  <input
                    type="checkbox"
                    checked={config.refGenes.includes(g)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...config.refGenes, g]
                        : config.refGenes.filter((x) => x !== g);
                      onConfig({ ...config, refGenes: next });
                    }}
                  />
                  {g}
                  <span className="tag">{rows.filter((r) => r.target === g).length} 孔</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>QC 规则（留空 = 不启用）</div>
          <div className="qc-inputs">
            {qcInput('minCq', 'Cq 下限', '如 15')}
            {qcInput('maxCq', 'Cq 上限', '如 35')}
            {qcInput('absDev', '复孔绝对偏差上限', '如 0.5')}
            {qcInput('zScore', '复孔 z 分数阈值', '如 1.1（三复孔建议 ≤1.15）')}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>
          数据 QC
          <span className="hint">标记不影响分析，剔除后才排除</span>
        </h2>
        <div className="qc-summary">
          <div className="qc-card">
            <div className="v">{rows.length}</div>
            <div className="l">原始数据行</div>
          </div>
          <div className="qc-card">
            <div className="v">{flagCount}</div>
            <div className="l">QC 标记</div>
          </div>
          <div className="qc-card">
            <div className="v">{excludedCount}</div>
            <div className="l">已剔除</div>
          </div>
          <div className="qc-card">
            <div className="v">{rows.length - excludedCount}</div>
            <div className="l">纳入分析</div>
          </div>
        </div>
        {flaggedRows.length > 0 ? (
          <div>
            <div className="qc-flag-list">
              {flaggedRows.map((r) => (
                <div className="qc-flag-row" key={r.id}>
                  <span>
                    <code>{r.well || `#${r.id}`}</code>
                  </span>
                  <span>
                    {r.sample} · {r.target} · Cq={Number.isFinite(r.cq) ? r.cq : '—'}
                  </span>
                  <span className="reasons">{(flags[r.id] ?? []).join('；')}</span>
                </div>
              ))}
            </div>
            <div className="row-actions">
              <button className="small danger" onClick={excludeFlagged}>
                剔除全部 {flaggedRows.length} 行标记数据
              </button>
              {excludedCount > 0 && (
                <button className="small" onClick={() => onExcluded({})}>
                  恢复全部剔除
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="empty-note">没有待处理的 QC 标记。</p>
        )}
      </div>
    </div>
  );
}

function wellKey(well: string): string {
  const p = parseWell(well);
  if (!p) return well.trim().toUpperCase();
  return wellNameOf(p.row, p.col);
}

function normalizeWell(well: string): string {
  return wellKey(well);
}

function wellNameOf(row: number, col: number): string {
  let r = row + 1;
  let letters = '';
  while (r > 0) {
    const rem = (r - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    r = Math.floor((r - 1) / 26);
  }
  return `${letters}${col + 1}`;
}
