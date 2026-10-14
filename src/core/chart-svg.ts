import { annotationText, type ChartBar } from './chart-bars';
import type { ChartOptions } from './chart-options';

const M = { top: 70, right: 28, bottom: 96, left: 84 };
const SEG_GAP = 18; // 基因段之间的间隔
const BREAK_H = 9; // 截断标记半高
const BRACKET_STEP = 14; // 多个显著性括号的层间距

/** 多基因分段柱状图 SVG（经典出版样式）：
 *  - X 轴为基因（分段），段内各样本并排，对照在左
 *  - 柱色按组别（对照色 / 处理色）
 *  - 显著性以括号线架在"对照 vs 处理"上方（星号或 p 值） */
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
  const dataMin = allVals.length ? Math.min(...allVals.filter((v) => v > 0)) : 0.5;

  let yMin = opts.yMin != null ? opts.yMin : useLog ? Math.pow(2, Math.floor(Math.log2(Math.max(dataMin * 0.6, 0.01)))) : 0;
  let yMax = opts.yMax != null ? opts.yMax : useLog ? Math.pow(2, Math.ceil(Math.log2(dataMax * 1.3))) : niceCeil(dataMax * 1.18);
  if (useLog && (yMin <= 0 || yMax <= yMin)) {
    yMin = 0.25;
    yMax = niceCeil(dataMax * 1.3);
  }
  // 截断：开关打开且上限未手动设置时，自动取"次高柱顶部"作为截断位置
  if (opts.axisBreak && opts.yMax == null && segments.length > 0) {
    const tops = segments
      .flatMap((s) => s.bars.map((b) => b.value + b.err))
      .filter((v) => Number.isFinite(v) && v > 0)
      .sort((a, b) => b - a);
    if (tops.length >= 2) yMax = niceCeil(tops[1] * 1.1);
    else if (tops.length === 1) yMax = niceCeil(tops[0] * 1.1);
  }
  const clamped = !useLog && dataMax > yMax + 1e-9; // 有柱子被上限裁掉 → 画截断标记

  const lg = (v: number) => (useLog ? Math.log(v) / Math.log(opts.yScale === 'log2' ? 2 : 10) : v);
  const toY = (v: number) => M.top + plotH - ((lg(Math.max(v, yMin)) - lg(yMin)) / (lg(yMax) - lg(yMin) || 1)) * plotH;

  const ticks: number[] = [];
  if (useLog) {
    const lo = Math.floor(lg(yMin));
    const hi = Math.ceil(lg(yMax));
    for (let k = lo; k <= hi; k++) ticks.push(Math.pow(opts.yScale === 'log2' ? 2 : 10, k));
  } else {
    const step = niceCeil((yMax - yMin) / 5);
    for (let v = Math.ceil(yMin / step) * step; v <= yMax + 1e-9; v += step) ticks.push(v);
  }

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
    if (tv < yMin - 1e-9 || tv > yMax + 1e-9) continue;
    const y = toY(tv);
    const label = useLog ? logTickLabel(tv) : fmtTick(tv);
    parts.push(`<line x1="${M.left}" x2="${W - M.right}" y1="${y}" y2="${y}" stroke="${Math.abs(tv - yMin) < 1e-9 ? '#1d2b32' : '#e4ebee'}"/>`);
    parts.push(`<text x="${M.left - 8}" y="${y + 4}" font-size="11.5" fill="#5f7480" text-anchor="end" font-family="sans-serif">${esc(label)}</text>`);
  }
  parts.push(`<line x1="${M.left}" x2="${M.left}" y1="${M.top}" y2="${M.top + plotH}" stroke="#1d2b32" stroke-width="1.2"/>`);

  // 截断标记（双斜线画在 Y 轴上部）
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
    const centers: number[] = [];
    const tops: number[] = [];
    for (let i = 0; i < seg.bars.length; i++) {
      const b = seg.bars[i];
      const cx = segStart + slot * i + slot / 2;
      centers.push(cx);
      const y = toY(Math.max(yMin, b.value));
      const h = Math.max(0, M.top + plotH - y);
      const yTop = toY(Math.max(yMin, b.value + b.err));
      const yBot = toY(Math.max(yMin, b.value - b.err));
      tops.push(Math.min(yTop, y));
      parts.push(`<rect x="${cx - barW / 2}" y="${y}" width="${barW}" height="${h}" fill="${b.color}" rx="2"/>`);
      if (opts.errorBar !== 'none' && b.err > 0) {
        const half = barW * 0.22;
        parts.push(
          `<line x1="${cx}" x2="${cx}" y1="${yTop}" y2="${yBot}" stroke="#1d2b32" stroke-width="1.3"/>`,
          `<line x1="${cx - half}" x2="${cx + half}" y1="${yTop}" y2="${yTop}" stroke="#1d2b32" stroke-width="1.3"/>`,
          `<line x1="${cx - half}" x2="${cx + half}" y1="${yBot}" y2="${yBot}" stroke="#1d2b32" stroke-width="1.3"/>`,
        );
      }
      parts.push(
        `<text x="${cx}" y="${M.top + plotH + 18}" font-size="11.5" text-anchor="middle" fill="#1d2b32" font-family="sans-serif">${esc(short(b.label))}</text>`,
      );
    }

    // 显著性括号：对照中心 ↔ 各处理柱，逐个抬高避免重叠
    const ctrlIdx = seg.bars.map((b, i) => ({ b, i })).filter((x) => x.b.isControl).map((x) => x.i);
    if (ctrlIdx.length > 0 && opts.showP !== 'none') {
      let level = 0;
      for (let i = 0; i < seg.bars.length; i++) {
        const b = seg.bars[i];
        if (b.isControl) continue;
        const note = annotationText(opts, b);
        if (!note) continue;
        const xL = centers[ctrlIdx[0]];
        const xR = centers[i];
        const topPair = Math.min(tops[ctrlIdx[0]] ?? M.top + plotH, tops[i]);
        const yB = Math.max(M.top + 10, topPair - 8 - level * BRACKET_STEP);
        parts.push(
          `<path d="M ${xL} ${yB + 6} L ${xL} ${yB} L ${xR} ${yB} L ${xR} ${yB + 6}" fill="none" stroke="#1d2b32" stroke-width="1.3"/>`,
          `<text x="${(xL + xR) / 2}" y="${yB - 4}" font-size="13" font-weight="600" text-anchor="middle" fill="#1d2b32" font-family="sans-serif">${esc(note)}</text>`,
        );
        level += 1;
      }
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
function logTickLabel(v: number): string {
  const r = Math.round(v * 1000) / 1000;
  if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r));
  return String(r);
}
