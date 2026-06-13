import { describe, it, expect } from 'vitest';
import {
  needsVerticalSegmenting,
  exceedsSegmentWidth,
  computeSegmentStartYs,
  sliceLayoutForSegment,
} from '../export-segmented';
import { EXPORT_SEGMENT_MAX_PX } from '../../shared/constants';
import type { LayoutResult, LayoutCell } from '../../shared/types';

function makeCell(id: string, x: number, y: number, w: number, h: number): LayoutCell {
  return {
    cellId: id,
    imageId: 'img1',
    x,
    y,
    drawWidth: w,
    drawHeight: h,
    srcWidth: w,
    srcHeight: h,
    srcTrimX: 0,
    srcTrimY: 0,
    srcTrimWidth: w,
    srcTrimHeight: h,
    rotated: false,
  };
}

describe('needsVerticalSegmenting', () => {
  it('高度在上限内（含恰好=上限）返回 false', () => {
    expect(needsVerticalSegmenting(1000)).toBe(false);
    expect(needsVerticalSegmenting(EXPORT_SEGMENT_MAX_PX)).toBe(false);
  });
  it('高度超上限返回 true', () => {
    expect(needsVerticalSegmenting(EXPORT_SEGMENT_MAX_PX + 1)).toBe(true);
    expect(needsVerticalSegmenting(236220)).toBe(true);
  });
});

describe('exceedsSegmentWidth', () => {
  it('宽度在上限内返回 false，超上限返回 true', () => {
    expect(exceedsSegmentWidth(EXPORT_SEGMENT_MAX_PX)).toBe(false);
    expect(exceedsSegmentWidth(EXPORT_SEGMENT_MAX_PX + 1)).toBe(true);
  });
});

describe('computeSegmentStartYs', () => {
  it('小画布返回单段 [0]', () => {
    expect(computeSegmentStartYs(1000)).toEqual([0]);
  });
  it('恰好=上限返回单段', () => {
    expect(computeSegmentStartYs(EXPORT_SEGMENT_MAX_PX)).toEqual([0]);
  });
  it('超 1px 返回两段，第二段起点=上限', () => {
    expect(computeSegmentStartYs(EXPORT_SEGMENT_MAX_PX + 1)).toEqual([0, EXPORT_SEGMENT_MAX_PX]);
  });
  it('整除返回等间距多段', () => {
    expect(computeSegmentStartYs(EXPORT_SEGMENT_MAX_PX * 3)).toEqual([
      0,
      EXPORT_SEGMENT_MAX_PX,
      EXPORT_SEGMENT_MAX_PX * 2,
    ]);
  });
});

describe('sliceLayoutForSegment', () => {
  const layout: LayoutResult = {
    canvasWidth: 1000,
    canvasHeight: EXPORT_SEGMENT_MAX_PX * 2,
    cells: [
      makeCell('a', 0, 100, 50, 50), // 段 0 内
      makeCell('b', 0, EXPORT_SEGMENT_MAX_PX - 20, 50, 50), // 跨段 0/1 边界
      makeCell('c', 0, EXPORT_SEGMENT_MAX_PX + 100, 50, 50), // 段 1 内
      makeCell('d', 0, EXPORT_SEGMENT_MAX_PX * 2 + 500, 50, 50), // 画布外，不与任何段重叠
    ],
  };

  it('canvasWidth 不变，canvasHeight = segH', () => {
    const seg = sliceLayoutForSegment(layout, 0, EXPORT_SEGMENT_MAX_PX);
    expect(seg.canvasWidth).toBe(1000);
    expect(seg.canvasHeight).toBe(EXPORT_SEGMENT_MAX_PX);
  });

  it('段 0：过滤重叠 cell，y 偏移到段局部（减 segY=0）', () => {
    const seg = sliceLayoutForSegment(layout, 0, EXPORT_SEGMENT_MAX_PX);
    expect(seg.cells.map(c => c.cellId).sort()).toEqual(['a', 'b']);
    expect(seg.cells.find(c => c.cellId === 'a')!.y).toBe(100);
    expect(seg.cells.find(c => c.cellId === 'b')!.y).toBe(EXPORT_SEGMENT_MAX_PX - 20);
  });

  it('段 1：跨段 cell 的 y 变为负值（延伸到段顶之上）', () => {
    const seg = sliceLayoutForSegment(layout, EXPORT_SEGMENT_MAX_PX, EXPORT_SEGMENT_MAX_PX);
    expect(seg.cells.map(c => c.cellId).sort()).toEqual(['b', 'c']);
    expect(seg.cells.find(c => c.cellId === 'b')!.y).toBe(-20); // (MAX-20) - MAX
    expect(seg.cells.find(c => c.cellId === 'c')!.y).toBe(100); // (MAX+100) - MAX
  });

  it('完全在段外的 cell 被排除（c/d 不在段 0）', () => {
    const seg = sliceLayoutForSegment(layout, 0, EXPORT_SEGMENT_MAX_PX);
    expect(seg.cells.find(c => c.cellId === 'c')).toBeUndefined();
    expect(seg.cells.find(c => c.cellId === 'd')).toBeUndefined();
  });

  it('保留 cell 的其他字段（x/drawWidth/drawHeight/imageId 不变）', () => {
    const seg = sliceLayoutForSegment(layout, 0, EXPORT_SEGMENT_MAX_PX);
    const a = seg.cells.find(c => c.cellId === 'a')!;
    expect(a.x).toBe(0);
    expect(a.drawWidth).toBe(50);
    expect(a.drawHeight).toBe(50);
    expect(a.imageId).toBe('img1');
  });

  it('空段（无 cell 重叠）返回空 cells 数组', () => {
    const emptyLayout: LayoutResult = {
      canvasWidth: 1000,
      canvasHeight: EXPORT_SEGMENT_MAX_PX,
      cells: [],
    };
    const seg = sliceLayoutForSegment(emptyLayout, 0, EXPORT_SEGMENT_MAX_PX);
    expect(seg.cells).toEqual([]);
    expect(seg.canvasHeight).toBe(EXPORT_SEGMENT_MAX_PX);
  });
});
