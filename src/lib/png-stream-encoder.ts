/**
 * PNG 流式编码器（手写分条 PNG，写入 WritableFileHandle，不持有整文件）。
 *
 * exportPNG 用 canvas.toBlob 一次性产出整图，GB 级画布会爆内存。本编码器按
 * STRIP_HEIGHT 分条，逐条把 scanlines 喂给 CompressionStream('deflate')，reader
 * 增量读出压缩块，每块写成一个 IDAT chunk 立即落盘，最后写 IEND。
 *
 * 格式：PNG，8-bit RGBA（colorType=6, unassociated alpha），filter=None(0)。
 * CompressionStream('deflate') 输出 zlib 格式（0x78 0x9c … + adler32），正合 PNG
 * IDAT 要求；所有 IDAT 的 data 拼接构成单一 zlib 流（PNG spec 要求），增量写盘
 * 不累积整条压缩流，内存峰值 = 当前压缩块 + 一条 strip RGBA。
 *
 * 每个 chunk 自带 length + CRC32，纯顺序写，无需 patchU32 回填（三格式里最简单）。
 * 浏览器需支持 CompressionStream（Safari 16.4+ / 现代 WebView2），不支持时调用方
 * 应降级到分块多文件导出（exportSegmented）。
 */
import type { LayoutResult, UploadedImage, LayoutParams } from '../shared/types';
import { STRIP_HEIGHT } from '../shared/constants';
import { renderStrip, crc32Update } from './export-png';
import { StreamBinaryWriter } from './stream-binary-writer';
import type { WritableFileHandle } from '../shared/ipc';
import type { ExportProgressCallback } from './export-psd';
import { throwIfExportAborted } from './export-psd';

/** PNG 8 字节签名 */
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

/** 4 字节 chunk type 复用缓冲（顺序 await，无并发竞争，与 StreamBinaryWriter 的 U16/U32_BUF 同模式） */
const TYPE_BUF = new Uint8Array(4);

/**
 * 给 RGBA 像素每行前插 filter byte(0=None)，构造 PNG IDAT 喂 deflate 的扫描行缓冲。
 * 每行布局：[0x00, R, G, B, A, R, G, B, A, …]，总长 = height × (1 + width×4)。
 * 纯函数，无 canvas 依赖，便于单测。
 */
export function buildFilteredScanlines(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array<ArrayBuffer> {
  const stride = 1 + width * 4;
  const out = new Uint8Array(height * stride);
  const rowBytes = width * 4;
  for (let y = 0; y < height; y++) {
    const outOff = y * stride;
    out[outOff] = 0; // filter type = None
    const inOff = y * rowBytes;
    out.set(rgba.subarray(inOff, inOff + rowBytes), outOff + 1);
  }
  return out;
}

/**
 * 写一个完整 PNG chunk：[4 length][4 type][N data][4 CRC]。
 * CRC 覆盖 type+data，用 crc32Update 分段累加（先 type 4 字节，再 data），
 * 避免为几 MB 的 IDAT 拼接 type+data 的大 buffer。
 */
export async function writeChunk(
  w: StreamBinaryWriter,
  type: string,
  data: Uint8Array,
): Promise<void> {
  for (let i = 0; i < 4; i++) TYPE_BUF[i] = type.charCodeAt(i) & 0xff;

  await w.u32(data.length);
  await w.bytes(TYPE_BUF);
  if (data.length > 0) await w.bytes(data);

  // CRC32 over chunk type + data（标准 PNG CRC，多项式 0xEDB88320）
  let crc = crc32Update(0xFFFFFFFF, TYPE_BUF, 0, 4);
  if (data.length > 0) crc = crc32Update(crc, data, 0, data.length);
  await w.u32((crc ^ 0xFFFFFFFF) >>> 0);
}

/**
 * 把超长画布编码成分条 PNG 流式写入 handle（调用方负责 open/close handle）。
 * 进度按 strip 粒度汇报（render s/numStrips → done），与 TIF 流式编码器一致。
 *
 * @throws 当前环境不支持 CompressionStream / 取 2d context 失败 / 写盘失败
 */
export async function exportPngStream(
  layout: LayoutResult,
  images: UploadedImage[],
  params: LayoutParams,
  handle: WritableFileHandle,
  onProgress?: ExportProgressCallback,
  abortSignal?: AbortSignal,
): Promise<void> {
  if (!('CompressionStream' in globalThis)) {
    throw new Error('当前环境不支持 PNG 流式导出（需 CompressionStream），请改用分块多文件导出');
  }

  const { canvasWidth: width, canvasHeight: height } = layout;
  const numStrips = Math.max(1, Math.ceil(height / STRIP_HEIGHT));
  const w = new StreamBinaryWriter(handle);

  // === PNG 签名（8B）===
  await w.bytes(PNG_SIGNATURE);

  // === IHDR：width/height=完整尺寸, bitDepth=8, colorType=6(RGBA) ===
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);   // width
  ihdrView.setUint32(4, height);  // height
  ihdr[8] = 8;  // bitDepth
  ihdr[9] = 6;  // colorType = 6（RGBA）
  ihdr[10] = 0; // compression method = 0（deflate，PNG 唯一合法值）
  ihdr[11] = 0; // filter method = 0（PNG 唯一合法值，每行类型由扫描行首字节指定，此处 None）
  ihdr[12] = 0; // interlace = 0（none）
  await writeChunk(w, 'IHDR', ihdr);

  // === pHYs：DPI → 像素/米（与 export-png injectPhysChunk 同公式）===
  const ppm = Math.round(params.dpi * 39.3701);
  const phys = new Uint8Array(9);
  const physView = new DataView(phys.buffer);
  physView.setUint32(0, ppm); // X pixels/unit
  physView.setUint32(4, ppm); // Y pixels/unit
  phys[8] = 1;                // unit = 1（meter）
  await writeChunk(w, 'pHYs', phys);

  // === 分条 IDAT：CompressionStream 流式 ===
  // writer 喂每条 strip 的 scanlines，reader pump 增量读出压缩块每块写一个 IDAT chunk。
  // 所有 IDAT 的 data 拼接 = 单一 zlib 流（PNG spec 要求），增量落盘不累积整条压缩流。
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();

  // reader pump 协程：把每个压缩输出块写成一个 IDAT。read() 在 writable 被 abort
  // 时 reject，用 catch 兜成 done 退出；写盘错误正常向上抛（让主流程感知）。
  const pump = (async (): Promise<void> => {
    for (;;) {
      const result = await reader.read().catch(() => ({ done: true as const, value: undefined }));
      if (result.done || !result.value) break;
      await writeChunk(w, 'IDAT', result.value);
    }
  })();

  const stripCanvas = document.createElement('canvas');
  try {
    for (let s = 0; s < numStrips; s++) {
      throwIfExportAborted(abortSignal);
      onProgress?.('render', s + 1, numStrips);
      const stripY = s * STRIP_HEIGHT;
      const stripH = Math.min(STRIP_HEIGHT, height - stripY);

      await renderStrip(stripCanvas, layout, images, params.backgroundColor, stripY, stripH);
      const ctx = stripCanvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get 2d context');
      const rgba = ctx.getImageData(0, 0, width, stripH).data;
      // 喂 scanlines（每行前插 filter byte），CompressionStream 增量压缩
      await writer.write(buildFilteredScanlines(rgba, width, stripH));

      // 释放本条 canvas 显存（连续 N 条累积会触发崩溃）
      stripCanvas.width = 0;
      stripCanvas.height = 0;
    }
    await writer.close(); // 触发 zlib 尾部（adler32）输出
  } catch (err) {
    await writer.abort(err).catch(() => {});
    await pump.catch(() => {}); // 等 pump 退出（abort 后 readable 出错）
    throw err;
  }
  await pump; // 等所有压缩输出写成 IDAT

  // === IEND ===
  await writeChunk(w, 'IEND', new Uint8Array(0));

  onProgress?.('done', 1, 1);
}
