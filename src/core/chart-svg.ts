import { annotationText, type ChartBar } from './chart-bars';
import type { ChartOptions } from './chart-options';

const M = { top: 64, right: 28, bottom: 96, left: 84 };
const SEG_GAP = 26; // 基因段之间的间隔
const BREAK_H = 9; // 截断标记半高

type Scale = (v: number) => number;

function makeScale(opts: ChartOptions, yMin: number, yMax: number): { toY: Scale; ticks: number[] } {
  if (opts.yScale === 'linear' || yMin <= 0) {
    const toY: Scale = (v) => yMin + ((v - yMin) / (yMax - yMin)) * (yMax - yMin); // 占位，实际线性比例在调用处换算
    const linear: Scale = (v) => v;
    void toY;
    const ticks: number[] = [];
    const step = niceCeil((yMax - yMin) / 5);
    for (let v = Math.ceil(yMin / step) * step; v <= yMax + 1e-9; v += step) ticks.push(v);
    return { toY: linear, ticks };
  }
  const base = opts.yScale === 'log2' ? 2 : 10;
  const lg = (v: number) => Math.log(v) / Math.log(base);
  const lo = Math.floor(lg(yMin));
  const hi = Math.ceil(lg(yMax));
  const ticks: number[] = [];
  for (let k = lo; k <= hi; k++) ticks.push(Math.pow(base, k));
  const toY: Scale = (v) => lg(Math.max(v, yMin));
  return { toY, ticks };
}

/** 多基因分段柱状图 SVG：每基因一段，段内按样本排柱。支持线性/对数 Y 轴、
 *  手动范围越界时的轴截断标记、名称覆盖。 */
export function multiGeneChartSvg(
  segments: { gene: string; bars: ChartBar[] }[],
  opts: ChartOptions,
): string {
  const W = opts.width;
  const H = opts.height;
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  const useLog = opts.yScale !== 'linear';
  const allVals = segments.flatMap((s) => s.bars.flatMap((b) => [b.value, b.value + b.err])).filter((v) => Number.isFinite(v) && v > 0);
  const dataMax = allVals.length ? Math.max(...allVals) : 1;
  const dataMin = allVals.length ? Math.min(...allVals) : 0.5;

  let yMin = opts.yMin != null ? opts.yMin : useLog ? Math.pow(2, Math.floor(Math.log2(Math.max(dataMin * 0.6, 0.01)))) : 0;
  let yMax = opts.yMax != null ? opts.yMax : useLog ? Math.pow(2, Math.ceil(Math.log2(dataMax * 1.3))) : niceCeil(dataMax * 1.18);
  if (useLog && (yMin <= 0 || yMax <= yMin)) {
    yMin = 0.25;
    yMax = niceCeil(dataMax * 1.3);
  }
  const clamped = !useLog && opts.yMax != null && dataMax > yMax; // 线性 + 手动上限低于数据 → 截断
  const lg = (v: number) => (useLog ? Math.log(v) / Math.log(opts.yScale === 'log2' ? 2 : 10) : v);
  const toY = (v: number) => M.top + plotH - ((lg(Math.max(v, yMin)) - lg(yMin)) / (lg(yMax) - lg(yMin) || 1)) * plotH;

  const { ticks } = makeScale(opts, yMin, yMax);
  const totalBars = segments.reduce((s, seg) => s + seg.bars.length, 0);
  const slot = plotW / Math.max(totalBars, 1);
  const barW = Math.min(slot * 0.62, 64);
  const clipId = 'plotclip' + Math.round(Math.random() * 1e6);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="chart">`,
    `<defs><clipPath id="${clipId}"><rect x="${M.left}" y="${M.top}" width="${plotW}" height="${plotH}"/></clipPath></defs>`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
  );
  if (opts.title) parts.push(`<text x="${M.left}" y="26" font-size="17" font-weight="700" fill="#1d2b32" font-family="sans-serif">${esc(opts.title)}</text>`);
  if (opts.subtitle) parts.push(`<text x="${M.left}" y="46" font-size="12" fill="#5f7480" font-family="sans-serif">${esc(opts.subtitle)}</text>`);

  for (const tv of ticks) {
    if (tv < yMin || tv > yMax) continue;
    const y = toY(tv);
    const label = useLog ? tickLabel(tv) : fmtTick(tv);
    parts.push(`<line x1="${M.left}" x2="${W - M.right}" y1="${y}" y2="${y}" stroke="${tv === yMin ? '#1d2b32' : '#e4ebee'}"/>`);
    parts.push(`<text x="${M.left - 8}" y="${y + 4}" font-size="11.5" fill="#5f7480" text-anchor="end" font-family="sans-serif">${esc(label)}</text>`);
  }
  parts.push(`<line x1="${M.left}" x2="${M.left}" y1="${M.top}" y2="${M.top + plotH}" stroke="#1d2b32" stroke-width="1.2"/>`);

  // 截断标记（数据被手动范围裁掉时，在 Y 轴上画双斜线）
  if (clamped) {
    const by = M.top + 6;
    parts.push(
      `<g stroke="#1d2b32" stroke-width="1.4">`,
      `<line x1="${M.left - 6}" x2="${M.left + 6}" y1="${by + BREAK_H}" y2="${by}"/>`,
      `<line x1="${M.left - 6}" x2="${M.left + 6}" y1="${by + BREAK_H * 2}" y2="${by + BREAK_H}"/>`,
      `</g>`,
    );
  }

  parts.push(`<g clip-path="url(#${clipId})">`);
  let cursor = M.left;
  for (const seg of segments) {
    if (seg.bars.length === 0) continue;
    const segStart = cursor;
    for (let i = 0; i < seg.bars.length; i++) {
      const b = seg.bars[i];
      const cx = segStart + slot * i + slot / 2;
      const x = cx - barW / 2;
      const y = toY(Math.max(yMin, b.value));
      const h = Math.max(0, M.top + plotH - y);
      const yTop = toY(Math.max(yMin, b.value + b.err));
      const yBot = toY(Math.max(yMin, b.value - b.err));
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
        const ny = clamped && b.value > yMax ? M.top + 14 : Math.max(M.top + 12, yTop - 8);
        parts.push(`<text x="${cx}" y="${ny}" font-size="${big ? 15 : 11}" font-weight="${big ? 700 : 400}" text-anchor="middle" fill="${big ? '#1d2b32' : '#8a9aa3'}" font-family="sans-serif">${esc(note)}</text>`);
      }
      parts.push(
        `<text x="${cx}" y="${M.top + plotH + 18}" font-size="11.5" text-anchor="middle" fill="#1d2b32" font-family="sans-serif">${esc(short(b.label))}</text>`,
      );
    }
    const segMid = segStart + (slot * seg.bars.length) / 2;
    parts.push(`<text x="${segMid}" y="${M.top + plotH + 40}" font-size="12.5" font-weight="600" text-anchor="middle" fill="#0a5c4c" font-family="sans-serif">${esc(seg.gene)}</text>`);
    cursor = segStart + slot * seg.bars.length + SEG_GAP;
    if (cursor < W - M.right) {
      parts.push(`<line x1="${cursor - SEG_GAP / 2}" x2="${cursor - SEG_GAP / 2}" y1="${M.top}" y2="${M.top + plotH}" stroke="#dfe7ea" stroke-dasharray="3,3"/>`);
    }
  }
  parts.push('</g>');

  if (opts.xLabel) {
    parts.push(`<text x="${M.left + plotW / 2}" y="${H - 14}" font-size="12.5" text-anchor="middle" fill="#1d2b32" font-family="sans-serif">${esc(opts.xLabel)}</text>`);
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
function tickLabel(v: number): string {
  // 对数刻度按 2^k / 10^k 出现，值多为非整数幂；显示为数值
  const r = Math.round(v * 1000) / 1000;
  if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r));
  return String(r);
}
