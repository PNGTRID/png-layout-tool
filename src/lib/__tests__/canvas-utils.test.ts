import { describe, it, expect } from 'vitest';
import { hitTest } from '../canvas-utils';
import type { LayoutCell } from '../../shared/types';

function makeCell(overrides: Partial<LayoutCell> & { cellId: string }): LayoutCell {
  return {
    imageId: 'img-1',
    x: 0,
    y: 0,
    drawWidth: 100,
    drawHeight: 100,
    srcWidth: 100,
    srcHeight: 100,
    srcTrimX: 0,
    srcTrimY: 0,
    srcTrimWidth: 100,
    srcTrimHeight: 100,
    rotated: false,
    ...overrides,
  };
}

describe('hitTest', () => {
  it('finds a cell at its top-left corner', () => {
    const cells = [makeCell({ cellId: 'a', x: 10, y: 10, drawWidth: 50, drawHeight: 50 })];
    expect(hitTest(cells, 10, 10)).toBe(cells[0]);
  });

  it('finds a cell near its bottom-right (exclusive boundary)', () => {
    const cells = [makeCell({ cellId: 'a', x: 10, y: 10, drawWidth: 50, drawHeight: 50 })];
    // x < 10+50, y < 10+50
    expect(hitTest(cells, 59, 59)).toBe(cells[0]);
  });

  it('returns null at exactly the right edge (x === x + drawWidth)', () => {
    const cells = [makeCell({ cellId: 'a', x: 10, y: 10, drawWidth: 50, drawHeight: 50 })];
    expect(hitTest(cells, 60, 30)).toBeNull();
  });

  it('returns null at exactly the bottom edge (y === y + drawHeight)', () => {
    const cells = [makeCell({ cellId: 'a', x: 10, y: 10, drawWidth: 50, drawHeight: 50 })];
    expect(hitTest(cells, 30, 60)).toBeNull();
  });

  it('returns the topmost (last in array) overlapping cell', () => {
    const cells = [
      makeCell({ cellId: 'bottom', x: 0, y: 0, drawWidth: 100, drawHeight: 100 }),
      makeCell({ cellId: 'top', x: 10, y: 10, drawWidth: 50, drawHeight: 50 }),
    ];
    expect(hitTest(cells, 20, 20)?.cellId).toBe('top');
  });

  it('returns null for empty cells array', () => {
    expect(hitTest([], 50, 50)).toBeNull();
  });

  it('returns null for point outside all cells', () => {
    const cells = [makeCell({ cellId: 'a', x: 0, y: 0, drawWidth: 50, drawHeight: 50 })];
    expect(hitTest(cells, 100, 100)).toBeNull();
  });
});
