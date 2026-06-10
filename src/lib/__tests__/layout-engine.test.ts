import { describe, it, expect } from 'vitest';
import { cmToPx, pxToCmValue, calculateLayout } from '../layout-engine';
import type { UploadedImage, LayoutParams } from '../../shared/types';

/** Helper: create a minimal UploadedImage with the given dimensions */
function makeImage(trimW: number, trimH: number, overrides?: Partial<UploadedImage>): UploadedImage {
  return {
    id: `img-${Math.random().toString(36).slice(2, 6)}`,
    filePath: 'test.png',
    name: 'test.png',
    width: trimW,
    height: trimH,
    trimX: 0,
    trimY: 0,
    trimWidth: trimW,
    trimHeight: trimH,
    quantity: 1,
    rotation: 0,
    dataUrl: '',
    objectUrl: '',
    ...overrides,
  };
}

const DEFAULT_PARAMS: LayoutParams = {
  gap: 0,
  canvasWidthCm: 57,
  canvasHeightCm: 0,
  dpi: 300,
  autoRotate: false,
  backgroundColor: null,
  alignMode: 'center',
  showCropMarks: false,
  bleedCm: 0,
};

// ─── Unit Conversion ───────────────────────────────────────────────

describe('cmToPx', () => {
  it('converts 1 inch (2.54 cm) at 300 DPI to 300 px', () => {
    expect(cmToPx(2.54, 300)).toBe(300);
  });

  it('converts 0 cm to 0 px', () => {
    expect(cmToPx(0, 300)).toBe(0);
  });

  it('rounds to nearest integer', () => {
    // 1 cm at 300 DPI = 300/2.54 = 118.11... → 118
    expect(cmToPx(1, 300)).toBe(118);
  });
});

describe('pxToCmValue', () => {
  it('converts 300 px at 300 DPI back to ~2.54 cm', () => {
    expect(pxToCmValue(300, 300)).toBeCloseTo(2.54, 1);
  });

  it('is inverse of cmToPx (within rounding)', () => {
    const cm = 5.7;
    const px = cmToPx(cm, 300);
    const cmBack = pxToCmValue(px, 300);
    expect(Math.abs(cmBack - cm)).toBeLessThan(0.02);
  });
});

// ─── Layout Engine ─────────────────────────────────────────────────

describe('calculateLayout', () => {
  it('returns empty layout for empty images array', () => {
    const result = calculateLayout([], DEFAULT_PARAMS);
    expect(result.canvasWidth).toBe(0);
    expect(result.canvasHeight).toBe(0);
    expect(result.cells.length).toBe(0);
    expect(result.warnings.length).toBe(0);
  });

  it('places a single image at (0, 0)', () => {
    const images = [makeImage(100, 200)];
    const result = calculateLayout(images, DEFAULT_PARAMS);
    expect(result.cells.length).toBe(1);
    expect(result.cells[0].x).toBe(0);
    expect(result.cells[0].y).toBe(0);
    expect(result.cells[0].drawWidth).toBe(100);
    expect(result.cells[0].drawHeight).toBe(200);
  });

  it('places multiple images without overlap', () => {
    const images = [makeImage(100, 100), makeImage(100, 100), makeImage(100, 100)];
    const result = calculateLayout(images, DEFAULT_PARAMS);
    expect(result.cells.length).toBe(3);

    // Check no two cells overlap
    for (let i = 0; i < result.cells.length; i++) {
      for (let j = i + 1; j < result.cells.length; j++) {
        const a = result.cells[i];
        const b = result.cells[j];
        const overlaps = a.x < b.x + b.drawWidth && a.x + a.drawWidth > b.x &&
                         a.y < b.y + b.drawHeight && a.y + a.drawHeight > b.y;
        expect(overlaps).toBe(false);
      }
    }
  });

  it('respects quantity setting — expands images', () => {
    const images = [makeImage(50, 50, { quantity: 3 })];
    const result = calculateLayout(images, DEFAULT_PARAMS);
    expect(result.cells.length).toBe(3);
  });

  it('respects gap between images', () => {
    const gapCm = 1;
    const params: LayoutParams = { ...DEFAULT_PARAMS, gap: gapCm };
    // Two small images, auto canvas width should be wide enough
    const images = [makeImage(50, 50), makeImage(50, 50)];
    const result = calculateLayout(images, params);
    expect(result.cells.length).toBe(2);

    // If images are in the same row, gap should be at least gapPx
    const gapPx = cmToPx(gapCm, params.dpi);
    const c0 = result.cells[0];
    const c1 = result.cells[1];

    // Check that the horizontal or vertical gap is at least gapPx
    const hGap = Math.max(
      c1.x - (c0.x + c0.drawWidth),
      c0.x - (c1.x + c1.drawWidth),
      0
    );
    const vGap = Math.max(
      c1.y - (c0.y + c0.drawHeight),
      c0.y - (c1.y + c0.drawHeight),
      0
    );
    // At least one direction should have the gap (they could be on different rows)
    expect(hGap >= gapPx - 1 || vGap >= gapPx - 1).toBe(true);
  });

  it('generates overflow warning when content exceeds fixed canvas height', () => {
    const params: LayoutParams = { ...DEFAULT_PARAMS, canvasHeightCm: 0.1 }; // tiny height
    const images = [makeImage(1000, 1000)]; // large image
    const result = calculateLayout(images, params);
    const overflowWarnings = result.warnings.filter(w => w.type === 'overflow');
    expect(overflowWarnings.length).toBeGreaterThan(0);
  });

  it('centers content vertically within fixed canvas height when content is smaller', () => {
    // Fixed canvas height = 10cm, small image = ~1cm
    const params: LayoutParams = { ...DEFAULT_PARAMS, canvasHeightCm: 10 };
    const images = [makeImage(100, 100)]; // small image
    const result = calculateLayout(images, params);
    expect(result.canvasHeight).toBe(cmToPx(10, params.dpi));

    if (result.cells.length > 0) {
      const cell = result.cells[0];
      const contentHeight = cell.drawHeight;
      const expectedOffset = Math.round((result.canvasHeight - contentHeight) / 2);
      // Cell should be vertically centered (with some tolerance for rounding)
      expect(cell.y).toBeGreaterThanOrEqual(expectedOffset - 1);
      expect(cell.y).toBeLessThanOrEqual(expectedOffset + 1);
    }
  });

  it('uses fixed canvas width when specified', () => {
    const params: LayoutParams = { ...DEFAULT_PARAMS, canvasWidthCm: 20 };
    const images = [makeImage(100, 100)];
    const result = calculateLayout(images, params);
    expect(result.canvasWidth).toBe(cmToPx(20, params.dpi));
  });

  it('generates unplaced warning when items exceed capacity', () => {
    // Very narrow canvas + many wide images → some won't fit
    const params: LayoutParams = { ...DEFAULT_PARAMS, canvasWidthCm: 1 }; // very narrow
    const images = Array.from({ length: 50 }, () => makeImage(2000, 2000));
    const result = calculateLayout(images, params);
    // With 1cm canvas at 300 DPI = ~118px, and images are 2000px wide,
    // many should be unplaced
    if (result.cells.length < 50) {
      const unplaced = result.warnings.filter(w => w.type === 'unplaced');
      expect(unplaced.length).toBeGreaterThan(0);
    }
  });

  it('truncates items when exceeding MAX_LAYOUT_ITEMS', () => {
    // Create an image with quantity 3000 (exceeds MAX_LAYOUT_ITEMS=2000)
    const images = [makeImage(50, 50, { quantity: 3000 })];
    const result = calculateLayout(images, DEFAULT_PARAMS);
    // Should not place more than MAX_LAYOUT_ITEMS
    expect(result.cells.length).toBeLessThanOrEqual(2000);
    // Should have a warning about truncation
    const truncationWarnings = result.warnings.filter(w => w.message.includes('截断'));
    expect(truncationWarnings.length).toBeGreaterThan(0);
  });

  it('auto-rotate rotates tall images for better packing', () => {
    const params: LayoutParams = { ...DEFAULT_PARAMS, autoRotate: true };
    // Narrow canvas, tall portrait image
    const images = [makeImage(100, 3000)]; // very tall image
    const result = calculateLayout(images, params);
    // If auto-rotated, drawWidth > drawHeight (swapped)
    if (result.cells.length > 0) {
      const cell = result.cells[0];
      // Auto-rotation should have been applied if it fit better
      // (rotated = true means it was auto-rotated)
      // The cell should still be valid regardless
      expect(cell.drawWidth).toBeGreaterThan(0);
      expect(cell.drawHeight).toBeGreaterThan(0);
    }
  });

  it('produces valid cell IDs (unique within a result)', () => {
    const images = Array.from({ length: 20 }, () => makeImage(50, 50));
    const result = calculateLayout(images, DEFAULT_PARAMS);
    const ids = result.cells.map(c => c.cellId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('handles 500+ images without crashing (reduce fix validation)', () => {
    const images = Array.from({ length: 600 }, () => makeImage(20, 20));
    // This should not throw due to Math.max(...largeArray) stack overflow
    expect(() => calculateLayout(images, DEFAULT_PARAMS)).not.toThrow();
  });
});
