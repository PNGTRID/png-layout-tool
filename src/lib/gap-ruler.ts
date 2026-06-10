/**
 * Gap ruler — draws distance annotations between layout cells on canvas.
 */

import type { LayoutCell } from '../shared/types';
import {
  COLOR_GAP_RULER, COLOR_GAP_RULER_TEXT,
  RULER_MIN_FONT_SIZE, RULER_FONT_DIVISOR,
  RULER_DOT_MIN_RADIUS, RULER_DOT_DIVISOR,
} from '../shared/constants';
import { pxToCm } from './canvas-utils';

export interface GapInfo {
  gap: number;           // shortest gap px
  gapH: number;          // horizontal gap px
  gapV: number;          // vertical gap px
  type: 'h' | 'v' | 'd';
  ax: number; ay: number;
  bx: number; by: number;
}

/** Compute gap between two layout cells */
export function rectGap(a: LayoutCell, b: LayoutCell): GapInfo {
  const aR = a.x + a.drawWidth, aB = a.y + a.drawHeight;
  const bR = b.x + b.drawWidth, bB = b.y + b.drawHeight;

  const gapH = Math.max(0, Math.max(b.x - aR, a.x - bR));
  const gapV = Math.max(0, Math.max(b.y - aB, a.y - bB));

  let ax = aR, ay = a.y + a.drawHeight / 2;
  let bx = b.x, by = b.y + b.drawHeight / 2;
  let type: 'h' | 'v' | 'd' = 'h';

  if (gapH > 0 && gapV > 0) {
    type = 'd';
    if (gapH <= gapV) {
      const midY = (Math.max(a.y, b.y) + Math.min(aB, bB)) / 2;
      if (b.x > aR) { ax = aR; bx = b.x; } else { ax = a.x; bx = bR; }
      ay = midY; by = midY;
    } else {
      const midX = (Math.max(a.x, b.x) + Math.min(aR, bR)) / 2;
      if (b.y > aB) { ay = aB; by = b.y; } else { ay = a.y; by = bB; }
      ax = midX; bx = midX;
    }
  } else if (gapH > 0) {
    type = 'h';
    const midY = (Math.max(a.y, b.y) + Math.min(aB, bB)) / 2;
    if (b.x > aR) { ax = aR; bx = b.x; } else { ax = a.x; bx = bR; }
    ay = midY; by = midY;
  } else if (gapV > 0) {
    type = 'v';
    const midX = (Math.max(a.x, b.x) + Math.min(aR, bR)) / 2;
    if (b.y > aB) { ay = aB; by = b.y; } else { ay = a.y; by = bB; }
    ax = midX; bx = midX;
  }

  const gap = Math.sqrt(gapH * gapH + gapV * gapV);
  return { gap, gapH, gapV, type, ax, ay, bx, by };
}

/** Find the nearest N gaps from a cell to its neighbours */
export function findNearestGaps(activeCell: LayoutCell, allCells: LayoutCell[], count: number): (GapInfo & { cell: LayoutCell })[] {
  return allCells
    .filter(c => c.cellId !== activeCell.cellId)
    .map(c => ({ cell: c, ...rectGap(activeCell, c) }))
    .sort((a, b) => a.gap - b.gap)
    .slice(0, count);
}

/** Draw gap ruler annotations onto a canvas context */
export function drawGapRulers(
  ctx: CanvasRenderingContext2D,
  nearestGaps: (GapInfo & { cell: LayoutCell })[],
  canvasWidth: number,
  dpi: number
): void {
  if (nearestGaps.length === 0) return;

  ctx.save();

  const baseFontSize = Math.max(RULER_MIN_FONT_SIZE, Math.round(canvasWidth / RULER_FONT_DIVISOR));

  for (const ng of nearestGaps) {
    if (ng.gap <= 0) continue;

    // Annotation line
    ctx.setLineDash([]);
    ctx.strokeStyle = COLOR_GAP_RULER;
    ctx.lineWidth = Math.max(2, Math.round(canvasWidth / 400));
    ctx.beginPath();
    ctx.moveTo(ng.ax, ng.ay);
    ctx.lineTo(ng.bx, ng.by);
    ctx.stroke();

    // Endpoint dots
    const dotR = Math.max(RULER_DOT_MIN_RADIUS, Math.round(canvasWidth / RULER_DOT_DIVISOR));
    ctx.fillStyle = COLOR_GAP_RULER;
    ctx.beginPath();
    ctx.arc(ng.ax, ng.ay, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ng.bx, ng.by, dotR, 0, Math.PI * 2);
    ctx.fill();

    // Label
    const midX = (ng.ax + ng.bx) / 2;
    const midY = (ng.ay + ng.by) / 2;

    const parts: string[] = [];
    if (ng.gapH > 0) parts.push(`→ ${pxToCm(ng.gapH, dpi)} cm`);
    if (ng.gapV > 0) parts.push(`↓ ${pxToCm(ng.gapV, dpi)} cm`);
    const label = parts.join('  ');

    ctx.font = `bold ${baseFontSize}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const tm = ctx.measureText(label);
    const padX = baseFontSize * 0.6;
    const padY = baseFontSize * 0.4;
    const lw = tm.width + padX * 2;
    const lh = baseFontSize + padY * 2;

    const lrx = midX - lw / 2;
    const lry = midY - lh / 2;
    ctx.fillStyle = COLOR_GAP_RULER;
    const r = Math.max(4, baseFontSize * 0.25);
    ctx.beginPath();
    ctx.moveTo(lrx + r, lry);
    ctx.lineTo(lrx + lw - r, lry);
    ctx.arcTo(lrx + lw, lry, lrx + lw, lry + r, r);
    ctx.lineTo(lrx + lw, lry + lh - r);
    ctx.arcTo(lrx + lw, lry + lh, lrx + lw - r, lry + lh, r);
    ctx.lineTo(lrx + r, lry + lh);
    ctx.arcTo(lrx, lry + lh, lrx, lry + lh - r, r);
    ctx.lineTo(lrx, lry + r);
    ctx.arcTo(lrx, lry, lrx + r, lry, r);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = COLOR_GAP_RULER_TEXT;
    ctx.fillText(label, midX, midY);
  }

  ctx.restore();
}
