import { describe, it, expect } from 'vitest';
import { rleCompressScanline, compressChannel } from '../rle';

/**
 * PackBits decompressor for round-trip verification.
 * Reference: https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/
 * Section: "Image Data Compression → PackBits"
 */
function packbitsDecompress(data: Uint8Array, expectedLength: number): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < data.length && out.length < expectedLength) {
    const n = data[i++];
    if (n <= 127) {
      // Literal run: copy next (n+1) bytes
      const count = n + 1;
      for (let j = 0; j < count && i < data.length; j++) {
        out.push(data[i++]);
      }
    } else {
      // Repeat run: repeat next byte (257-n) times
      const count = 257 - n;
      if (i < data.length) {
        const val = data[i++];
        for (let j = 0; j < count; j++) out.push(val);
      }
    }
  }
  return new Uint8Array(out);
}

describe('rleCompressScanline', () => {
  it('compresses an all-zero scanline to a tiny output', () => {
    const scanline = new Uint8Array(100); // all zeros
    const compressed = rleCompressScanline(scanline);
    // All-zero should compress to 2 bytes: header (-128+1=-127 → 129) + value (0)
    expect(compressed.length).toBeLessThanOrEqual(4);
  });

  it('round-trip: all-zero data decompresses to original', () => {
    const original = new Uint8Array(100);
    const compressed = rleCompressScanline(original);
    const decompressed = packbitsDecompress(compressed, original.length);
    expect(decompressed.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(decompressed[i]).toBe(original[i]);
    }
  });

  it('round-trip: sequential data (0,1,2,...,n)', () => {
    const original = new Uint8Array(200);
    for (let i = 0; i < 200; i++) original[i] = i & 0xff;
    const compressed = rleCompressScanline(original);
    const decompressed = packbitsDecompress(compressed, original.length);
    expect(decompressed.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(decompressed[i]).toBe(original[i]);
    }
  });

  it('round-trip: alternating pattern (A,B,A,B,...)', () => {
    const original = new Uint8Array(100);
    for (let i = 0; i < 100; i++) original[i] = i % 2 === 0 ? 0xaa : 0x55;
    const compressed = rleCompressScanline(original);
    const decompressed = packbitsDecompress(compressed, original.length);
    expect(decompressed.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(decompressed[i]).toBe(original[i]);
    }
  });

  it('round-trip: single byte', () => {
    const original = new Uint8Array([42]);
    const compressed = rleCompressScanline(original);
    const decompressed = packbitsDecompress(compressed, original.length);
    expect(decompressed[0]).toBe(42);
  });

  it('round-trip: empty scanline', () => {
    const original = new Uint8Array(0);
    const compressed = rleCompressScanline(original);
    expect(compressed.length).toBe(0);
  });

  it('round-trip: random-ish data', () => {
    // Deterministic pseudo-random
    const original = new Uint8Array(500);
    let seed = 12345;
    for (let i = 0; i < 500; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      original[i] = seed & 0xff;
    }
    const compressed = rleCompressScanline(original);
    const decompressed = packbitsDecompress(compressed, original.length);
    expect(decompressed.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(decompressed[i]).toBe(original[i]);
    }
  });

  it('run-length repeat capped at 128', () => {
    // 200 identical bytes: should be split into 128 + 72
    const original = new Uint8Array(200);
    original.fill(0x42);
    const compressed = rleCompressScanline(original);
    const decompressed = packbitsDecompress(compressed, original.length);
    expect(decompressed.length).toBe(200);
    for (let i = 0; i < 200; i++) {
      expect(decompressed[i]).toBe(0x42);
    }
  });
});

describe('compressChannel', () => {
  it('extracts and compresses a single channel from interleaved data', () => {
    // 2x2 image, 3 channels (step=3)
    // Channel at offset 0: [10, 40], [70, 100]
    const pixelData = new Uint8Array([
      10, 20, 30,  // pixel (0,0)
      40, 50, 60,  // pixel (1,0)
      70, 80, 90,  // pixel (0,1)
      100, 110, 120, // pixel (1,1)
    ]);
    const result = compressChannel(pixelData, 0, 3, 2, 2);
    expect(result.scanlineLengths.length).toBe(2); // 2 scanlines

    // Decompress each scanline and verify
    let offset = 0;
    for (let y = 0; y < 2; y++) {
      const scanlineData = result.compressed.subarray(offset, offset + result.scanlineLengths[y]);
      const decompressed = packbitsDecompress(scanlineData, 2);
      expect(decompressed[0]).toBe(pixelData[(y * 2 + 0) * 3 + 0]);
      expect(decompressed[1]).toBe(pixelData[(y * 2 + 1) * 3 + 0]);
      offset += result.scanlineLengths[y];
    }
  });

  it('total compressed size equals sum of scanline lengths', () => {
    const pixelData = new Uint8Array(12 * 5); // 12 pixels, 5 channels (CMYKA)
    let seed = 99;
    for (let i = 0; i < pixelData.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      pixelData[i] = seed & 0xff;
    }
    const result = compressChannel(pixelData, 2, 5, 4, 3); // 4x3 image
    const sumLengths = result.scanlineLengths.reduce((a, b) => a + b, 0);
    expect(result.compressed.length).toBe(sumLengths);
  });
});
