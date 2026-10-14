import { useEffect, useState } from 'react';
import type { ProjectMeta } from '../core/projects';

interface Props {
  currentId: string | null;
  projects: ProjectMeta[];
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onNew: () => void;
}

function timeLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? `今天 ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

/** 我的课题：已保存课题列表（打开 / 重命名 / 删除）。 */
export default function ProjectsDialog({
  currentId,
  projects,
  onOpen,
  onRename,
  onDelete,
  onClose,
  onNew,
}: Props) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // 打开时清空临时编辑态
  useEffect(() => {
    setRenaming(null);
    setConfirmDelete(null);
  }, [projects]);

  return (
    <div className="modal-overlay" role="dialog" aria-label="我的课题" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h3>我的课题</h3>
          <span className="hint-line" style={{ margin: 0 }}>{projects.length} 个已保存</span>
          <span style={{ flex: 1 }} />
          <button className="small" onClick={onNew}>
            ＋ 新建课题
          </button>
        </div>
        {projects.length === 0 ? (
          <p className="empty-note">还没有保存的课题。完成一次分析后会自动保存到这里。</p>
        ) : (
          <div className="project-list">
            {projects.map((p) => (
              <div className={`project-row ${p.id === currentId ? 'project-current' : ''}`} key={p.id}>
                {renaming === p.id ? (
                  <div style={{ flex: 1, display: 'flex', gap: 8 }}>
                    <input
                      value={draft}
                      autoFocus
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && draft.trim()) {
                          onRename(p.id, draft.trim());
                          setRenaming(null);
                        }
                      }}
                      aria-label="课题名称"
                    />
                    <button
                      className="small primary"
                      onClick={() => {
                        if (draft.trim()) onRename(p.id, draft.trim());
                        setRenaming(null);
                      }}
                    >
                      保存
                    </button>
                    <button className="small" onClick={() => setRenaming(null)}>
                      取消
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ flex: 1 }}>
                      <div>
                        <strong>{p.name}</strong>
                        {p.id === currentId && <span className="tag-current">当前</span>}
                        {p.score != null && (
                          <span className="hint-line" style={{ display: 'inline', marginLeft: 8 }}>
                            质量分 {p.score}
                          </span>
                        )}
                      </div>
                      <div className="hint-line" style={{ margin: 0 }}>
                        {timeLabel(p.updatedAt)} · {p.rows} 行数据 · {p.fileName || '—'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button className="small primary" onClick={() => onOpen(p.id)}>
                        打开
                      </button>
                      <button
                        className="small"
                        onClick={() => {
                          setRenaming(p.id);
                          setDraft(p.name);
                        }}
                      >
                        重命名
                      </button>
                      {confirmDelete === p.id ? (
                        <>
                          <button className="small danger" onClick={() => { onDelete(p.id); setConfirmDelete(null); }}>
                            确认删除
                          </button>
                          <button className="small" onClick={() => setConfirmDelete(null)}>
                            取消
                          </button>
                        </>
                      ) : (
                        <button className="small danger" onClick={() => setConfirmDelete(p.id)}>
                          删除
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
          <button onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
