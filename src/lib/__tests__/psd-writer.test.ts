/**
 * psd-writer 纯函数/字节级测试。
 *
 * 不依赖 Canvas API —— writeCmykPsd 全管线（含 composite image 渲染）需浏览器
 * 环境，由集成测试覆盖；本文件只测纯字节/纯函数部分：luni 块格式、CMYK↔RGBA 往返。
 *
 * luni 测试锚定 Adobe PSD 规范（Additional Layer Information），用于守护
 * 「中文图层名无损保留」这一核心不变量。
 */
import { describe, it, expect } from 'vitest';
import { buildLuniResource, cmykaToRgba } from '../psd-writer';
import { rgbaToCmyka } from '../cmyk';

// ─── 字节读取辅助（大端序）─────────────────────────────────────────
function ascii(buf: Uint8Array, start: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(buf[start + i]);
  return s;
}
function u16(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}
function u32(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

/**
 * 规范解码器（模拟 ag-psd readUnicodeString）：跳过 '8BIM'+key+u32(datalen)，
 * 读 u32(count) 后取 (count-1) 个 UTF-16BE 字符（排除末尾 null）。
 * 用于验证 buildLuniResource 的输出能被规范解析器无损还原。
 */
function decodeLuni(buf: Uint8Array): string {
  const count = u32(buf, 12); // offset 12 = inner char count (incl. null terminator)
  const realLen = Math.max(0, count - 1); // exclude trailing null
  let s = '';
  for (let i = 0; i < realLen; i++) {
    s += String.fromCharCode(u16(buf, 16 + i * 2));
  }
  return s;
}

describe('buildLuniResource — luni (Unicode layer name) 块格式', () => {
  it('以 "8BIM" 签名 + "luni" key 开头', () => {
    const buf = buildLuniResource('A');
    expect(ascii(buf, 0, 4)).toBe('8BIM');
    expect(ascii(buf, 4, 4)).toBe('luni');
  });

  it('key 之后紧跟 u32 data length（无 Pascal string padding）', () => {
    const buf = buildLuniResource('Layer');
    const dataLen = u32(buf, 8);
    const count = u32(buf, 12);
    expect(count).toBe(6); // 'Layer'.length(5) + 1 null terminator
    // data = u32(count)(4) + UTF-16BE(5 chars × 2) + null(2) = 16
    expect(dataLen).toBe(4 + 5 * 2 + 2);
  });

  it('data length 与实际 data 字节数自洽（不越界）', () => {
    const name = '图层 #1';
    const buf = buildLuniResource(name);
    const dataLen = u32(buf, 8);
    // 头部 12 字节（8BIM+luni+len）+ dataLen = 总长（dataLen 已偶数，无额外对齐）
    expect(12 + dataLen).toBeLessThanOrEqual(buf.length);
  });

  it('UTF-16BE 编码字符，末尾 u16(0) null 终止', () => {
    const buf = buildLuniResource('AB');
    expect(u16(buf, 16)).toBe(0x0041); // 'A'
    expect(u16(buf, 18)).toBe(0x0042); // 'B'
    expect(u16(buf, 20)).toBe(0x0000); // null terminator
  });

  it('ASCII 名称规范解码无损还原', () => {
    expect(decodeLuni(buildLuniResource('Layer 1'))).toBe('Layer 1');
  });

  it('中文（CJK）名称规范解码无损还原', () => {
    expect(decodeLuni(buildLuniResource('中文图层'))).toBe('中文图层');
  });

  it('混合名称规范解码无损还原', () => {
    expect(decodeLuni(buildLuniResource('背景-Background'))).toBe('背景-Background');
  });

  it('总字节数对齐到偶数（PSD 块对齐要求）', () => {
    const buf = buildLuniResource('x');
    expect(buf.length % 2).toBe(0);
  });

  it('空名不崩溃且可解码为空', () => {
    const buf = buildLuniResource('');
    expect(decodeLuni(buf)).toBe('');
  });
});

describe('cmykaToRgba — CMYK(inverted ink) ↔ RGBA 往返', () => {
  it('白色往返：RGBA(255,255,255,255) → CMYKA → RGBA 还原为白', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255]);
    const back = cmykaToRgba(rgbaToCmyka(rgba, 1, 1), 1, 1);
    expect(back[0]).toBe(255);
    expect(back[1]).toBe(255);
    expect(back[2]).toBe(255);
    expect(back[3]).toBe(255);
  });

  it('黑色往返：RGBA(0,0,0,255) → CMYKA → RGBA 还原为黑', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255]);
    const back = cmykaToRgba(rgbaToCmyka(rgba, 1, 1), 1, 1);
    expect(back[0]).toBe(0);
    expect(back[1]).toBe(0);
    expect(back[2]).toBe(0);
    expect(back[3]).toBe(255);
  });

  it('纯红往返：RGBA(255,0,0,255)', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255]);
    const back = cmykaToRgba(rgbaToCmyka(rgba, 1, 1), 1, 1);
    // 简单 CMYK 转换有量化误差，允许 ±2
    expect(back[0]).toBeGreaterThan(253);
    expect(back[1]).toBeLessThan(2);
    expect(back[2]).toBeLessThan(2);
    expect(back[3]).toBe(255);
  });

  it('alpha 通道保持不变（半透明像素）', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 128]);
    const back = cmykaToRgba(rgbaToCmyka(rgba, 1, 1), 1, 1);
    expect(back[3]).toBe(128);
  });

  it('多像素图像尺寸正确（width × height × 4）', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    const back = cmykaToRgba(rgbaToCmyka(rgba, 2, 1), 2, 1);
    expect(back.length).toBe(8);
  });
});
