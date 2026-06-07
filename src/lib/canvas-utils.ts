/**
 * Shared canvas utilities: hit-testing, gap calculation, unit conversion, crop helpers.
 */

import { LayoutCell } from '../shared/types';

// Re-export gap ruler types and functions from dedicated module
export { findNearestGaps, drawGapRulers, rectGap, type GapInfo } from './gap-ruler';

/** Convert pixels to cm string */
export function pxToCm(px: number, dpi: number): string {
  return (px * 2.54 / dpi).toFixed(2);
}

/** Hit-test: find the top-most cell at canvas coordinates (x, y) */
export function hitTest(cells: LayoutCell[], x: number, y: number): LayoutCell | null {
  for (let i = cells.length - 1; i >= 0; i--) {
    const c = cells[i];
    if (x >= c.x && x < c.x + c.drawWidth && y >= c.y && y < c.y + c.drawHeight) {
      return c;
    }
  }
  return null;
}

/** Get source crop rectangle from a layout cell (uses correct trim dimensions) */
export function getSrcCropRect(cell: LayoutCell): { trimX: number; trimY: number; trimW: number; trimH: number } {
  return {
    trimX: cell.srcTrimX,
    trimY: cell.srcTrimY,
    trimW: cell.srcTrimWidth,
    trimH: cell.srcTrimHeight,
  };
}
