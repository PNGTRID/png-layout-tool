/**
 * TIF 流式编码器（手写分条 TIFF，写入 WritableFileHandle，不持有整文件）。
 *
 * UTIF.encodeImage 持有整图 ArrayBuffer，GB 级画布会爆内存。本编码器按 RowsPerStrip
 * (STRIP_HEIGHT) 分条，每条独立 deflate 压缩后顺序写盘，最后写 IFD 并回填偏移。
 *
 * 格式：TIFF 6.0，MM 大端，RGBA（SamplesPerPixel=4, BitsPerSample=8,8,8,8,
 * Photometric=RGB, ExtraSamples=unassociated alpha），Compression=8 (Adobe deflate)。
 * pako.deflate 输出 zlib 格式（0x78 0x9c …），正合 TIFF Compression=8 要求。
 */
import { deflate } from 'pako';
import type { LayoutResult, UploadedImage, LayoutParams } from '../shared/types';
import { STRIP_HEIGHT } from '../shared/constants';
import { renderStrip } from './export-png';
import { StreamBinaryWriter } from './stream-binary-writer';
import type { WritableFileHandle } from '../shared/ipc';
import type { ExportProgressCallback } from './export-psd';

// IFD 字段类型码（TIFF 6.0 spec）
const IFD_TYPE_SHORT = 3;
const IFD_TYPE_LONG = 4;
const IFD_TYPE_RATIONAL = 5;

// 常用 tag 值
const COMPRESSION_ADOBE_DEFLATE = 8;
const PHOTOMETRIC_RGB = 2;
const RESOLUTION_UNIT_INCH = 2;
const EXTRA_SAMPLES_UNASSOCIATED_ALPHA = 2;

/** DPI 转 RATIONAL 分子分母（与 export-tif.ts 的 UTIF metadata 写法一致：val*10000/10000） */
const DPI_RATIONAL_DENOMINATOR = 10000;

/**
 * 写一个 IFD entry（12 字节）：tag(u16) + type(u16) + count(u32) + value/offset(u32)。
 * SHORT count=1 时值内联到 value 字段高 2 字节（左对齐，低 2 字节补 0）；
 * 其余（LONG 内联值、或任何 count>1 / RATIONAL 的偏移）按 u32 写。
 */
export async function writeIfdEntry(
  w: StreamBinaryWriter,
  tag: number,
  type: number,
  count: number,
  valueOrOffset: number,
): Promise<void> {
  await w.u16(tag);
  await w.u16(type);
  await w.u32(count);
  if (type === IFD_TYPE_SHORT && count === 1) {
    // SHORT 单值内联：左对齐到 value 字段高 2 字节
    await w.u16(valueOrOffset);
    await w.u16(0);
  } else {
    await w.u32(valueOrOffset);
  }
}

/**
 * 把超长画布编码成分条 TIFF 流式写入 handle（调用方负责 open/close handle）。
 * 进度按 strip 粒度汇报（render s/numStrips）。
 */
export async function exportTifStream(
  layout: LayoutResult,
  images: UploadedImage[],
  params: LayoutParams,
  handle: WritableFileHandle,
  onProgress?: ExportProgressCallback,
): Promise<void> {
  const { canvasWidth: width, canvasHeight: height } = layout;
  const dpi = params.dpi;
  const numStrips = Math.max(1, Math.ceil(height / STRIP_HEIGHT));

  const w = new StreamBinaryWriter(handle);

  // === Header（8B）：'MM' + 42 + IFD offset 占位 ===
  await w.str('MM');
  await w.u16(42);
  const ifdOffsetPos = w.pos;
  await w.u32(0); // IFD offset 占位（最后 patchU32 回填）

  // === Strip 数据（顺序写，收集 offset / byteCount）===
  const stripOffsets: number[] = [];
  const stripByteCounts: number[] = [];
  const stripCanvas = document.createElement('canvas');

  for (let s = 0; s < numStrips; s++) {
    onProgress?.('render', s + 1, numStrips);
    const stripY = s * STRIP_HEIGHT;
    const stripH = Math.min(STRIP_HEIGHT, height - stripY);

    await renderStrip(stripCanvas, layout, images, params.backgroundColor, stripY, stripH);
    const ctx = stripCanvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2d context');
    const rgba = ctx.getImageData(0, 0, width, stripH).data;
    // pako deflate → zlib（含 header + adler32），正合 TIFF Compression=8
    const compressed = deflate(new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength));

    stripOffsets.push(w.pos);
    stripByteCounts.push(compressed.length);
    await w.bytes(compressed);

    // 释放本条 canvas 显存（连续 N 条累积会触发崩溃）
    stripCanvas.width = 0;
    stripCanvas.height = 0;
  }

  // === IFD 外数据 ===
  // BitsPerSample[8,8,8,8]（4 SHORT = 8 字节）
  const bpsOffset = w.pos;
  await w.u16(8); await w.u16(8); await w.u16(8); await w.u16(8);

  // XResolution / YResolution RATIONAL（numerator/denominator = dpi）
  const dpiNum = Math.round(dpi * DPI_RATIONAL_DENOMINATOR);
  const xResOffset = w.pos;
  await w.u32(dpiNum); await w.u32(DPI_RATIONAL_DENOMINATOR);
  const yResOffset = w.pos;
  await w.u32(dpiNum); await w.u32(DPI_RATIONAL_DENOMINATOR);

  // StripOffsets / StripByteCounts（各 numStrips 个 LONG）
  const stripOffsetsOffset = w.pos;
  for (const off of stripOffsets) await w.u32(off);
  const stripByteCountsOffset = w.pos;
  for (const cnt of stripByteCounts) await w.u32(cnt);

  // === IFD（tag count + 13 entries 升序 + next=0）===
  const ifdOffset = w.pos;
  await w.u16(13);
  await writeIfdEntry(w, 256, IFD_TYPE_LONG, 1, width);                       // ImageWidth
  await writeIfdEntry(w, 257, IFD_TYPE_LONG, 1, height);                      // ImageLength
  await writeIfdEntry(w, 258, IFD_TYPE_SHORT, 4, bpsOffset);                  // BitsPerSample[4] → offset
  await writeIfdEntry(w, 259, IFD_TYPE_SHORT, 1, COMPRESSION_ADOBE_DEFLATE);  // Compression = deflate
  await writeIfdEntry(w, 262, IFD_TYPE_SHORT, 1, PHOTOMETRIC_RGB);            // Photometric = RGB
  await writeIfdEntry(w, 273, IFD_TYPE_LONG, numStrips, stripOffsetsOffset);  // StripOffsets[N]
  await writeIfdEntry(w, 277, IFD_TYPE_SHORT, 1, 4);                          // SamplesPerPixel = 4
  await writeIfdEntry(w, 278, IFD_TYPE_LONG, 1, STRIP_HEIGHT);                // RowsPerStrip
  await writeIfdEntry(w, 279, IFD_TYPE_LONG, numStrips, stripByteCountsOffset); // StripByteCounts[N]
  await writeIfdEntry(w, 282, IFD_TYPE_RATIONAL, 1, xResOffset);              // XResolution
  await writeIfdEntry(w, 283, IFD_TYPE_RATIONAL, 1, yResOffset);              // YResolution
  await writeIfdEntry(w, 296, IFD_TYPE_SHORT, 1, RESOLUTION_UNIT_INCH);       // ResolutionUnit = inch
  await writeIfdEntry(w, 338, IFD_TYPE_SHORT, 1, EXTRA_SAMPLES_UNASSOCIATED_ALPHA); // ExtraSamples
  await w.u32(0); // next IFD = 0

  // === 回填 Header 的 IFD offset ===
  await w.patchU32(ifdOffsetPos, ifdOffset);

  onProgress?.('done', 1, 1);
}
