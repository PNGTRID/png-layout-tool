import { describe, it, expect } from 'vitest';
import { StreamBinaryWriter } from '../stream-binary-writer';
import type { WritableFileHandle } from '../../shared/ipc';

/** 构造 mock 句柄，记录所有 write/seek 调用 */
function makeMockHandle() {
  const writes: number[][] = [];
  const seeks: number[] = [];
  const state = { closed: false };
  const handle: WritableFileHandle = {
    write: async (data: Uint8Array) => {
      writes.push(Array.from(data));
      return data.length;
    },
    seek: async (offset: number) => {
      seeks.push(offset);
      return offset;
    },
    close: async () => {
      state.closed = true;
    },
  };
  return { handle, writes, seeks, state };
}

describe('StreamBinaryWriter', () => {
  it('u16/u32 大端字节序，pos 累加', async () => {
    const { handle, writes } = makeMockHandle();
    const w = new StreamBinaryWriter(handle);
    await w.u16(0x1234);
    await w.u32(0x56789abc);
    expect(w.pos).toBe(6);
    expect(writes[0]).toEqual([0x12, 0x34]);
    expect(writes[1]).toEqual([0x56, 0x78, 0x9a, 0xbc]);
  });

  it('patchU32: seek(offset)→write(u32be)→seek(resumePos)，pos 不变', async () => {
    const { handle, writes, seeks } = makeMockHandle();
    const w = new StreamBinaryWriter(handle);
    await w.u32(0); // pos 0→4，占位在 offset 0
    await w.u16(0xabcd); // pos 4→6
    await w.patchU32(0, 100); // 回填 offset 0 = 100
    expect(w.pos).toBe(6); // pos 不变
    expect(seeks).toEqual([0, 6]); // seek 到占位偏移，再 seek 回 resumePos
    expect(writes[writes.length - 1]).toEqual([0, 0, 0, 100]); // 大端 u32(100)
  });

  it('str 写 ASCII 字节序列', async () => {
    const { handle, writes } = makeMockHandle();
    const w = new StreamBinaryWriter(handle);
    await w.str('MM');
    expect(writes[0]).toEqual([0x4d, 0x4d]);
    expect(w.pos).toBe(2);
  });

  it('bytes 写原始字节并累加 pos', async () => {
    const { handle, writes } = makeMockHandle();
    const w = new StreamBinaryWriter(handle);
    await w.bytes(new Uint8Array([1, 2, 3, 4, 5]));
    expect(w.pos).toBe(5);
    expect(writes[0]).toEqual([1, 2, 3, 4, 5]);
  });

  it('u8 写单字节', async () => {
    const { handle, writes } = makeMockHandle();
    const w = new StreamBinaryWriter(handle);
    await w.u8(0xff);
    expect(writes[0]).toEqual([0xff]);
    expect(w.pos).toBe(1);
  });

  it('close 关闭句柄', async () => {
    const { handle, state } = makeMockHandle();
    const w = new StreamBinaryWriter(handle);
    await w.close();
    expect(state.closed).toBe(true);
  });

  it('连续多次 patchU32 互不干扰（各自 seek 回原 pos）', async () => {
    const { handle, seeks } = makeMockHandle();
    const w = new StreamBinaryWriter(handle);
    const off1 = w.pos; await w.u32(0); // 占位1
    await w.u16(0); // 一些内容
    const off2 = w.pos; await w.u32(0); // 占位2
    await w.u8(0); // 更多内容
    await w.patchU32(off1, 10);
    await w.patchU32(off2, 20);
    // 每次 patchU32 = seek(off)+seek(resumePos)，resumePos 应是 patch 时的 pos
    expect(seeks).toContain(off1);
    expect(seeks).toContain(off2);
  });
});
