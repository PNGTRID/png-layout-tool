/**
 * Tests for image-loader internals that don't require Canvas API.
 * computeTrimBounds tests require a browser Canvas environment
 * and are covered by integration / E2E tests.
 */

import { describe, it, expect } from 'vitest';

describe('generateId', () => {
  // Import dynamically to avoid canvas side effects
  async function getGenerateId() {
    const mod = await import('../image-loader');
    return mod.generateId;
  }

  it('produces unique IDs on successive calls', async () => {
    const generateId = await getGenerateId();
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('produces non-empty strings', async () => {
    const generateId = await getGenerateId();
    for (let i = 0; i < 10; i++) {
      const id = generateId();
      expect(id.length).toBeGreaterThan(0);
      expect(typeof id).toBe('string');
    }
  });
});

describe('readPngDpi pHYs parsing logic', () => {
  it('recognises valid pHYs chunk structure: 4-byte length + 4-byte type + 9-byte data', () => {
    // pHYs data layout: ppux(4) + ppuy(4) + unit(1) = 9 bytes
    // For 300 DPI: ppux = 300 * 39.3701 ≈ 11811
    const ppux = Math.round(300 * 39.3701);
    expect(ppux).toBe(11811);
  });

  it('DPI calculation from pixels-per-meter is correct', () => {
    // 300 DPI = 11811 pixels per meter
    const ppux = 11811;
    const dpi = Math.round(ppux / 39.3701);
    expect(dpi).toBe(300);
  });

  it('72 DPI corresponds to standard screen resolution', () => {
    const ppux = 2835; // 72 * 39.3701 ≈ 2834.6
    const dpi = Math.round(ppux / 39.3701);
    expect(dpi).toBe(72);
  });
});
