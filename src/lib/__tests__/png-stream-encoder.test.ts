// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { inflate } from 'pako';

// mock renderStrip 为 no-op（保留 crc32Update 真实实现）
vi.mock('../export-png', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../export-png')>();
  return { ...actual, renderStrip: vi.fn(async () => {}) };
});

import { exportPngStream, buildFilteredScanlines, writeChunk } from '../png-stream-encoder';
import { StreamBinaryWriter } from '../stream-binary-writer';
import { STRIP_HEIGHT } from '../../shared/constants';
import type { LayoutResult, LayoutCell, LayoutParams } from '../../shared/types';
import type { WritableFileHandle } from '../../shared/ipc';

// ── CRC32 工具（和 export-png.test.ts 相同，用于验证 chunk CRC）──
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(d: Uint8Array, s: number, l: number): number {
  let c = 0xFFFFFFFF;
  for (let i = s; i < s + l; i++) c = crcTable[(c ^ d[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** 读大端 uint32（>>> 0 保证无符号，避免 << 产生负数） */
function readU32(bytes: number[] | Uint8Array, off: number): number {
  return ((bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3]) >>> 0;
}

// ── mock 句柄：记录所有写入字节（扁平成 number[] 便于断言）──
function makeRecordingHandle() {
  const allBytes: number[] = [];
  const handle: WritableFileHandle = {
    write: async (data: Uint8Array) => {
      for (let i = 0; i < data.length; i++) allBytes.push(data[i]);
      return data.length;
    },
    seek: async (_offset: number) => _offset,
    close: async () => {},
  };
  return { handle, allBytes };
}

// ── PNG chunk 解析 ──
interface ParsedChunk { type: string; data: Uint8Array; crc: number }

function parsePngChunks(bytes: number[]): { sig: Uint8Array; chunks: ParsedChunk[] } {
  const sig = new Uint8Array(bytes.slice(0, 8));
  const chunks: ParsedChunk[] = [];
  let off = 8;
  while (off + 12 <= bytes.length) {
    const len = readU32(bytes, off);
    const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    const data = new Uint8Array(bytes.slice(off + 8, off + 8 + len));
    chunks.push({ type, data, crc: readU32(bytes, off + 8 + len) });
    off += 12 + len;
  }
  return { sig, chunks };
}

// ── layout / params 工具 ──
function makeCell(id: string, x: number, y: number, w: number, h: number): LayoutCell {
  return {
    cellId: id, imageId: 'img1', x, y, drawWidth: w, drawHeight: h,
    srcWidth: w, srcHeight: h, srcTrimX: 0, srcTrimY: 0,
    srcTrimWidth: w, srcTrimHeight: h, rotated: false,
  };
}

function makeLayout(w: number, h: number, cells: LayoutCell[] = []): LayoutResult {
  return { canvasWidth: w, canvasHeight: h, cells };
}

// 固定像素 RGBA（mock getImageData 返回）
const PIXEL_R = 10, PIXEL_G = 20, PIXEL_B = 30, PIXEL_A = 40;

// ── canvas mock：让 document.createElement('canvas') 返回带 getImageData 的 fake ──
let createElementSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  const fakeCtx = {
    getImageData: (_x: number, _y: number, w: number, h: number) => {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = PIXEL_R; data[i + 1] = PIXEL_G;
        data[i + 2] = PIXEL_B; data[i + 3] = PIXEL_A;
      }
      return { data, width: w, height: h };
    },
  };
  const fakeCanvas = {
    width: 0, height: 0,
    getContext: () => fakeCtx,
  } as unknown as HTMLCanvasElement;

  const origCreate = document.createElement.bind(document);
  createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(
    (tag: string) => tag === 'canvas' ? fakeCanvas : origCreate(tag),
  );
});

afterEach(() => { createElementSpy.mockRestore(); });

// ══════════════════════════════════════════════════════════════════════
describe('buildFilteredScanlines', () => {
  it('每行首字节=0(filter None)，后接 RGBA，总长=height×(1+width×4)', () => {
    const rgba = new Uint8ClampedArray([
      1, 2, 3, 4, 5, 6, 7, 8,         // row 0: 2 px
      9, 10, 11, 12, 13, 14, 15, 16, // row 1: 2 px
    ]);
    const out = buildFilteredScanlines(rgba, 2, 2);
    expect(out.length).toBe(2 * (1 + 2 * 4)); // 18
    expect(out[0]).toBe(0); // row 0 filter
    expect(Array.from(out.subarray(1, 9))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(out[9]).toBe(0); // row 1 filter
    expect(Array.from(out.subarray(10, 18))).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it('width=1 height=1：单像素', () => {
    const rgba = new Uint8ClampedArray([255, 0, 128, 64]);
    const out = buildFilteredScanlines(rgba, 1, 1);
    expect(out.length).toBe(5); // 1 + 1×4
    expect(Array.from(out)).toEqual([0, 255, 0, 128, 64]);
  });
});

// ══════════════════════════════════════════════════════════════════════
describe('writeChunk', () => {
  it('IEND（空 data）写出 12 字节且 CRC 正确', async () => {
    const { handle, allBytes } = makeRecordingHandle();
    const w = new StreamBinaryWriter(handle);
    await writeChunk(w, 'IEND', new Uint8Array(0));
    expect(allBytes.length).toBe(12);
    expect(allBytes.slice(0, 4)).toEqual([0, 0, 0, 0]); // length=0
    expect(String.fromCharCode(...allBytes.slice(4, 8))).toBe('IEND');
    expect(readU32(allBytes, 8)).toBe(crc32(new Uint8Array(allBytes), 4, 4));
  });

  it('IHDR chunk length/type/data/CRC 全字节正确', async () => {
    const { handle, allBytes } = makeRecordingHandle();
    const w = new StreamBinaryWriter(handle);
    const ihdr = new Uint8Array(13);
    new DataView(ihdr.buffer).setUint32(0, 100);
    new DataView(ihdr.buffer).setUint32(4, 200);
    ihdr[8] = 8; ihdr[9] = 6;
    await writeChunk(w, 'IHDR', ihdr);
    expect(allBytes.length).toBe(25); // 4+4+13+4
    expect(readU32(allBytes, 0)).toBe(13);
    expect(String.fromCharCode(...allBytes.slice(4, 8))).toBe('IHDR');
    expect(readU32(allBytes, 21)).toBe(crc32(new Uint8Array(allBytes), 4, 4 + 13));
  });
});

// ══════════════════════════════════════════════════════════════════════
describe('exportPngStream', () => {
  const params = { dpi: 300, backgroundColor: null } as unknown as LayoutParams;

  it('产物是合法 PNG：签名 + IHDR + pHYs + IDATs + IEND，CRC 全正确，IDAT 可 inflate',
    async () => {
      const width = 3;
      const height = STRIP_HEIGHT + 1; // 4097 → 2 条 strip
      const layout = makeLayout(width, height, [makeCell('a', 0, 0, width, height)]);
      const { handle, allBytes } = makeRecordingHandle();
      const progress: [string, number, number][] = [];
      const onProgress = (phase: string, cur: number, tot: number) => progress.push([phase, cur, tot]);

      await exportPngStream(layout, [], params, handle, onProgress);

      const { sig, chunks } = parsePngChunks(allBytes);

      // ── 签名 ──
      expect(Array.from(sig)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

      // ── chunk 顺序：IHDR, pHYs, ...IDATs..., IEND ──
      const types = chunks.map(c => c.type);
      expect(types[0]).toBe('IHDR');
      expect(types[1]).toBe('pHYs');
      expect(types[types.length - 1]).toBe('IEND');
      const idats = chunks.filter(c => c.type === 'IDAT');
      expect(idats.length).toBeGreaterThanOrEqual(1); // CompressionStream 可能输出 1+ 个 chunk

      // ── IHDR 内容 ──
      const ihdr = chunks[0].data;
      const ihdrView = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
      expect(ihdrView.getUint32(0)).toBe(width);
      expect(ihdrView.getUint32(4)).toBe(height);
      expect(ihdr[8]).toBe(8);  // bitDepth
      expect(ihdr[9]).toBe(6);  // colorType = RGBA
      expect(ihdr[10]).toBe(0); // compression
      expect(ihdr[11]).toBe(0); // filter
      expect(ihdr[12]).toBe(0); // interlace

      // ── pHYs ──
      const ppm = Math.round(300 * 39.3701);
      const phys = chunks[1].data;
      const physView = new DataView(phys.buffer, phys.byteOffset, phys.byteLength);
      expect(physView.getUint32(0)).toBe(ppm);
      expect(physView.getUint32(4)).toBe(ppm);
      expect(phys[8]).toBe(1); // unit = meter

      // ── 所有 chunk CRC 验证 ──
      const allU8 = new Uint8Array(allBytes);
      let off = 8;
      for (let i = 0; i < chunks.length; i++) {
        const len = readU32(allU8, off);
        expect(readU32(allU8, off + 8 + len)).toBe(crc32(allU8, off + 4, 4 + len));
        off += 12 + len;
      }

      // ── IDAT 拼接 inflate：合法 zlib 流 ──
      const totalDataLen = idats.reduce((s, c) => s + c.data.length, 0);
      const merged = new Uint8Array(totalDataLen);
      let o = 0;
      for (const idat of idats) { merged.set(idat.data, o); o += idat.data.length; }
      const restored = inflate(merged);
      expect(restored.length).toBe(height * (1 + width * 4)); // 总行数 × (1 + width×4)

      // ── onProgress 序列 ──
      expect(progress[0]).toEqual(['render', 1, 2]);
      expect(progress[1]).toEqual(['render', 2, 2]);
      expect(progress[progress.length - 1]).toEqual(['done', 1, 1]);
    }, 30000);
});
