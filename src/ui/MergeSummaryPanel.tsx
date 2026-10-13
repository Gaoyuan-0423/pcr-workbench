import type { PerFileInfo } from '../core/merge';

interface Props {
  perFile: PerFileInfo[];
}

/** 多文件合并模式的"映射确认"步：逐文件展示自动识别结果（合并模式下列映射不可逐列编辑）。 */
export default function MergeSummaryPanel({ perFile }: Props) {
  const okCount = perFile.filter((f) => f.ok).length;
  return (
    <div className="card">
      <h2>
        合并 {perFile.length} 个文件
        <span className="hint">每个文件已独立识别列映射；同样本同基因的复孔将跨板汇总</span>
      </h2>
      <div className="merge-list">
        {perFile.map((f) => (
          <div key={f.fileName} className={`merge-row ${f.ok ? '' : 'merge-bad'}`}>
            <span>{f.ok ? '✅' : '⛔'}</span>
            <div style={{ flex: 1 }}>
              <div>
                <strong>{f.fileName}</strong>
                <span className="hint" style={{ marginLeft: 8 }}>
                  板名「{f.plate}」 · 表头第 {f.headerRow + 1} 行 · {f.rowCount} 行数据
                </span>
              </div>
              {f.ok ? (
                <div className="hint-line" style={{ margin: 0 }}>
                  样本列 <code>{f.cols.sample}</code> · 基因列 <code>{f.cols.target}</code> · Cq 列{' '}
                  <code>{f.cols.cq}</code>
                </div>
              ) : (
                <div style={{ color: 'var(--danger)', fontSize: '0.86rem' }}>{f.problem}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      {okCount < perFile.length && (
        <p className="hint-line" style={{ color: 'var(--warning)' }}>
          有文件未能识别必需列，已被跳过。如需修正，请单独重新上传该文件（单文件模式可手动调列映射）。
        </p>
      )}
      <p className="hint-line">
        合并语义：复孔聚合与 ΔCt 计算都在合并后的数据上进行——例如内参在板 1、目标基因在板 2
        时，同一样本的两者会自动配对。
      </p>
    </div>
  );
}
