/**
 * Tests for the TIFF export pipeline.
 *
 * Real UTIF encode/decode is exercised end-to-end (UTIF is pure JS and fully
 * deterministic under node), so these tests also guard the DPI resolution-tag
 * format — specifically that XResolution/YResolution are written as count=1
 * RATIONAL values per the TIFF spec (regression guard for the [dpi] fix).
 */
import { describe, it, expect, vi } from 'vitest';
import UTIF, { type IFD } from 'utif';
import { exportTIF } from '../export-tif';
import { setPlatformAPI, type IPlatformAPI } from '../../shared/ipc';

// downloadBlob only runs on the browser-fallback path; mock it so the test never
// touches document, and so we can assert it was invoked.
vi.mock('../download', () => ({ downloadBlob: vi.fn() }));
import { downloadBlob } from '../download';

/** A fresh 1×1 RGBA pixel buffer fed to UTIF.encodeImage via the fake canvas. */
function pixelBuffer(): ArrayBuffer {
  return new Uint8Array([10, 20, 30, 255]).buffer.slice(0);
}

/**
 * Canvas stand-in: getContext returns a stub whose getImageData exposes
 * `.data.buffer`, bypassing the real Canvas 2D API (unavailable under node).
 */
function fakeCanvas(w: number, h: number): HTMLCanvasElement {
  return {
    width: w,
    height: h,
    getContext: () => ({
      getImageData: () => ({ data: { buffer: pixelBuffer() }, width: w, height: h }),
    }),
  } as unknown as HTMLCanvasElement;
}

/** Inject a mock platform that captures every writeFile payload. */
function mockWriteFile() {
  const written: Uint8Array[] = [];
  const writeFile = vi.fn(async (_filePath: string, data: Uint8Array): Promise<void> => {
    written.push(data);
  });
  const api: IPlatformAPI = {
    showSaveDialog: async () => 'out.tif',
    writeFile,
    openWritable: async () => { throw new Error('流式导出在测试中不可用'); },
    checkForUpdate: async () => null,
    relaunch: async () => {},
  };
  setPlatformAPI(api);
  return { written, writeFile };
}

/** Decode written bytes into the first IFD (with pixel data decoded). */
function decodeFirstIfd(bytes: Uint8Array): IFD {
  // bytes.buffer is ArrayBufferLike; UTIF.decode expects a concrete ArrayBuffer.
  const buffer = bytes.buffer as ArrayBuffer;
  const ifds = UTIF.decode(buffer);
  UTIF.decodeImage(buffer, ifds[0], ifds);
  return ifds[0];
}

/** Read a numeric TIFF tag as number[] (used for resolution / unit tags). */
function numTag(ifd: IFD, tag: string): number[] {
  const v = ifd[tag];
  return Array.isArray(v) ? (v as number[]) : [];
}

describe('exportTIF', () => {
  it('写出合法 TIFF，XResolution/YResolution 各为 count=1 的 RATIONAL（守护 [dpi] 修复）', async () => {
    const { written } = mockWriteFile();
    await exportTIF(fakeCanvas(1, 1), 'out.tif', 300);

    expect(written).toHaveLength(1);
    const ifd = decodeFirstIfd(written[0]);

    // ResolutionUnit = inch
    expect(numTag(ifd, 't296')).toEqual([2]);
    // 核心：分辨率标签 count=1（TIFF 规范），数值 = dpi
    expect(numTag(ifd, 't282')).toHaveLength(1);
    expect(numTag(ifd, 't283')).toHaveLength(1);
    expect(numTag(ifd, 't282')).toEqual([300]);
    expect(numTag(ifd, 't283')).toEqual([300]);
  });

  it('不同 DPI（72 / 600）均能正确嵌入且 count=1', async () => {
    for (const dpi of [72, 600]) {
      const { written } = mockWriteFile();
      await exportTIF(fakeCanvas(1, 1), 'out.tif', dpi);
      const ifd = decodeFirstIfd(written[0]);
      expect(numTag(ifd, 't282')).toHaveLength(1);
      expect(numTag(ifd, 't282')).toEqual([dpi]);
    }
  });

  it('按序推送进度回调：compress → save → done', async () => {
    mockWriteFile();
    const phases: string[] = [];
    await exportTIF(fakeCanvas(1, 1), 'out.tif', 300, (phase) => phases.push(phase));
    expect(phases).toEqual(['compress', 'save', 'done']);
  });

  it('浏览器降级路径（__browser_fallback__）走 downloadBlob，不写文件', async () => {
    const { writeFile } = mockWriteFile();
    vi.mocked(downloadBlob).mockClear();
    await exportTIF(fakeCanvas(1, 1), '__browser_fallback__', 300);
    expect(writeFile).not.toHaveBeenCalled();
    expect(downloadBlob).toHaveBeenCalledTimes(1);
  });
});
