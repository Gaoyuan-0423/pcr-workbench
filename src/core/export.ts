import * as XLSX from 'xlsx';
import type { AnalysisOutput, NtcReportEntry, QcFlags } from './types';
import type { AnalysisRow } from './analysis';
import { formatP } from './stats';

const NUM = (v: number | null | undefined, digits = 4): string => {
  if (v == null || !Number.isFinite(v)) return '';
  return String(Math.round(v * 10 ** digits) / 10 ** digits);
};

/** ΔΔCt 结果表（AOA，含表头）。 */
export function resultAoa(out: AnalysisOutput): (string | number)[][] {
  const header = [
    '基因 Target', '样本 Sample', '组别 Group', '是否对照 Control', '复孔数 n',
    '孔位 Wells', '平均 Cq', 'Cq SD', '内参 Cq (池化)', 'ΔCt', 'ΔΔCt',
    'Fold Change (2^-ΔΔCt)', 'FC SD', 'p 值（总体）', 'Dunnett 校正 p', '显著性', '统计方法',
  ];
  const rows = out.results.map((r) => [
    r.target, r.sample, r.group || '', r.isControl ? '是' : '否', r.n,
    r.wells.join(' '), NUM(r.meanCq), NUM(r.sdCq), NUM(r.refCq), NUM(r.deltaCt), NUM(r.ddCt),
    NUM(r.foldChange), NUM(r.fcSd), formatP(r.pValue), formatP(r.pAdjusted), r.significance, r.statMethod,
  ]);
  return [header, ...rows];
}

/** 原始数据 + QC 标记表。 */
export function rawAoa(rows: AnalysisRow[], flags: QcFlags): (string | number)[][] {
  const header = ['行号', '板号', '孔位', '样本', '组别', '配对ID', '基因', 'Cq', 'QC 标记', '已剔除'];
  const body = rows.map((r) => [
    r.id, r.plate, r.well, r.sample, r.group, r.pairId, r.target,
    Number.isFinite(r.cq) ? NUM(r.cq) : '',
    (flags[r.id] ?? []).join('；'), r.excluded ? '是' : '',
  ]);
  return [header, ...body];
}

const VERDICT_LABEL: Record<NtcReportEntry['verdict'], string> = {
  contaminated: '⚠️ 疑似污染',
  late: '晚期扩增',
  pass: '✓ 通过',
};

/** NTC 污染检查表（AOA，含表头）。 */
export function ntcAoa(report: NtcReportEntry[]): (string | number)[][] {
  const header = ['基因 Target', 'NTC 孔数', '扩增孔数', '最低 Cq', '结论', '说明', 'NTC 孔位'];
  const rows = report.map((e) => [
    e.target, e.wells.length, e.amplified,
    e.minCq != null ? NUM(e.minCq) : '未扩增',
    VERDICT_LABEL[e.verdict], e.message, e.wells.join(' '),
  ]);
  return [header, ...rows];
}

function aoaToSheet(aoa: (string | number)[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(aoa);
}

/** 熔解检查表（AOA，含表头）。 */
export function meltAoa(melt: { gene: string; checked: number; single: number; none: number; multi: { sample: string; well: string; tm: number | null }[] }[]): (string | number)[][] {
  const header = ['基因 Target', '检查孔数', '单峰（通过）', '多峰（非特异）', '无峰', '多峰孔位与 Tm'];
  const rows = melt.map((m) => [
    m.gene, m.checked, m.single, m.multi.length, m.none,
    m.multi.map((w) => `${w.sample}@${w.well} ${w.tm ?? '—'}°C`).join('；'),
  ]);
  return [header, ...rows];
}

/** 构建多 sheet 工作簿：结果 / 原始数据+QC / NTC检查 / 熔解检查 / 项目信息。 */
export function buildWorkbook(
  out: AnalysisOutput,
  rows: AnalysisRow[],
  flags: QcFlags,
  meta: {
    fileName: string;
    refGenes: string[];
    controlSamples: string[];
    efficiencies?: Record<string, number>;
    melt?: { gene: string; checked: number; single: number; none: number; multi: { sample: string; well: string; tm: number | null }[] }[];
  },
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, aoaToSheet(resultAoa(out)), 'ΔΔCt结果');
  XLSX.utils.book_append_sheet(wb, aoaToSheet(rawAoa(rows, flags)), '原始数据与QC');
  if (out.ntcReport.length > 0) {
    XLSX.utils.book_append_sheet(wb, aoaToSheet(ntcAoa(out.ntcReport)), 'NTC污染检查');
  }
  if (meta.melt && meta.melt.length > 0) {
    XLSX.utils.book_append_sheet(wb, aoaToSheet(meltAoa(meta.melt)), '熔解检查');
  }
  const info: (string | number)[][] = [
    ['PCR Workbench · PCR 工作台', ''],
    ['源文件', meta.fileName],
    ['内参基因（池化）', meta.refGenes.join('、')],
    ['对照组样本', meta.controlSamples.join('、')],
    ['方法', 'Livak 2^-ΔΔCt；统计在个体 ΔCt 上（2组 Welch t / 多组单因素 ANOVA + Dunnett）'],
    ...Object.entries(meta.efficiencies ?? {})
      .filter(([, v]) => Number.isFinite(v) && v !== 100)
      .map(([g, v]) => [`效率 ${g}`, `${v}%（E=${(1 + v / 100).toFixed(3)}，Pfaffl 校正生效）`]),
    ['导出时间', new Date().toLocaleString('zh-CN')],
  ];
  XLSX.utils.book_append_sheet(wb, aoaToSheet(info), '项目信息');
  return wb;
}

/** 工作簿 → 二进制（供浏览器 Blob 下载）。 */
export function workbookToBuffer(wb: XLSX.WorkBook): ArrayBuffer {
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

/** CSV 序列化（RFC 4180 引号规则，UTF-8 BOM 便于 Excel 直接打开中文）。 */
export function toCsv(aoa: (string | number)[][]): string {
  const esc = (v: string | number): string => {
    const s = String(v ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + aoa.map((row) => row.map(esc).join(',')).join('\r\n');
}

/** 触发浏览器下载（UI 层调用）。 */
export function downloadBlob(data: BlobPart, filename: string, mediaType: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mediaType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadWorkbook(wb: XLSX.WorkBook, filename: string): void {
  downloadBlob(workbookToBuffer(wb), filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

export function downloadCsv(aoa: (string | number)[][], filename: string): void {
  downloadBlob(toCsv(aoa), filename, 'text/csv;charset=utf-8');
}

export function downloadSvg(svg: SVGSVGElement, filename: string): void {
  const xml = new XMLSerializer().serializeToString(svg);
  downloadBlob('\uFEFF' + xml, filename, 'image/svg+xml;charset=utf-8');
}

export function downloadSvgAsPng(svg: SVGSVGElement, filename: string, scale = 2): Promise<void> {
  return new Promise((resolve, reject) => {
    const xml = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const rect = svg.getBoundingClientRect();
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = rect.width * scale;
      canvas.height = rect.height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('无法创建画布'));
        return;
      }
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('PNG 编码失败'));
          return;
        }
        downloadBlob(blob, filename, 'image/png');
        resolve();
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG 渲染失败'));
    };
    img.src = url;
  });
}
