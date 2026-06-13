import { describe, it, expect } from 'vitest';
import { writeIfdEntry } from '../tif-stream-encoder';
import { StreamBinaryWriter } from '../stream-binary-writer';
import type { WritableFileHandle } from '../../shared/ipc';

/** mock 句柄：记录所有写入字节（扁平成单个 number[] 便于断言） */
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

describe('writeIfdEntry', () => {
  it('SHORT count=1 内联：值左对齐到高 2 字节，低 2 字节补 0', async () => {
    const { handle, allBytes } = makeRecordingHandle();
    const w = new StreamBinaryWriter(handle);
    // tag=259(Compression), type=3(SHORT), count=1, value=8(deflate)
    await writeIfdEntry(w, 259, 3, 1, 8);
    // u16(259) + u16(3) + u32(1) + u16(8) + u16(0)
    expect(allBytes).toEqual([
      0x01, 0x03,       // tag 259
      0x00, 0x03,       // type 3
      0x00, 0x00, 0x00, 0x01, // count 1
      0x00, 0x08,       // value 8 (左对齐高 2 字节)
      0x00, 0x00,       // 低 2 字节补 0
    ]);
    expect(w.pos).toBe(12);
  });

  it('LONG count=1 内联值（如 ImageWidth）按 u32 写', async () => {
    const { handle, allBytes } = makeRecordingHandle();
    const w = new StreamBinaryWriter(handle);
    await writeIfdEntry(w, 256, 4, 1, 1890);
    expect(allBytes).toEqual([
      0x01, 0x00,       // tag 256
      0x00, 0x04,       // type 4 (LONG)
      0x00, 0x00, 0x00, 0x01, // count 1
      0x00, 0x00, 0x07, 0x62, // value 1890
    ]);
  });

  it('count>1（如 BitsPerSample[4]）写 offset（u32）', async () => {
    const { handle, allBytes } = makeRecordingHandle();
    const w = new StreamBinaryWriter(handle);
    await writeIfdEntry(w, 258, 3, 4, 200); // offset 200
    expect(allBytes).toEqual([
      0x01, 0x02,       // tag 258
      0x00, 0x03,       // type 3
      0x00, 0x00, 0x00, 0x04, // count 4
      0x00, 0x00, 0x00, 0xc8, // offset 200
    ]);
  });

  it('RATIONAL count=1 写 offset', async () => {
    const { handle, allBytes } = makeRecordingHandle();
    const w = new StreamBinaryWriter(handle);
    await writeIfdEntry(w, 282, 5, 1, 300); // XResolution offset
    expect(allBytes).toEqual([
      0x01, 0x1a,       // tag 282
      0x00, 0x05,       // type 5 (RATIONAL)
      0x00, 0x00, 0x00, 0x01,
      0x00, 0x00, 0x01, 0x2c, // offset 300
    ]);
  });
});
