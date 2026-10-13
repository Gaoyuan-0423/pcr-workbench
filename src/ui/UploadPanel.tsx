import { useRef, useState } from 'react';
import { readWorkbookFile, sheetToRawMatrix, summarizeSheet, type WorkbookFile } from '../core/parse';

interface Props {
  onLoaded: (fileName: string, sheetName: string, matrix: string[][]) => void;
  onAutoFile: (file: File) => Promise<void>;
}

export default function UploadPanel({ onLoaded, onAutoFile }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<WorkbookFile | null>(null);
  const [autoMode, setAutoMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError('');
    setBusy(true);
    try {
      if (autoMode) {
        await onAutoFile(file);
        return;
      }
      const wbFile = await readWorkbookFile(file);
      const nonEmpty = wbFile.sheetNames.filter((n) => summarizeSheet(wbFile.wb, n).rowCount > 0);
      if (nonEmpty.length === 0) {
        setError('文件里没有可读的数据行');
      } else if (nonEmpty.length === 1) {
        onLoaded(file.name, nonEmpty[0], sheetToRawMatrix(wbFile.wb, nonEmpty[0]));
      } else {
        setPending(wbFile);
      }
    } catch (e) {
      setError(`解析失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      setAutoMode(false);
    }
  }

  return (
    <div className="card">
      <h2>导入仪器下机结果</h2>
      <p className="hint-line">
        支持 Bio-Rad CFX、Thermo QuantStudio/StepOne、Roche LightCycler、Qiagen Rotor-Gene
        等仪器软件导出的表格文件（Excel / CSV / TSV / TXT，中英文列名均可，UTF-8 与 GBK
        编码自动识别）。文件只在浏览器本地解析，不会上传。
      </p>
      <div
        className={`upload-area${dragOver ? ' dragover' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) void handleFile(f);
        }}
      >
        <div style={{ fontSize: 34 }}>🧬</div>
        <div className="big">拖入文件，或点击选择</div>
        <div className="formats">.xlsx / .xls / .csv / .tsv / .txt</div>
      </div>
      <div className="row-actions" style={{ justifyContent: 'center' }}>
        <button
          className={autoMode ? 'primary' : ''}
          disabled={busy}
          onClick={() => {
            setAutoMode(true);
            inputRef.current?.click();
          }}
        >
          🪄 一键智能分析：自动识别列 / 对照组 / 内参，直接出结果与质量报告
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.xlsm,.csv,.tsv,.txt"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = '';
        }}
      />
      {busy && <div className="parsing">正在解析…</div>}
      {error && (
        <p role="alert" style={{ color: 'var(--danger)', marginTop: 10 }}>
          {error}
        </p>
      )}

      {pending && (
        <div className="modal-overlay" role="dialog" aria-label="选择工作表">
          <div className="modal">
            <h3>选择工作表</h3>
            <p className="hint-line">{pending.fileName} 里有 {pending.sheetNames.length} 个工作表：</p>
            <div className="sheet-list">
              {pending.sheetNames.map((name) => {
                const s = summarizeSheet(pending.wb, name);
                return (
                  <div
                    key={name}
                    className={`sheet-item${s.rowCount === 0 ? '' : ''}`}
                    style={s.rowCount === 0 ? { opacity: 0.45 } : undefined}
                    onClick={() => {
                      if (s.rowCount === 0) return;
                      const wbFile = pending;
                      setPending(null);
                      onLoaded(wbFile.fileName, name, sheetToRawMatrix(wbFile.wb, name));
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div>📄 {name}</div>
                      <div className="meta">
                        {s.rowCount} 行数据 · {s.columnCount} 列 · 列名：{s.headers.slice(0, 6).join(', ') || '—'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={() => setPending(null)}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
