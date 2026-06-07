import { describe, it, expect } from 'vitest';
import { BinaryWriter } from '../binary-writer';

describe('BinaryWriter', () => {
  it('writes u8 correctly', () => {
    const w = new BinaryWriter();
    w.u8(0x00);
    w.u8(0xff);
    w.u8(0xab);
    const buf = w.toUint8Array();
    expect(buf.length).toBe(3);
    expect(buf[0]).toBe(0x00);
    expect(buf[1]).toBe(0xff);
    expect(buf[2]).toBe(0xab);
  });

  it('writes u8 with overflow mask', () => {
    const w = new BinaryWriter();
    w.u8(256);  // 0x100 → masked to 0x00
    w.u8(-1);   // 0xFFff... → masked to 0xff
    const buf = w.toUint8Array();
    expect(buf[0]).toBe(0x00);
    expect(buf[1]).toBe(0xff);
  });

  it('writes u16 big-endian', () => {
    const w = new BinaryWriter();
    w.u16(0x1234);
    w.u16(0x0000);
    w.u16(0xffff);
    const buf = w.toUint8Array();
    expect(buf[0]).toBe(0x12);
    expect(buf[1]).toBe(0x34);
    expect(buf[2]).toBe(0x00);
    expect(buf[3]).toBe(0x00);
    expect(buf[4]).toBe(0xff);
    expect(buf[5]).toBe(0xff);
  });

  it('writes u32 big-endian', () => {
    const w = new BinaryWriter();
    w.u32(0x12345678);
    w.u32(0x00000000);
    w.u32(0xffffffff);
    const buf = w.toUint8Array();
    expect(buf[0]).toBe(0x12);
    expect(buf[1]).toBe(0x34);
    expect(buf[2]).toBe(0x56);
    expect(buf[3]).toBe(0x78);
    expect(buf[4]).toBe(0x00);
    expect(buf[5]).toBe(0x00);
    expect(buf[6]).toBe(0x00);
    expect(buf[7]).toBe(0x00);
    expect(buf[8]).toBe(0xff);
    expect(buf[9]).toBe(0xff);
    expect(buf[10]).toBe(0xff);
    expect(buf[11]).toBe(0xff);
  });

  it('writes i16 negative values (two\'s complement)', () => {
    const w = new BinaryWriter();
    w.i16(-1);     // 0xFFFF
    w.i16(-32768); // 0x8000
    w.i16(0);      // 0x0000
    const buf = w.toUint8Array();
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xff);
    expect(buf[2]).toBe(0x80);
    expect(buf[3]).toBe(0x00);
    expect(buf[4]).toBe(0x00);
    expect(buf[5]).toBe(0x00);
  });

  it('writes i32 negative values (two\'s complement)', () => {
    const w = new BinaryWriter();
    w.i32(-1);           // 0xFFFFFFFF
    w.i32(-2147483648);  // 0x80000000
    const buf = w.toUint8Array();
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xff);
    expect(buf[2]).toBe(0xff);
    expect(buf[3]).toBe(0xff);
    expect(buf[4]).toBe(0x80);
    expect(buf[5]).toBe(0x00);
    expect(buf[6]).toBe(0x00);
    expect(buf[7]).toBe(0x00);
  });

  it('writes bytes array', () => {
    const w = new BinaryWriter();
    w.bytes(new Uint8Array([1, 2, 3, 4, 5]));
    const buf = w.toUint8Array();
    expect(buf.length).toBe(5);
    expect(Array.from(buf)).toEqual([1, 2, 3, 4, 5]);
  });

  it('writes ASCII string', () => {
    const w = new BinaryWriter();
    w.str('8BPS');
    const buf = w.toUint8Array();
    expect(buf.length).toBe(4);
    expect(buf[0]).toBe(0x38); // '8'
    expect(buf[1]).toBe(0x42); // 'B'
    expect(buf[2]).toBe(0x50); // 'P'
    expect(buf[3]).toBe(0x53); // 'S'
  });

  it('pads to alignment boundary', () => {
    const w = new BinaryWriter();
    w.u8(0xaa);  // pos = 1
    w.u8(0xbb);  // pos = 2
    w.pad(4);    // pos → 4 (adds 2 zero bytes)
    w.u8(0xcc);  // pos = 5
    const buf = w.toUint8Array();
    expect(buf.length).toBe(5);
    expect(buf[0]).toBe(0xaa);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0x00); // padding
    expect(buf[3]).toBe(0x00); // padding
    expect(buf[4]).toBe(0xcc);
  });

  it('no-op pad when already aligned', () => {
    const w = new BinaryWriter();
    w.u32(0x11223344); // pos = 4, already aligned
    w.pad(4);
    const buf = w.toUint8Array();
    expect(buf.length).toBe(4); // no extra bytes
  });

  it('patch32 overwrites previously written u32', () => {
    const w = new BinaryWriter();
    w.u32(0x00000000); // placeholder at offset 0
    w.u32(0xdeadbeef); // another value at offset 4
    w.patch32(0, 0x12345678); // patch the first u32
    const buf = w.toUint8Array();
    expect(buf[0]).toBe(0x12);
    expect(buf[1]).toBe(0x34);
    expect(buf[2]).toBe(0x56);
    expect(buf[3]).toBe(0x78);
    // Second u32 should be untouched
    expect(buf[4]).toBe(0xde);
    expect(buf[5]).toBe(0xad);
    expect(buf[6]).toBe(0xbe);
    expect(buf[7]).toBe(0xef);
  });

  it('tracks position correctly', () => {
    const w = new BinaryWriter();
    expect(w.pos).toBe(0);
    w.u8(0);
    expect(w.pos).toBe(1);
    w.u16(0);
    expect(w.pos).toBe(3);
    w.u32(0);
    expect(w.pos).toBe(7);
    w.str('AB');
    expect(w.pos).toBe(9);
  });

  it('handles capacity doubling for large writes', () => {
    const w = new BinaryWriter(16); // tiny initial capacity
    // Write 1000 bytes — should trigger multiple resizes
    const data = new Uint8Array(1000);
    for (let i = 0; i < 1000; i++) data[i] = i & 0xff;
    w.bytes(data);
    const buf = w.toUint8Array();
    expect(buf.length).toBe(1000);
    for (let i = 0; i < 1000; i++) {
      expect(buf[i]).toBe(i & 0xff);
    }
  });
});
