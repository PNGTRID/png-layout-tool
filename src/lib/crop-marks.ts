/**
 * Crop marks (裁切线) and bleed rendering for print-ready output.
 *
 * Draws registration marks at each cell corner, offset slightly from
 * the content area. Follows standard print conventions:
 * - Two short lines per corner (horizontal + vertical)
 * - Offset from content edge to avoid overlapping artwork
 * - Uniform stroke width in registration black
 */

import { CROP_MARK_LENGTH_CM, CROP_MARK_OFFSET_CM } from '../shared/constants';
import { cmToPx } from './layout-engine';

/**
 * Draw crop marks for all layout cells on a canvas context.
 * Each cell gets 4 corner marks (8 line segments total).
 *
 * @param ctx - Canvas 2D context
 * @param cells - Layout cells to draw marks for
 * @param dpi - Resolution for cm→px conversion
 */
export function drawCropMarks(
  ctx: CanvasRenderingContext2D,
  cells: Array<{ x: number; y: number; drawWidth: number; drawHeight: number }>,
  dpi: number
): void {
  const markLen = cmToPx(CROP_MARK_LENGTH_CM, dpi);
  const offset = cmToPx(CROP_MARK_OFFSET_CM, dpi);

  ctx.save();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;

  for (const cell of cells) {
    const left = cell.x;
    const right = cell.x + cell.drawWidth;
    const top = cell.y;
    const bottom = cell.y + cell.drawHeight;

    // Top-left corner
    drawCornerMark(ctx, left, top, offset, markLen, -1, -1);
    // Top-right corner
    drawCornerMark(ctx, right, top, offset, markLen, 1, -1);
    // Bottom-left corner
    drawCornerMark(ctx, left, bottom, offset, markLen, -1, 1);
    // Bottom-right corner
    drawCornerMark(ctx, right, bottom, offset, markLen, 1, 1);
  }

  ctx.restore();
}

/**
 * Draw a single corner mark: one horizontal line + one vertical line.
 *
 * @param x - Corner X position
 * @param y - Corner Y position
 * @param offset - Distance from corner to start of mark line
 * @param length - Length of mark line
 * @param dirX - Horizontal direction: -1 for left side, +1 for right side
 * @param dirY - Vertical direction: -1 for top side, +1 for bottom side
 */
function drawCornerMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  offset: number,
  length: number,
  dirX: number,
  dirY: number
): void {
  ctx.beginPath();

  // Horizontal line: starts at offset from corner, extends outward
  ctx.moveTo(x + dirX * offset, y);
  ctx.lineTo(x + dirX * (offset + length), y);

  // Vertical line: starts at offset from corner, extends outward
  ctx.moveTo(x, y + dirY * offset);
  ctx.lineTo(x, y + dirY * (offset + length));

  ctx.stroke();
}

