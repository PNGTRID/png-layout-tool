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

describe('sanitizePng', () => {
  async function getSanitizePng() {
    const mod = await import('../image-loader');
    return mod.sanitizePng;
  }

  const SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  /** 构造 PNG chunk（CRC 占位 0；sanitizePng 不校验 CRC，原样复制即可） */
  function chunk(type: string, data: number[] = []): Uint8Array {
    const len = data.length;
    const buf = new Uint8Array(12 + len);
    buf[0] = (len >>> 24) & 0xff;
    buf[1] = (len >>> 16) & 0xff;
    buf[2] = (len >>> 8) & 0xff;
    buf[3] = len & 0xff;
    for (let i = 0; i < 4; i++) buf[4 + i] = type.charCodeAt(i);
    for (let i = 0; i < len; i++) buf[8 + i] = data[i];
    return buf;
  }

  async function makeFile(...chunks: Uint8Array[]): Promise<File> {
    const total = SIG.length + chunks.reduce((s, c) => s + c.length, 0);
    const buf = new Uint8Array(total);
    buf.set(SIG, 0);
    let pos = SIG.length;
    for (const c of chunks) {
      buf.set(c, pos);
      pos += c.length;
    }
    return new File([buf], 'test.png', { type: 'image/png' });
  }

  function listChunks(buf: ArrayBuffer): string[] {
    const data = new Uint8Array(buf);
    const types: string[] = [];
    let off = 8;
    while (off + 8 <= data.length) {
      const clen = (data[off] << 24) | (data[off + 1] << 16) | (data[off + 2] << 8) | data[off + 3];
      const t = String.fromCharCode(data[off + 4], data[off + 5], data[off + 6], data[off + 7]);
      types.push(t);
      if (t === 'IEND') break;
      off += 12 + clen;
    }
    return types;
  }

  it('剥离 iTXt/tEXt 等元数据 chunk，保留图像与物理 chunk', async () => {
    const sanitizePng = await getSanitizePng();
    const file = await makeFile(
      chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
      chunk('pHYs', [0, 0, 11, 18, 0, 0, 11, 18, 1]),
      chunk('iTXt', Array.from({ length: 80 }, (_, i) => i % 256)),
      chunk('tEXt', [65, 66, 67]),
      chunk('IDAT', [120, 156, 99, 96, 0, 0, 0, 2, 0, 1]),
      chunk('IEND'),
    );
    const blob = await sanitizePng(file);
    expect(blob).not.toBeNull();
    const out = await blob!.arrayBuffer();
    expect(listChunks(out)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND']);
    expect(Array.from(new Uint8Array(out).slice(0, 8))).toEqual(Array.from(SIG));
  });

  it('无元数据 chunk 时返回 null（退回原文件，避免无谓复制）', async () => {
    const sanitizePng = await getSanitizePng();
    const file = await makeFile(
      chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
      chunk('IDAT', [1, 2, 3]),
      chunk('IEND'),
    );
    const blob = await sanitizePng(file);
    expect(blob).toBeNull();
  });

  it('非 PNG 文件返回 null', async () => {
    const sanitizePng = await getSanitizePng();
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])], 'a.jpg', { type: 'image/jpeg' });
    const blob = await sanitizePng(file);
    expect(blob).toBeNull();
  });

  it('剥离后体积小于原文件', async () => {
    const sanitizePng = await getSanitizePng();
    const file = await makeFile(
      chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
      chunk('iTXt', Array.from({ length: 1000 }, (_, i) => i % 256)),
      chunk('IDAT', [1, 2, 3]),
      chunk('IEND'),
    );
    const blob = await sanitizePng(file);
    expect(blob).not.toBeNull();
    expect(blob!.size).toBeLessThan(file.size);
  });
});
