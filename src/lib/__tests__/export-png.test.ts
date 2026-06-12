import { describe, it, expect } from 'vitest';
import { deflateSync } from 'zlib';
import { exportPNG } from '../export-png';
import { setPlatformAPI, type IPlatformAPI } from '../../shared/ipc';

// ── PNG 构造/解析工具（用于喂给被测的 exportPNG 并校验产物） ──
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
  return t;
})();
function crc32(d: Uint8Array, s: number, l: number): number {
  let c = 0xFFFFFFFF;
  for (let i = s; i < s + l; i++) c = crcTable[(c ^ d[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const c = new Uint8Array(12 + data.length);
  const v = new DataView(c.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) c[4 + i] = type.charCodeAt(i);
  c.set(data, 8);
  v.setUint32(8 + data.length, crc32(c, 4, 4 + data.length));
  return c;
}
/** Build a minimal valid PNG (IHDR + IDAT + IEND) mimicking canvas.toBlob output (no pHYs). */
function buildMinimalPng(): Uint8Array {
  const sig = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
  const ihdr = new Uint8Array(13); const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, 10); dv.setUint32(4, 10); ihdr[8] = 8; ihdr[9] = 6;
  const idat = pngChunk('IDAT', deflateSync(new Uint8Array(10 * (1 + 10 * 4))));
  const iend = pngChunk('IEND', new Uint8Array(0));
  const parts = [sig, pngChunk('IHDR', ihdr), idat, iend];
  let tot = 0; for (const p of parts) tot += p.length;
  const out = new Uint8Array(tot); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
/** Read DPI from a PNG's pHYs chunk, or null if absent / before-IDAT not found. */
function readPngDpi(png: Uint8Array): number | null {
  let offset = 8;
  while (offset < png.length - 8) {
    const len = (png[offset] << 24) | (png[offset + 1] << 16) | (png[offset + 2] << 8) | png[offset + 3];
    const t = String.fromCharCode(png[offset + 4], png[offset + 5], png[offset + 6], png[offset + 7]);
    if (t === 'pHYs') {
      const px = (png[offset + 8] << 24) | (png[offset + 9] << 16) | (png[offset + 10] << 8) | png[offset + 11];
      const unit = png[offset + 16];
      return unit === 1 ? Math.round(px / 39.3701) : null;
    }
    if (t === 'IDAT') return null;
    offset += 12 + len;
  }
  return null;
}

/** A canvas stand-in whose toBlob yields the given PNG bytes. */
function fakeCanvas(pngBytes: Uint8Array): HTMLCanvasElement {
  return {
    width: 10,
    height: 10,
    toBlob(cb: (b: Blob | null) => void) {
      cb(new Blob([pngBytes.buffer as ArrayBuffer], { type: 'image/png' }));
    },
  } as unknown as HTMLCanvasElement;
}

describe('exportPNG — DPI pHYs injection', () => {
  it('写入用户设定的 DPI（300）到 pHYs chunk', async () => {
    let captured: Uint8Array | null = null;
    const mock: IPlatformAPI = {
      showSaveDialog: async () => 'test.png',
      writeFile: async (_p, data) => { captured = data; },
      checkForUpdate: async () => null,
      relaunch: async () => {},
    };
    setPlatformAPI(mock);

    await exportPNG(fakeCanvas(buildMinimalPng()), 'test.png', 300);

    expect(captured).not.toBeNull();
    expect(readPngDpi(captured!)).toBe(300);
  });

  it('不同 DPI 值都能正确写入（150 / 72）', async () => {
    for (const dpi of [150, 72]) {
      let captured: Uint8Array | null = null;
      setPlatformAPI({
        showSaveDialog: async () => 'test.png',
        writeFile: async (_p, data) => { captured = data; },
        checkForUpdate: async () => null,
        relaunch: async () => {},
      });
      await exportPNG(fakeCanvas(buildMinimalPng()), 'test.png', dpi);
      expect(readPngDpi(captured!)).toBe(dpi);
    }
  });

  it('即使源 PNG 已带旧 pHYs 也被替换为新 DPI', async () => {
    // 源 PNG 自带 72dpi pHYs（模拟某些编码器输出）
    const sig = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
    const ihdr = new Uint8Array(13); const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, 10); dv.setUint32(4, 10); ihdr[8] = 8; ihdr[9] = 6;
    const physData = new Uint8Array(9); const pv = new DataView(physData.buffer);
    pv.setUint32(0, 2835); pv.setUint32(4, 2835); physData[8] = 1; // 72dpi
    const idat = pngChunk('IDAT', deflateSync(new Uint8Array(10 * (1 + 10 * 4))));
    const parts = [sig, pngChunk('IHDR', ihdr), pngChunk('pHYs', physData), idat, pngChunk('IEND', new Uint8Array(0))];
    let tot = 0; for (const p of parts) tot += p.length;
    const pngWith72 = new Uint8Array(tot); let o = 0;
    for (const p of parts) { pngWith72.set(p, o); o += p.length; }

    let captured: Uint8Array | null = null;
    setPlatformAPI({
      showSaveDialog: async () => 'test.png',
      writeFile: async (_p, data) => { captured = data; },
      checkForUpdate: async () => null,
      relaunch: async () => {},
    });
    await exportPNG(fakeCanvas(pngWith72), 'test.png', 300);
    expect(readPngDpi(captured!)).toBe(300);
  });
});
