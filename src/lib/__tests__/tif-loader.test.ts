import { describe, it, expect } from 'vitest';
import { flattenInvalidAlpha } from '../tif-loader';

describe('flattenInvalidAlpha', () => {
  it('无任何完全透明像素时丢弃伪 alpha，强制全部不透明且保留 RGB', () => {
    // 模拟专色 TIFF：alpha 集中在低值(30/31)与 255，但无 0 值
    const data = new Uint8ClampedArray([
      100, 50, 20, 30,
      200, 100, 80, 255,
      10, 20, 30, 31,
      255, 255, 255, 30,
    ]);
    flattenInvalidAlpha(data, 4);
    expect(data[3]).toBe(255);
    expect(data[7]).toBe(255);
    expect(data[11]).toBe(255);
    expect(data[15]).toBe(255);
    // RGB 通道保持不变
    expect(data[0]).toBe(100);
    expect(data[4]).toBe(200);
    expect(data[8]).toBe(10);
    expect(data[12]).toBe(255);
  });

  it('存在完全透明像素时保留原 alpha（真实透明度）', () => {
    const data = new Uint8ClampedArray([
      255, 0, 0, 0,     // 完全透明
      0, 255, 0, 255,   // 不透明
      0, 0, 255, 128,   // 半透明
    ]);
    flattenInvalidAlpha(data, 3);
    expect(data[3]).toBe(0);
    expect(data[7]).toBe(255);
    expect(data[11]).toBe(128);
  });

  it('全不透明（alpha 全 255）时保持不变', () => {
    const data = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    flattenInvalidAlpha(data, 2);
    expect(data[3]).toBe(255);
    expect(data[7]).toBe(255);
  });

  it('alpha 全为非零中间值（无 0）时强制不透明', () => {
    const data = new Uint8ClampedArray([
      100, 100, 100, 200,
      100, 100, 100, 200,
    ]);
    flattenInvalidAlpha(data, 2);
    expect(data[3]).toBe(255);
    expect(data[7]).toBe(255);
  });

  it('空像素数组不抛错', () => {
    const data = new Uint8ClampedArray(0);
    expect(() => flattenInvalidAlpha(data, 0)).not.toThrow();
  });
});
