import { describe, it, expect } from 'vitest';
import { rectGap, findNearestGaps } from '../gap-ruler';
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

describe('rectGap', () => {
  it('computes horizontal gap between two side-by-side cells', () => {
    const a = makeCell({ cellId: 'a', x: 0, y: 0, drawWidth: 100, drawHeight: 100 });
    const b = makeCell({ cellId: 'b', x: 120, y: 0, drawWidth: 100, drawHeight: 100 });
    const gap = rectGap(a, b);
    expect(gap.gapH).toBe(20);
    expect(gap.type).toBe('h');
  });

  it('computes vertical gap between two stacked cells', () => {
    const a = makeCell({ cellId: 'a', x: 0, y: 0, drawWidth: 100, drawHeight: 100 });
    const b = makeCell({ cellId: 'b', x: 0, y: 130, drawWidth: 100, drawHeight: 100 });
    const gap = rectGap(a, b);
    expect(gap.gapV).toBe(30);
    expect(gap.type).toBe('v');
  });

  it('computes diagonal gap for non-aligned cells', () => {
    const a = makeCell({ cellId: 'a', x: 0, y: 0, drawWidth: 100, drawHeight: 100 });
    const b = makeCell({ cellId: 'b', x: 120, y: 120, drawWidth: 100, drawHeight: 100 });
    const gap = rectGap(a, b);
    expect(gap.gapH).toBe(20);
    expect(gap.gapV).toBe(20);
    expect(gap.type).toBe('d');
    expect(gap.gap).toBeCloseTo(Math.sqrt(20 * 20 + 20 * 20));
  });

  it('returns zero gap for overlapping cells', () => {
    const a = makeCell({ cellId: 'a', x: 0, y: 0, drawWidth: 100, drawHeight: 100 });
    const b = makeCell({ cellId: 'b', x: 50, y: 50, drawWidth: 100, drawHeight: 100 });
    const gap = rectGap(a, b);
    expect(gap.gap).toBe(0);
  });
});

describe('findNearestGaps', () => {
  it('excludes the active cell itself by cellId', () => {
    const active = makeCell({ cellId: 'active', imageId: 'img-1', x: 0, y: 0 });
    const other = makeCell({ cellId: 'other', imageId: 'img-1', x: 200, y: 0 });
    const result = findNearestGaps(active, [active, other], 3);
    // active cell should be filtered out
    expect(result.every(r => r.cell.cellId !== 'active')).toBe(true);
    expect(result.length).toBe(1);
  });

  it('includes same-image copies (different cellId) in results', () => {
    const active = makeCell({ cellId: 'copy-1', imageId: 'shared', x: 0, y: 0 });
    const copy = makeCell({ cellId: 'copy-2', imageId: 'shared', x: 200, y: 0 });
    const result = findNearestGaps(active, [active, copy], 3);
    // copy-2 should be included (same imageId but different cellId)
    expect(result.some(r => r.cell.cellId === 'copy-2')).toBe(true);
  });

  it('returns nearest N gaps sorted by distance', () => {
    const active = makeCell({ cellId: 'a', x: 0, y: 0 });
    const near = makeCell({ cellId: 'near', x: 110, y: 0 });    // 10px gap
    const mid = makeCell({ cellId: 'mid', x: 150, y: 0 });      // 50px gap
    const far = makeCell({ cellId: 'far', x: 300, y: 0 });      // 200px gap

    const result = findNearestGaps(active, [active, near, mid, far], 2);
    expect(result.length).toBe(2);
    expect(result[0].cell.cellId).toBe('near');
    expect(result[1].cell.cellId).toBe('mid');
  });
});
