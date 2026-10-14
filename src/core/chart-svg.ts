import { annotationText, type ChartBar } from './chart-bars';
import type { ChartOptions } from './chart-options';

const M = { top: 70, right: 28, bottom: 96, left: 84 };
const SEG_GAP = 56; // 基因段之间的间隔
const BAR_INNER_GAP = 10; // 段内柱间距
const BREAK_H = 9; // 截断标记半高
const BRACKET_STEP = 16; // 多个显著性括号的层间距

export interface SegmentInput {
  gene: string;
  bars: ChartBar[];
}

function barWidth(groupWidth: number): number {
  // 组内总宽度比例 0.8（默认）对应基准柱宽 52px
  return Math.round(Math.min(110, Math.max(14, 52 * (groupWidth / 0.8))));
}

function fontFamilyCss(family: ChartOptions['fontFamily']): string {
  if (family === 'Times New Roman') return "'Times New Roman', serif";
  if (family === 'Arial') return 'Arial, sans-serif';
  return 'sans-serif';
}

/** 图表总宽随内容自适应（柱子紧挨成组，不摊开）。 */
export function computeChartWidth(
  segments: SegmentInput[],
  opts: { groupWidth: number; fontSize: number },
): number {
  const barW = barWidth(opts.groupWidth);
  const totalBars = segments.reduce((s, seg) => s + seg.bars.length, 0);
  const segCount = segments.filter((s) => s.bars.length > 0).length || 1;
  const content =
    M.left + M.right + totalBars * (barW + BAR_INNER_GAP) + segCount * SEG_GAP;
  return Math.round(Math.max(480, Math.min(4000, Math.max(content, M.left + M.right + 200))));
}

/** 多基因分段柱状图 SVG（紧凑出版样式）。支持 GraphPad 式双段断轴。 */
export function multiGeneChartSvg(
  segments: SegmentInput[],
  opts: ChartOptions,
): string {
  const barW = barWidth(opts.groupWidth);
  const barStep = barW + BAR_INNER_GAP;
  const W = computeChartWidth(segments, { groupWidth: opts.groupWidth, fontSize: opts.fontSize });
  const H = opts.height;
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const ff = fontFamilyCss(opts.fontFamily);
  const fs = (px: number) => Math.round(px * (opts.fontSize / 12) * 100) / 100;

  const useLog = opts.yScale !== 'linear';
  const allVals = segments
    .flatMap((s) => s.bars.flatMap((b) => [b.value, b.value + b.err]))
    .filter((v) => Number.isFinite(v) && v > 0);
  const dataMax = allVals.length ? Math.max(...allVals) : 1;
  const dataMin = allVals.length ? Math.min(...allVals.filter((v) => v > 0)) : 0.5;

  let yMin = opts.yMin != null ? opts.yMin : 0;
  let yMax = opts.yMax != null ? opts.yMax : niceCeil(dataMax * 1.18);
  if (useLog) {
    // log 轴下限必须 > 0：用户填 0（或默认 0）时回退到数据驱动的 2 的幂
    yMin = opts.yMin != null && opts.yMin > 0 ? opts.yMin : Math.pow(2, Math.floor(Math.log2(Math.max(dataMin * 0.6, 0.01))));
    yMax = opts.yMax != null && opts.yMax > yMin ? opts.yMax : Math.pow(2, Math.ceil(Math.log2(dataMax * 1.3)));
  }

  // 断轴（GraphPad 双段）：下段 [yMin, bottomMax]，上段 [topMin, topMax]
  const brk = opts.yBreak;
  const hasBreak = !!brk && brk.topMin > yMax && brk.topMax > brk.topMin;
  const bottomMax = hasBreak ? brk.bottomMax : yMax;
  const bottomPct = hasBreak && brk.bottomPct > 5 && brk.bottomPct < 95 ? brk.bottomPct : 70;
  const bottomH = hasBreak ? plotH * (bottomPct / 100) : plotH;
  const topH = hasBreak ? plotH - bottomH : 0;
  const topMin = hasBreak ? brk.topMin : 0;
  const topMax = hasBreak ? brk.topMax : 0;
  const clamped = !useLog && dataMax > yMax + 1e-9; // 有柱子被上限裁掉 → 画截断标记

  const toY = (v: number): number => {
    if (hasBreak) {
      if (v <= bottomMax) {
        return M.top + topH + (1 - (v - yMin) / (bottomMax - yMin)) * bottomH;
      }
      return M.top + (1 - (v - topMin) / (topMax - topMin)) * topH;
    }
    if (useLog) {
      return M.top + plotH - ((lg(v, opts.yScale) - lg(yMin, opts.yScale)) / (lg(yMax, opts.yScale) - lg(yMin, opts.yScale))) * plotH;
    }
    return M.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  };
  const lg = (v: number, scale: 'linear' | 'log2' | 'log10') =>
    scale === 'linear' ? v : Math.log(v) / Math.log(scale === 'log2' ? 2 : 10);

  // 刻度：断轴时下/上段各自生成
  const tickLines: { y: number; label: string; major: boolean }[] = [];
  if (hasBreak) {
    const step = niceCeil((bottomMax - yMin) / 4);
    for (let v = Math.ceil(yMin / step) * step; v <= bottomMax + 1e-9; v += step) {
      tickLines.push({ y: toY(v), label: fmtTick(v), major: false });
    }
    const tStep = niceCeil((topMax - topMin) / 3);
    for (let v = topMin; v <= topMax + 1e-9; v += tStep) {
      tickLines.push({ y: toY(v), label: fmtTick(v), major: false });
    }
  } else if (useLog) {
    const lo = Math.floor(lg(yMin, opts.yScale));
    const hi = Math.ceil(lg(yMax, opts.yScale));
    for (let k = lo; k <= hi; k++) {
      const v = Math.pow(opts.yScale === 'log2' ? 2 : 10, k);
      tickLines.push({ y: toY(v), label: logTickLabel(v), major: false });
    }
  } else {
    const step = niceCeil((yMax - yMin) / 5);
    for (let v = Math.ceil(yMin / step) * step; v <= yMax + 1e-9; v += step) {
      tickLines.push({ y: toY(v), label: fmtTick(v), major: false });
    }
  }

  const clipId = 'plotclip' + Math.round(Math.random() * 1e6);
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="chart">`,
    `<defs><clipPath id="${clipId}"><rect x="${M.left}" y="${M.top}" width="${plotW}" height="${plotH}"/></clipPath></defs>`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
  );
  if (opts.title) parts.push(`<text x="${M.left}" y="26" font-size="${fs(17)}" font-weight="700" fill="#1d2b32" font-family="${ff}">${esc(opts.title)}</text>`);
  if (opts.subtitle) parts.push(`<text x="${M.left}" y="${fs(46)}" font-size="${fs(12)}" fill="#5f7480" font-family="${ff}">${esc(opts.subtitle)}</text>`);

  for (const t of tickLines) {
    parts.push(`<text x="${M.left - 8}" y="${t.y + 4}" font-size="${fs(11.5)}" fill="#5f7480" text-anchor="end" font-family="${ff}">${esc(t.label)}</text>`);
  }
  // 组别图例（右上角，按出现顺序去重）
  const legendItems: { label: string; color: string }[] = [];
  for (const seg of segments) {
    for (const b of seg.bars) {
      if (!legendItems.some((l) => l.label === b.label)) legendItems.push({ label: b.label, color: b.color });
    }
  }
  // 断轴截断线（两条斜线）；无断轴但手动上限裁掉数据时在轴顶部同样标记
  if (hasBreak) {
    const by = M.top + topH;
    parts.push(
      `<line x1="${M.left - 6}" x2="${M.left + 6}" y1="${by + BREAK_H}" y2="${by}" stroke="#1d2b32" stroke-width="1.4"/>`,
      `<line x1="${M.left - 6}" x2="${M.left + 6}" y1="${by + BREAK_H * 2}" y2="${by + BREAK_H}" stroke="#1d2b32" stroke-width="1.4"/>`,
      `<line x1="${M.left}" x2="${W - M.right}" y1="${by}" y2="${by}" stroke="#ffffff" stroke-width="2"/>`,
      `<line x1="${M.left}" x2="${M.left}" y1="${by + BREAK_H * 2}" y2="${M.top + plotH}" stroke="#1d2b32" stroke-width="1.2"/>`,
      `<line x1="${M.left}" x2="${M.left}" y1="${M.top}" y2="${by}" stroke="#1d2b32" stroke-width="1.2"/>`,
    );
  } else if (clamped) {
    const by = M.top + 6;
    parts.push(
      `<line x1="${M.left - 6}" x2="${M.left + 6}" y1="${by + BREAK_H}" y2="${by}" stroke="#1d2b32" stroke-width="1.4"/>`,
      `<line x1="${M.left - 6}" x2="${M.left + 6}" y1="${by + BREAK_H * 2}" y2="${by + BREAK_H}" stroke="#1d2b32" stroke-width="1.4"/>`,
    );
  }
  parts.push(`<line x1="${M.left}" x2="${M.left}" y1="${M.top}" y2="${M.top + plotH}" stroke="#1d2b32" stroke-width="1.2"/>`);
  parts.push(`<line x1="${M.left}" x2="${W - M.right}" y1="${M.top + plotH}" y2="${M.top + plotH}" stroke="#1d2b32" stroke-width="1.2"/>`);

  parts.push(`<g clip-path="url(#${clipId})">`);
  let cursor = M.left + 8;
  for (const seg of segments) {
    if (seg.bars.length === 0) continue;
    const segStart = cursor;
    const centers: number[] = [];
    const tops: number[] = [];
    for (let i = 0; i < seg.bars.length; i++) {
      const b = seg.bars[i];
      const cx = segStart + i * barStep + barW / 2;
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
        `<text x="${cx}" y="${M.top + plotH + 18}" font-size="${fs(11.5)}" text-anchor="middle" fill="#1d2b32" font-family="${ff}">${esc(short(b.label))}</text>`,
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
          `<text x="${(xL + xR) / 2}" y="${yB - 4}" font-size="${fs(13)}" font-weight="600" text-anchor="middle" fill="#1d2b32" font-family="${ff}">${esc(note)}</text>`,
        );
        level += 1;
      }
    }

    const segMid = segStart + (seg.bars.length * barStep - BAR_INNER_GAP) / 2;
    parts.push(`<text x="${segMid}" y="${M.top + plotH + fs(40)}" font-size="${fs(12.5)}" font-weight="600" text-anchor="middle" fill="#0a5c4c" font-family="${ff}">${esc(seg.gene)}</text>`);
    cursor = segStart + seg.bars.length * barStep + SEG_GAP;
  }
  parts.push('</g>');

  // 组别图例（仅多基因模式，右上角横排）
  if (segments.length > 1 && legendItems.length > 1) {
    const ly = M.top + 6;
    let lx = W - M.right;
    const itemW = (label: string) => 16 + label.length * fs(6.5) + 14;
    for (const item of [...legendItems].reverse()) {
      const w = itemW(item.label);
      lx -= w;
      if (lx < M.left) break;
      parts.push(
        `<rect x="${lx}" y="${ly}" width="12" height="12" fill="${item.color}" rx="2"/>`,
        `<text x="${lx + 16}" y="${ly + 10}" font-size="${fs(11)}" fill="#1d2b32" font-family="${ff}">${esc(item.label)}</text>`,
      );
    }
  }

  if (opts.xLabel) {
    parts.push(`<text x="${M.left + plotW / 2}" y="${H - 14}" font-size="${fs(12.5)}" text-anchor="middle" fill="#1d2b32" font-family="${ff}">${esc(opts.xLabel)}</text>`);
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
