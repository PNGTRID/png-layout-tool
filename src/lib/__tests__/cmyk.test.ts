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

  it('round-trip: RGBA → CMYKA → approximate RGBA', () => {
    // For mid-gray with full alpha
    const r = 128, g = 64, b = 200, a = 255;
    const rgba = makePixel(r, g, b, a);
    const cmyka = rgbaToCmyka(rgba, 1, 1);

    // Reverse: inverted CMYK → RGB
    const cInv = cmyka[0]; // 255 - C*255
    const mInv = cmyka[1];
    const yInv = cmyka[2];
    const kInv = cmyka[3];

    // R = (1-C)(1-K)*255 = cInv * kInv / 255
    const rBack = Math.round(cInv * kInv / 255);
    const gBack = Math.round(mInv * kInv / 255);
    const bBack = Math.round(yInv * kInv / 255);

    // Allow ±2 rounding error due to integer truncation
    expect(rBack).toBeGreaterThanOrEqual(r - 2);
    expect(rBack).toBeLessThanOrEqual(r + 2);
    expect(gBack).toBeGreaterThanOrEqual(g - 2);
    expect(gBack).toBeLessThanOrEqual(g + 2);
    expect(bBack).toBeGreaterThanOrEqual(b - 2);
    expect(bBack).toBeLessThanOrEqual(b + 2);
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
});
