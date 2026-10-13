import { allWellNames, type PlateLayout } from '../core/plate';

export interface PlateCell {
  sample: string;
  target: string;
  excluded: boolean;
  flagged: boolean;
}

interface Props {
  layout: PlateLayout;
  cells: Map<string, PlateCell>;
  onToggle: (well: string) => void;
}

const GENE_COLORS = ['#0e7c66', '#2563eb', '#b45309', '#7c3aed', '#be185d', '#0e7490', '#4d7c0f', '#b91c1c'];

export default function PlateView({ layout, cells, onToggle }: Props) {
  const names = allWellNames(layout);
  const colHeaders = Array.from({ length: layout.colCount }, (_, i) => i + 1);
  const genes = [...new Set([...cells.values()].map((c) => c.target))].sort();
  const colorOf = (gene: string) => GENE_COLORS[genes.indexOf(gene) % GENE_COLORS.length];

  const rows: string[][] = [];
  for (let r = 0; r < layout.rowCount; r++) {
    rows.push(names.slice(r * layout.colCount, (r + 1) * layout.colCount));
  }

  return (
    <div>
      <div className="plate-wrap">
        <table className="plate">
          <thead>
            <tr>
              <th></th>
              {colHeaders.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                <th>{layout.rowLabels[ri]}</th>
                {row.map((well) => {
                  const cell = cells.get(well);
                  if (!cell) {
                    return (
                      <td key={well} className="well empty" title={`${well}（空孔）`}>
                        <span className="wellname">{well}</span>
                      </td>
                    );
                  }
                  const cls = ['well', cell.excluded ? 'excluded' : '', cell.flagged && !cell.excluded ? 'flagged' : '']
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <td
                      key={well}
                      className={cls}
                      title={`${well} · ${cell.sample} · ${cell.target}${cell.excluded ? '（已剔除）' : ''}`}
                      onClick={() => onToggle(well)}
                    >
                      <span className="wellname">{well}</span>
                      <span style={{ color: cell.excluded ? undefined : colorOf(cell.target) }}>
                        {cell.sample.length > 6 ? cell.sample.slice(0, 6) : cell.sample}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="legend">
        <span>
          <span className="chip" style={{ background: '#f3f4f6', border: '1px solid #e5e7eb' }}></span>空孔
        </span>
        <span>
          <span className="chip" style={{ background: '#9fb3ba' }}></span>对照组样本
        </span>
        <span>
          <span className="chip" style={{ background: 'repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6 2px,#e5e7eb 2px,#e5e7eb 4px)', border: '1px solid #e5e7eb' }}></span>
          已剔除（点击切换）
        </span>
        <span>
          <span className="chip" style={{ boxShadow: 'inset 0 0 0 2px #d97706' }}></span>QC 标记
        </span>
        {genes.map((g) => (
          <span key={g}>
            <span className="chip" style={{ background: colorOf(g) }}></span>
            {g}
          </span>
        ))}
      </div>
    </div>
  );
}
