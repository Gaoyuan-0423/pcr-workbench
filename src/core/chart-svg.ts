import { annotationText, type ChartBar } from './chart-bars';
import type { ChartOptions } from './chart-options';

const M = { top: 64, right: 28, bottom: 78, left: 84 };
const SEG_GAP = 26; // 基因段之间的间隔

/** 多基因分段柱状图 SVG：每基因一段，段内按样本排柱。 */
export function multiGeneChartSvg(
  segments: { gene: string; bars: ChartBar[] }[],
  opts: ChartOptions,
): string {
  const W = opts.width;
  const H = opts.height;
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  // Y 轴范围
  const allVals = segments.flatMap((s) => s.bars.map((b) => b.value + b.err)).filter(Number.isFinite);
  const dataMax = allVals.length ? Math.max(...allVals) : 1;
  const yMax = opts.yMax != null ? opts.yMax : niceCeil(dataMax * 1.18);
  const yMin = opts.yMin != null ? opts.yMin : 0;
  const yOf = (v: number) => M.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const yTicks: number[] = [];
  const step = niceCeil((yMax - yMin) / 5);
  for (let v = yMin; v <= yMax; v += step) yTicks.push(v);

  const totalBars = segments.reduce((s, seg) => s + seg.bars.length, 0);
  const slot = plotW / Math.max(totalBars, 1);
  const barW = Math.min(slot * 0.62, 64);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="chart">`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
  );
  if (opts.title) parts.push(`<text x="${M.left}" y="26" font-size="17" font-weight="700" fill="#1d2b32" font-family="sans-serif">${esc(opts.title)}</text>`);
  if (opts.subtitle) parts.push(`<text x="${M.left}" y="46" font-size="12" fill="#5f7480" font-family="sans-serif">${esc(opts.subtitle)}</text>`);

  // Y 轴刻度与网格
  for (let v = yMin; v <= yMax + 1e-9; v += step) {
    const y = yOf(v);
    parts.push(`<line x1="${M.left}" x2="${W - M.right}" y1="${y}" y2="${y}" stroke="${v === yMin ? '#1d2b32' : '#e4ebee'}"/>`);
    parts.push(`<text x="${M.left - 8}" y="${y + 4}" font-size="11.5" fill="#5f7480" text-anchor="end" font-family="sans-serif">${fmtTick(v)}</text>`);
  }
  parts.push(`<line x1="${M.left}" x2="${M.left}" y1="${M.top}" y2="${M.top + plotH}" stroke="#1d2b32" stroke-width="1.2"/>`);

  // 各基因段
  let cursor = M.left;
  for (const seg of segments) {
    if (seg.bars.length === 0) continue;
    const segW = slot * seg.bars.length;
    const segStart = cursor;
    for (let i = 0; i < seg.bars.length; i++) {
      const b = seg.bars[i];
      const cx = segStart + slot * i + slot / 2;
      const x = cx - barW / 2;
      const y = yOf(Math.max(yMin, b.value));
      const h = Math.max(0, M.top + plotH - y);
      const yTop = yOf(Math.max(yMin, b.value + b.err));
      const yBot = yOf(Math.max(yMin, b.value - b.err));
      parts.push(`<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${b.color}" rx="2"/>`);
      if (opts.errorBar !== 'none' && b.err > 0) {
        const half = barW * 0.22;
        parts.push(
          `<line x1="${cx}" x2="${cx}" y1="${yTop}" y2="${yBot}" stroke="#1d2b32" stroke-width="1.3"/>`,
          `<line x1="${cx - half}" x2="${cx + half}" y1="${yTop}" y2="${yTop}" stroke="#1d2b32" stroke-width="1.3"/>`,
          `<line x1="${cx - half}" x2="${cx + half}" y1="${yBot}" y2="${yBot}" stroke="#1d2b32" stroke-width="1.3"/>`,
        );
      }
      const note = annotationText(opts, b);
      if (note) {
        const big = note.startsWith('*');
        parts.push(`<text x="${cx}" y="${yTop - 8}" font-size="${big ? 15 : 11}" font-weight="${big ? 700 : 400}" text-anchor="middle" fill="${big ? '#1d2b32' : '#8a9aa3'}" font-family="sans-serif">${esc(note)}</text>`);
      }
      parts.push(
        `<text x="${cx}" y="${M.top + plotH + 18}" font-size="11.5" text-anchor="middle" fill="#1d2b32" font-family="sans-serif">${esc(short(b.sample))}</text>`,
      );
    }
    // 基因段标签 + 分隔
    const segMid = segStart + slot * seg.bars.length / 2;
    parts.push(`<text x="${segMid}" y="${M.top + plotH + 38}" font-size="12.5" font-weight="600" text-anchor="middle" fill="#0a5c4c" font-family="sans-serif">${esc(seg.gene)}</text>`);
    cursor = segStart + segW + SEG_GAP;
    if (cursor < W - M.right) {
      parts.push(`<line x1="${cursor - SEG_GAP / 2}" x2="${cursor - SEG_GAP / 2}" y1="${M.top}" y2="${M.top + plotH}" stroke="#dfe7ea" stroke-dasharray="3,3"/>`);
    }
  }

  // X 轴标题
  if (opts.xLabel) {
    parts.push(`<text x="${M.left + plotW / 2}" y="${H - 16}" font-size="12.5" text-anchor="middle" fill="#1d2b32" font-family="sans-serif">${esc(opts.xLabel)}</text>`);
  }
  parts.push('</svg>');
  return parts.join('');
}

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function short(s: string): string {
  return s.length > 14 ? s.slice(0, 13) + '…' : s;
}
function niceCeil(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * base >= v) return m * base;
  return 10 * base;
}
function fmtTick(v: number): string {
  if (v === 0) return '0';
  if (v >= 1000) return Math.round(v / 1000) + 'k';
  return String(Math.round(v * 100) / 100);
}
