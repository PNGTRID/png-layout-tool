import { describe, it, expect } from 'vitest';
import { rgbaToCmyka } from '../cmyk';

/** Helper: create RGBA pixel array from [r, g, b, a] values */
function makePixel(r: number, g: number, b: number, a: number): Uint8ClampedArray {
  return new Uint8ClampedArray([r, g, b, a]);
}

/** Helper: extract CMYK values from CMYKA output (inverted ink convention: 255=no ink, 0=full ink) */
function readCmyk(cmyka: Uint8Array): { c: number; m: number; y: number; k: number; a: number } {
  return {
    c: (255 - cmyka[0]) / 255 * 100,  // convert back to percentage
    m: (255 - cmyka[1]) / 255 * 100,
    y: (255 - cmyka[2]) / 255 * 100,
    k: (255 - cmyka[3]) / 255 * 100,
    a: cmyka[4],
  };
}

/** Helper: 总墨量百分比（C+M+Y+K，理论范围 0–400） */
function totalInkPercent(cmyk: { c: number; m: number; y: number; k: number }): number {
  return cmyk.c + cmyk.m + cmyk.y + cmyk.k;
}

describe('rgbaToCmyka', () => {
  it('converts pure white (255,255,255) → C=0 M=0 Y=0 K=0', () => {
    const rgba = makePixel(255, 255, 255, 255);
    const cmyka = rgbaToCmyka(rgba, 1, 1);
    const cmyk = readCmyk(cmyka);
    expect(cmyk.c).toBeCloseTo(0, 1);
    expect(cmyk.m).toBeCloseTo(0, 1);
    expect(cmyk.y).toBeCloseTo(0, 1);
    expect(cmyk.k).toBeCloseTo(0, 1);
    expect(cmyk.a).toBe(255);
  });

  it('converts pure black (0,0,0) → C=0 M=0 Y=0 K=100', () => {
    const rgba = makePixel(0, 0, 0, 255);
    const cmyka = rgbaToCmyka(rgba, 1, 1);
    const cmyk = readCmyk(cmyka);
    expect(cmyk.c).toBeCloseTo(0, 1);
    expect(cmyk.m).toBeCloseTo(0, 1);
    expect(cmyk.y).toBeCloseTo(0, 1);
    expect(cmyk.k).toBeCloseTo(100, 1);
  });

  it('converts pure red (255,0,0) → C=0 M=100 Y=100 K=0', () => {
    const rgba = makePixel(255, 0, 0, 255);
    const cmyka = rgbaToCmyka(rgba, 1, 1);
    const cmyk = readCmyk(cmyka);
    expect(cmyk.c).toBeCloseTo(0, 1);
    expect(cmyk.m).toBeCloseTo(100, 1);
    expect(cmyk.y).toBeCloseTo(100, 1);
    expect(cmyk.k).toBeCloseTo(0, 1);
  });

  it('converts pure green (0,255,0) → C=100 M=0 Y=100 K=0', () => {
    const rgba = makePixel(0, 255, 0, 255);
    const cmyka = rgbaToCmyka(rgba, 1, 1);
    const cmyk = readCmyk(cmyka);
    expect(cmyk.c).toBeCloseTo(100, 1);
    expect(cmyk.m).toBeCloseTo(0, 1);
    expect(cmyk.y).toBeCloseTo(100, 1);
    expect(cmyk.k).toBeCloseTo(0, 1);
  });

  it('converts pure blue (0,0,255) → C=100 M=100 Y=0 K=0', () => {
    const rgba = makePixel(0, 0, 255, 255);
    const cmyka = rgbaToCmyka(rgba, 1, 1);
    const cmyk = readCmyk(cmyka);
    expect(cmyk.c).toBeCloseTo(100, 1);
    expect(cmyk.m).toBeCloseTo(100, 1);
    expect(cmyk.y).toBeCloseTo(0, 1);
    expect(cmyk.k).toBeCloseTo(0, 1);
  });

  it('preserves alpha channel', () => {
    const rgba = makePixel(128, 128, 128, 128);
    const cmyka = rgbaToCmyka(rgba, 1, 1);
    expect(cmyka[4]).toBe(128);
  });

  it('fully transparent pixel has alpha=0', () => {
    const rgba = makePixel(255, 0, 0, 0);
    const cmyka = rgbaToCmyka(rgba, 1, 1);
    expect(cmyka[4]).toBe(0);
  });

  it('output is 5 bytes per pixel (CMYKA)', () => {
    const w = 3, h = 4;
    const rgba = new Uint8ClampedArray(w * h * 4);
    const cmyka = rgbaToCmyka(rgba, w, h);
    expect(cmyka.length).toBe(w * h * 5);
  });

  it('round-trip: RGBA → CMYKA → approximate RGBA (within GCR tolerance)', () => {
    // GCR 重分布墨量后，简单 (1-C)(1-K) 反转不再精确（GCR 固有特性，非 bug）。
    // 此处仅验证反转结果与原值偏差有界，确认转换未引入灾难性色偏。
    const r = 128, g = 64, b = 200, a = 255;
    const rgba = makePixel(r, g, b, a);
    const cmyka = rgbaToCmyka(rgba, 1, 1);

    // Reverse: inverted CMYK → RGB. R = (1-C)(1-K)*255 = cInv * kInv / 255
    const cInv = cmyka[0];
    const mInv = cmyka[1];
    const yInv = cmyka[2];
    const kInv = cmyka[3];

    const rBack = Math.round(cInv * kInv / 255);
    const gBack = Math.round(mInv * kInv / 255);
    const bBack = Math.round(yInv * kInv / 255);

    const maxDev = Math.max(Math.abs(rBack - r), Math.abs(gBack - g), Math.abs(bBack - b));
    expect(maxDev).toBeLessThanOrEqual(25);
    expect(cmyka[4]).toBe(a);
  });

  it('handles multiple pixels correctly', () => {
    const w = 2, h = 2;
    // 4 pixels: white, black, red, blue
    const rgba = new Uint8ClampedArray([
      255, 255, 255, 255,
      0,   0,   0,   255,
      255, 0,   0,   255,
      0,   0,   255, 255,
    ]);
    const cmyka = rgbaToCmyka(rgba, w, h);

    // Pixel 0 (white): all inverted values = 255 (no ink)
    expect(cmyka[0]).toBe(255); // C_inv
    expect(cmyka[3]).toBe(255); // K_inv

    // Pixel 1 (black): K_inv = 0 (full black ink)
    expect(cmyka[1 * 5 + 3]).toBe(0); // K_inv

    // Pixel 3 (blue): should have M and C full ink
    expect(cmyka[3 * 5 + 0]).toBe(0);     // C_inv = 0 → C = 100%
    expect(cmyka[3 * 5 + 1]).toBe(0);     // M_inv = 0 → M = 100%
    expect(cmyka[3 * 5 + 3]).toBe(255);   // K_inv = 255 → K = 0%
  });

  // ─── GCR / UCR / TAC ──────────────────────────────────────────────

  it('GCR: neutral grey moves most ink to K (C=M=Y≈0, K dominant)', () => {
    // RGB(100,100,100) 纯中性灰：neutrality=1，GCR 以 CMYK_GCR_NEUTRAL 全转 K
    const rgba = makePixel(100, 100, 100, 255);
    const cmyk = readCmyk(rgbaToCmyka(rgba, 1, 1));
    expect(cmyk.k).toBeGreaterThan(50);  // K 主导
    expect(cmyk.c).toBeLessThan(5);      // CMY 残留极少
    expect(cmyk.m).toBeLessThan(5);
    expect(cmyk.y).toBeLessThan(5);
  });

  it('GCR: colourful pixel retains saturation (less K than neutral)', () => {
    // 鲜红 RGB(220,30,30) vs 中性灰 RGB(100,100,100)：彩色应少转 K、保留 M 饱和
    const red = readCmyk(rgbaToCmyka(makePixel(220, 30, 30, 255), 1, 1));
    const grey = readCmyk(rgbaToCmyka(makePixel(100, 100, 100, 255), 1, 1));
    expect(red.k).toBeLessThan(grey.k);
    expect(red.m).toBeGreaterThan(70);  // 彩色 M 仍饱和
  });

  it('GCR reduces total ink vs naive max-K formula', () => {
    // 暗彩色 RGB(80,40,20)：当前 GCR 总墨量应低于教科书 max-K 公式
    const r = 80 / 255, g = 40 / 255, b = 20 / 255;
    const kN = 1 - Math.max(r, g, b);
    const denom = 1 - kN;
    const cN = denom === 0 ? 0 : (1 - r - kN) / denom;
    const mN = denom === 0 ? 0 : (1 - g - kN) / denom;
    const yN = denom === 0 ? 0 : (1 - b - kN) / denom;
    const naiveTotal = (cN + mN + yN + kN) * 100;

    const cmyk = readCmyk(rgbaToCmyka(makePixel(80, 40, 20, 255), 1, 1));
    expect(totalInkPercent(cmyk)).toBeLessThan(naiveTotal);
    expect(cmyk.k).toBeGreaterThan(0);  // GCR 生成了黑版
  });

  it('TAC: total ink never exceeds 300% across boundary colours', () => {
    const cases: Array<[number, number, number]> = [
      [0, 0, 0],         // 纯黑
      [255, 255, 255],   // 纯白
      [255, 0, 0],       // 纯红
      [0, 255, 0],       // 纯绿
      [0, 0, 255],       // 纯蓝
      [10, 10, 10],      // 极暗中性
      [80, 40, 20],      // 暗彩色
      [120, 120, 120],   // 中灰
      [200, 50, 180],    // 鲜艳品红
      [1, 0, 0],         // 极暗红（逼近高墨量边界）
    ];
    for (const [r, g, b] of cases) {
      const cmyk = readCmyk(rgbaToCmyka(makePixel(r, g, b, 255), 1, 1));
      // +2 容忍字节四舍五入（每通道 ±0.5% × 4）
      expect(totalInkPercent(cmyk)).toBeLessThanOrEqual(302);
    }
  });
});
