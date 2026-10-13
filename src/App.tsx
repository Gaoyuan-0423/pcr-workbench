import { useCallback, useEffect, useMemo, useState } from 'react';
import { get, set } from 'idb-keyval';
import { analyzeDeltaDeltaCt, extractRows, guessRefGenes, isNtcRow, type AnalysisRow } from './core/analysis';
import { analyzeFileAuto, type QualityReport } from './core/auto';
import { mergeFileMatrices, type FileMatrixInput, type PerFileInfo } from './core/merge';
import MergeSummaryPanel from './ui/MergeSummaryPanel';
import { computeQcFlags } from './core/qc';
import { sniff } from './core/sniff';
import { mappingComplete, DEFAULT_QC, emptyMapping, type AnalysisConfig, type ColumnMapping, type QcFlags } from './core/types';
import UploadPanel from './ui/UploadPanel';
import MappingPanel from './ui/MappingPanel';
import ConfigPanel from './ui/ConfigPanel';
import ResultsPanel from './ui/ResultsPanel';

const STORAGE_KEY = 'pcr-workbench:project:v1';

interface ProjectState {
  fileName: string;
  sheetName: string;
  matrix: string[][];
  headerRow: number;
  mapping: ColumnMapping;
  excluded: Record<number, boolean>;
  config: AnalysisConfig;
  /** 多文件合并模式：直接存规范行（matrix 为空） */
  merged?: { rows: AnalysisRow[]; perFile: PerFileInfo[] } | null;
}

const STEPS = ['导入数据', '确认映射', '孔板与配置', '分析结果'];

export default function App() {
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [matrix, setMatrix] = useState<string[][]>([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>(emptyMapping());
  const [excluded, setExcluded] = useState<Record<number, boolean>>({});
  const [config, setConfig] = useState<AnalysisConfig>({ controlSamples: [], refGenes: [], qc: DEFAULT_QC });
  const [toast, setToast] = useState('');
  const [restored, setRestored] = useState(false);
  const [autoReport, setAutoReport] = useState<QualityReport | null>(null);
  const [guessBasis, setGuessBasis] = useState('');
  const [merged, setMerged] = useState<{ rows: AnalysisRow[]; perFile: PerFileInfo[] } | null>(null);

  // 恢复上次项目
  useEffect(() => {
    void get<ProjectState>(STORAGE_KEY).then((s) => {
      if (!s || !Array.isArray(s.matrix) || s.matrix.length === 0) return;
      setFileName(s.fileName);
      setSheetName(s.sheetName);
      setMatrix(s.matrix);
      setHeaderRow(s.headerRow);
      setMapping(s.mapping);
      setExcluded(s.excluded ?? {});
      setConfig(s.config);
      setMerged(s.merged ?? null);
      setRestored(true);
      setStep(4);
    });
  }, []);

  // 自动保存（防抖）
  useEffect(() => {
    if (matrix.length === 0 && !merged) return;
    const t = setTimeout(() => {
      void set(STORAGE_KEY, { fileName, sheetName, matrix, headerRow, mapping, excluded, config, merged } satisfies ProjectState);
    }, 600);
    return () => clearTimeout(t);
  }, [fileName, sheetName, matrix, headerRow, mapping, excluded, config, merged]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleMergeLoaded = useCallback((inputs: FileMatrixInput[]) => {
    const m = mergeFileMatrices(inputs);
    const genes = [...new Set(m.rows.map((r) => r.target).filter(Boolean))];
    setFileName(inputs.map((i) => i.fileName).join(' + '));
    setSheetName('');
    setMatrix([]);
    setHeaderRow(0);
    setMapping(emptyMapping());
    setMerged(m);
    setExcluded({});
    setConfig({ controlSamples: [], refGenes: guessRefGenes(genes), qc: DEFAULT_QC });
    setAutoReport(null);
    setGuessBasis('');
    setRestored(false);
    setStep(2);
    setToast(`已合并 ${inputs.length} 个文件：${m.rows.length} 行数据，请确认后继续`);
  }, []);

  const handleAutoFile = useCallback(async (file: File) => {
    const result = await analyzeFileAuto(file);
    setFileName(result.fileName);
    setSheetName(result.sheetName);
    setMatrix(result.matrix);
    setHeaderRow(result.headerRow);
    setMapping(result.mapping);
    setExcluded({});
    setConfig(result.config);
    setAutoReport(result.report);
    setGuessBasis(result.guess.basis);
    setRestored(false);
    setStep(4);
    setToast(`一键分析完成：质量分 ${result.report.score}/100 · ${result.report.summary}`);
  }, []);

  const handleLoaded = useCallback((name: string, sheet: string, m: string[][]) => {
    const s = sniff(m);
    setFileName(name);
    setSheetName(sheet);
    setMatrix(m);
    setHeaderRow(s.headerRow);
    setMapping(s.mapping);
    setExcluded({});
    const rows = extractRows(m.slice(s.headerRow + 1), s.mapping);
    const genes = [...new Set(rows.map((r) => r.target).filter(Boolean))];
    setConfig({
      controlSamples: [],
      refGenes: guessRefGenes(genes),
      qc: DEFAULT_QC,
    });
    setRestored(false);
    setStep(2);
    setToast(`已解析 ${name}（${sheet}）：${rows.length} 行数据，自动映射完成，请确认`);
  }, []);

  const rows = useMemo(
    () =>
      merged
        ? merged.rows.map((r) => ({ ...r, excluded: excluded[r.id] ?? false }))
        : matrix.length
          ? extractRows(matrix.slice(headerRow + 1), mapping).map((r) => ({
              ...r,
              excluded: excluded[r.id] ?? false,
            }))
          : [],
    [merged, matrix, headerRow, mapping, excluded],
  );

  const flags: QcFlags = useMemo(
    () =>
      computeQcFlags(
        rows
          .filter((r) => !isNtcRow(r))
          .map((r) => ({ id: r.id, sample: r.sample, target: r.target, cq: r.cq, excluded: r.excluded })),
        config.qc,
      ),
    [rows, config.qc],
  );

  const out = useMemo(
    () => (rows.length ? analyzeDeltaDeltaCt(rows, config) : null),
    [rows, config],
  );

  const canGoConfig = merged
    ? merged.perFile.some((f) => f.ok) && merged.rows.length > 0
    : mappingComplete(mapping);
  const canGoResults =
    canGoConfig && config.controlSamples.length > 0 && config.refGenes.length > 0 && !!out && out.results.length > 0;

  function goto(n: number) {
    if (n >= 2 && !canGoConfig) {
      setToast('请先完成列映射');
      return;
    }
    if (n >= 4 && !canGoResults) {
      setToast('请先设置对照组样本和内参基因');
      return;
    }
    setStep(n);
  }

  function reset() {
    setFileName('');
    setSheetName('');
    setMatrix([]);
    setHeaderRow(0);
    setMapping(emptyMapping());
    setExcluded({});
    setConfig({ controlSamples: [], refGenes: [], qc: DEFAULT_QC });
    setAutoReport(null);
    setGuessBasis('');
    setMerged(null);
    setRestored(false);
    setStep(1);
  }

  return (
    <div className="container">
      <header className="app-header">
        <h1>PCR Workbench · PCR 工作台</h1>
        <span className="sub">qPCR 下机结果 → ΔΔCt → 图表导出</span>
        <span className="spacer" />
        <span className="privacy-note">🔒 数据仅在浏览器本地处理，不上传服务器</span>
      </header>

      <nav className="steps" aria-label="分析步骤">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const cls = n === step ? 'step active' : n < step ? 'step done' : 'step';
          return (
            <button
              key={label}
              className={cls}
              style={{ cursor: n < step ? 'pointer' : 'default', border: 'none' }}
              onClick={() => n !== step && goto(n)}
              aria-current={n === step ? 'step' : undefined}
            >
              <span className="num">{n < step ? '✓' : n}</span>
              {label}
            </button>
          );
        })}
      </nav>

      {restored && (
        <div className="warning-banner">
          已恢复上次的项目「{fileName}」。要重新开始，
          <button className="small ghost" onClick={reset}>
            点此清空
          </button>
          。
        </div>
      )}

      {step === 1 && <UploadPanel onLoaded={handleLoaded} onAutoFile={handleAutoFile} onMergeLoaded={handleMergeLoaded} />}
      {step === 2 &&
        (merged ? (
          <MergeSummaryPanel perFile={merged.perFile} />
        ) : (
          <MappingPanel
            matrix={matrix}
            headerRow={headerRow}
            mapping={mapping}
            onHeaderRow={setHeaderRow}
            onMapping={setMapping}
          />
        ))}
      {step === 3 && (
        <ConfigPanel
          rows={rows}
          flags={flags}
          config={config}
          onConfig={setConfig}
          excluded={excluded}
          onExcluded={setExcluded}
        />
      )}
      {step === 4 && out && (
        <ResultsPanel out={out} fileName={fileName} rows={rows} flags={flags} autoReport={autoReport} guessBasis={guessBasis} />
      )}

      <div className="row-actions" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <span>{step > 1 && <button onClick={() => setStep(step - 1)}>← 上一步</button>}</span>
        <span>
          {step === 2 && (
            <button className="primary" disabled={!canGoConfig} onClick={() => goto(3)}>
              下一步：孔板与配置 →
            </button>
          )}
          {step === 3 && (
            <button
              className="primary"
              disabled={!config.controlSamples.length || !config.refGenes.length}
              onClick={() => goto(4)}
            >
              计算 ΔΔCt 并查看结果 →
            </button>
          )}
        </span>
      </div>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
