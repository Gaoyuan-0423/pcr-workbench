import { useMemo, useRef } from 'react';
import type { AnalysisRow } from '../core/analysis';
import { summarizeMeltTable, type MeltTableState, type MeltTableSummary } from '../core/melt';

interface Props {
  rows: AnalysisRow[];
  meltTable: MeltTableState | null;
  onMeltTableFile: (file: File) => Promise<void>;
}

/** 熔解摘要表（LightCycler No. Tm 格式）附加导入与 QC 概况。 */
export default function MeltTableCard({ rows, meltTable, onMeltTableFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const summary: MeltTableSummary | null = useMemo(() => {
    if (!meltTable) return null;
    return summarizeMeltTable(meltTable.byWell, rows);
  }, [meltTable, rows]);

  return (
    <div className="card">
      <h2>
        熔解摘要表（可选附加）
        <span className="hint">LightCycler "No. Tm" 格式导出；按孔位与主数据集连接</span>
      </h2>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt,.tsv,.xlsx,.xls"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onMeltTableFile(f);
          e.target.value = '';
        }}
      />
      {!meltTable ? (
        <button onClick={() => inputRef.current?.click()}>附加熔解摘要表文件</button>
      ) : (
        <div>
          <p className="hint-line">
            已附加 <code>{meltTable.fileName}</code>
            {summary && (
              <>
                ：连接 {summary.checked} 孔 —— 单峰 {summary.single} ·{' '}
                <span style={{ color: summary.multi.length ? 'var(--danger)' : undefined }}>
                  多峰 {summary.multi.length}
                </span>{' '}
                · 无峰 {summary.none}
              </>
            )}
          </p>
          {summary && summary.multi.length > 0 && (
            <div className="qc-flag-list">
              {summary.multi.map((w) => (
                <div className="qc-flag-row" key={w.well}>
                  <span>
                    <code>{w.well}</code>
                  </span>
                  <span>{w.sample}</span>
                  <span className="reasons">
                    {w.peaks} 个熔解峰{w.tm != null ? `（Tm ${w.tm}°C）` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="row-actions">
            <button onClick={() => inputRef.current?.click()}>更换文件</button>
          </div>
        </div>
      )}
    </div>
  );
}
