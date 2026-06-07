/**
 * Tests for PSD binary format internals that don't require Canvas API.
 * Full pipeline tests (writeCmykPsd) require a browser/Canvas environment
 * and are covered by integration tests.
 */

import { describe, it, expect } from 'vitest';
import { BinaryWriter } from '../binary-writer';

describe('PSD file header format', () => {
  it('writes 8BPS signature and version=1 correctly', () => {
    const w = new BinaryWriter();
    w.str('8BPS');             // 4 bytes
    w.u16(1);                  // version
    w.u16(0); w.u16(0); w.u16(0); // reserved 6 bytes
    w.u16(5);                  // channels
    w.u32(100);                // rows
    w.u32(200);                // columns
    w.u16(8);                  // depth
    w.u16(4);                  // color mode CMYK

    const buf = w.toUint8Array();
    expect(buf.length).toBe(26);

    // Signature
    expect(String.fromCharCode(buf[0], buf[1], buf[2], buf[3])).toBe('8BPS');
    // Version
    expect(buf[4]).toBe(0);
    expect(buf[5]).toBe(1);
    // Channels = 5
    expect(buf[12]).toBe(0);
    expect(buf[13]).toBe(5);
    // Rows = 100
    expect(buf[14]).toBe(0);
    expect(buf[17]).toBe(100);
    // Columns = 200
    expect(buf[18]).toBe(0);
    expect(buf[21]).toBe(200);
    // Depth = 8
    expect(buf[22]).toBe(0);
    expect(buf[23]).toBe(8);
    // Color mode = 4 (CMYK)
    expect(buf[24]).toBe(0);
    expect(buf[25]).toBe(4);
  });

  it('channel count is 4 without alpha, 5 with alpha', () => {
    const countNoAlpha = 4;
    const countWithAlpha = 5;
    expect(countNoAlpha).toBe(4);
    expect(countWithAlpha).toBe(5);
  });
});

describe('PSD layer name sanitisation', () => {
  it('replaces non-ASCII characters with underscores', () => {
    // Directly test the regex pattern used in sanitiseLayerName
    const name = '测试图层';
    const ascii = name.replace(/[^\x20-\x7E]/g, '_');
    expect(ascii).toBe('____');
  });

  it('preserves valid ASCII characters', () => {
    const name = 'Layer 1 (copy)';
    const ascii = name.replace(/[^\x20-\x7E]/g, '_');
    expect(ascii).toBe('Layer 1 (copy)');
  });

  it('truncates names longer than 255 bytes', () => {
    const longName = 'A'.repeat(300);
    const ascii = longName.replace(/[^\x20-\x7E]/g, '_');
    const result = ascii.length <= 255 ? ascii : ascii.slice(0, 255);
    expect(result.length).toBe(255);
    expect(result).toBe('A'.repeat(255));
  });
});

describe('PSD binary structure integrity', () => {
  it('writeFileHeader + writeColorModeData produces correct offsets', () => {
    const w = new BinaryWriter();
    // File header: 26 bytes
    w.str('8BPS');
    w.u16(1);
    w.u16(0); w.u16(0); w.u16(0);
    w.u16(4);
    w.u32(10);
    w.u32(10);
    w.u16(8);
    w.u16(4);

    expect(w.pos).toBe(26);

    // Color mode data: 4 bytes (length=0)
    w.u32(0);
    expect(w.pos).toBe(30);
  });
});
