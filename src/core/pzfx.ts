// Prism (.pzfx XML) 导出：分组数据表，行=复孔，子列=样本（按基因×样本排列）。
// Prism 打开后即为 Grouped 表，一键生成分组柱状图（用户自己的模板流程）。

import type { SampleTargetResult } from './types';

const esc = (s: string): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface PrismSubcolumn {
  title: string;
  /** 复孔值（按行序），缺失补空 */
  values: (number | null)[];
}

/** 由结果聚合出 每基因×样本 的复孔列。 */
function subcolumnsForGene(results: SampleTargetResult[], gene: string): PrismSubcolumn[] {
  const geneRows = results.filter((r) => r.target === gene);
  const cols: PrismSubcolumn[] = [];
  for (const r of geneRows) {
    cols.push({
      title: r.isControl ? `${r.sample} (对照)` : r.sample,
      values: [...r.values],
    });
  }
  return cols;
}

export function buildPrismPzfx(
  results: SampleTargetResult[],
  opts: { projectName: string; refGenes: string[]; controlSamples: string[] },
): string {
  const genes = [...new Set(results.map((r) => r.target))].sort();
  const maxRows = genes.reduce((mx, g) => {
    return Math.max(mx, ...results.filter((r) => r.target === g).map((r) => r.values.length));
  }, 0);

  const tables: string[] = [];
  let tableId = 0;

  for (const gene of genes) {
    const cols = subcolumnsForGene(results, gene);
    tableId += 1;
    const subcols = cols
      .map(
        (c) =>
          `        <Subcolumn>\n          <Title>${esc(c.title)}</Title>\n` +
          Array.from({ length: maxRows }, (_, i) =>
            c.values[i] != null && Number.isFinite(c.values[i]!) ? `          <p>${c.values[i]!}</p>\n` : '          <p></p>\n',
          ).join('') +
          '        </Subcolumn>',
      )
      .join('\n');
    const rowTitles = Array.from({ length: maxRows }, (_, i) => `          <w:RowTitle>${i + 1}</w:RowTitle>`).join('\n');
    tables.push(
      `    <Table ID="Table${tableId}" XWidth="100" YWidth="100">\n` +
        `      <Title>${esc(gene)} — Cq replicates</Title>\n` +
        `      <RowTitlesColumn Width="100">\n        <Subcolumn>\n${rowTitles}\n        </Subcolumn>\n      </RowTitlesColumn>\n` +
        `      <Subcolumns>\n${subcols}\n      </Subcolumns>\n    </Table>`,
    );
  }

  // 汇总表：Fold Change mean ± SD（直接可贴入 Prism 作图）
  tableId += 1;
  const fcCols: string[] = [];
  for (const gene of genes) {
    for (const r of results.filter((x) => x.target === gene)) {
      fcCols.push(
        `        <Subcolumn>\n          <Title>${esc(r.target + ' | ' + r.sample)}</Title>\n          <p>${r.foldChange != null ? r.foldChange.toFixed(4) : ''}</p>\n          <p>${r.fcSd != null && Number.isFinite(r.fcSd) ? r.fcSd.toFixed(4) : ''}</p>\n        </Subcolumn>`,
      );
    }
  }
  tables.push(
    `    <Table ID="Table${tableId}" XWidth="100" YWidth="100">\n` +
      `      <Title>Fold Change (mean ± SD)</Title>\n` +
      `      <RowTitlesColumn Width="100">\n        <Subcolumn>\n          <w:RowTitle>Mean</w:RowTitle>\n          <w:RowTitle>SD</w:RowTitle>\n        </Subcolumn>\n      </RowTitlesColumn>\n` +
      `      <Subcolumns>\n${fcCols.join('\n')}\n      </Subcolumns>\n    </Table>`,
  );

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<GraphPadPrismFile PrismXMLVersion="5.00">\n` +
    `  <Created>\n    <OriginalVersion Major="9" Minor="0" />\n    <LastSavedBy Major="9" Minor="0" />\n  </Created>\n` +
    `  <!-- PCR Workbench · PCR 工作台 | 对照: ${esc(opts.controlSamples.join('、'))} | 内参: ${esc(opts.refGenes.join('、'))} -->\n` +
    `  <TableSequence>\n${tables.join('\n')}\n  </TableSequence>\n` +
    `</GraphPadPrismFile>\n`
  );
}
