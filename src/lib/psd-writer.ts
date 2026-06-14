/**
 * Low-level CMYK PSD file writer.
 * Constructs a valid PSD binary from pre-processed CMYK layer data.
 *
 * PSD File Structure (Adobe spec):
 *   1. File Header Section      — 26 bytes fixed (signature + channels + dimensions + depth + color mode)
 *   2. Color Mode Data Section   — length-prefixed (0 for CMYK)
 *   3. Image Resources Section   — length-prefixed (resolution info resource #1005)
 *   4. Layer and Mask Info Section — length-prefixed
 *      4a. Layer Info              — length-prefixed (layer records + channel data)
 *      4b. Global Layer Mask Info  — length-prefixed (0 bytes here)
 *   5. Image Data Section        — composite image (RLE compressed)
 *
 * @see https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/
 *      § "File Format Specification" → "Photoshop File Formats" → "PSD"
 */

import { BinaryWriter } from './binary-writer';
import { compressChannel } from './rle';

export interface CmykLayer {
  name: string;
  cmyka: Uint8Array;
  width: number;
  height: number;
  left: number;
  top: number;
  hasTransparency: boolean;
}

/**
 * Sanitise a layer name for PSD Pascal string:
 * 1. Replace non-ASCII characters with underscores (PSD spec requires ASCII for layer names)
 * 2. Trim to 255 bytes (PSD limit for Pascal string length byte)
 */
function sanitiseLayerName(name: string): string {
  // Replace any character outside 0x20-0x7E with underscore
  const ascii = name.replace(/[^\x20-\x7E]/g, '_');
  // Trim to 255 characters (each ASCII char = 1 byte)
  return ascii.length <= 255 ? ascii : ascii.slice(0, 255);
}

interface ChData { id: number; lengths: number[]; data: Uint8Array; }

// ─── Section writers (private) ───────────────────────────────────────

/** §1. File Header (26 bytes fixed) */
function writeFileHeader(w: BinaryWriter, canvasW: number, canvasH: number, compositeHasAlpha: boolean): void {
  w.str('8BPS');             // Signature: always "8BPS"
  w.u16(1);                  // Version: 1 = PSD
  w.u16(0); w.u16(0); w.u16(0); // Reserved: 6 bytes must be zero
  w.u16(compositeHasAlpha ? 5 : 4);  // Channels: 4 (CMYK) or 5 (CMYK+Alpha)
  w.u32(canvasH);                     // Rows
  w.u32(canvasW);                     // Columns
  w.u16(8);                           // Depth: 8 bits per channel
  w.u16(4);                           // Color Mode: 4 = CMYK
}

/** §2. Color Mode Data (empty for CMYK) */
function writeColorModeData(w: BinaryWriter): void {
  w.u32(0);
}

/**
 * §3. Image Resources — Resolution info resource #1005
 *
 * PSD resolution is stored as fixed-point 16.16 bits per inch.
 * For DPI D: integer part = D, fraction = (D % 1) * 65536.
 * E.g. 300 DPI → 300.0 → hi=300, lo=0
 */
function writeImageResources(w: BinaryWriter, dpi: number): void {
  const resBuf = new BinaryWriter();
  resBuf.str('8BIM');
  resBuf.u16(1005);
  resBuf.u8(0); resBuf.u8(0);
  resBuf.u32(16);
  // Horizontal resolution: fixed-point 16.16
  const hInt = Math.floor(dpi);
  const hFrac = Math.round((dpi - hInt) * 65536);
  resBuf.u16(hInt); resBuf.u16(hFrac);
  resBuf.u16(1);                  // Horizontal unit: 1 = PPI
  resBuf.u16(1);                  // Width unit: 1 = inches
  // Vertical resolution: same as horizontal
  resBuf.u16(hInt); resBuf.u16(hFrac);
  resBuf.u16(1);                  // Vertical unit: 1 = PPI
  resBuf.u16(1);                  // Height unit: 1 = inches
  const resData = resBuf.toUint8Array();
  w.u32(resData.length);
  w.bytes(resData);
}

/** §4. Layer and Mask Information */
function writeLayerAndMaskInfo(w: BinaryWriter, layers: CmykLayer[]): void {
  const lmStart = w.pos;
  w.u32(0); // placeholder for total length

  const liStart = w.pos;
  w.u32(0); // placeholder for layer info length

  // Layer count: negative = first alpha channel contains transparency for merged result
  w.i16(-layers.length);

  // Compress all channels for all layers
  const allChData: ChData[][] = layers.map(layer => {
    const chs: ChData[] = [];
    for (let ch = 0; ch < 4; ch++) {
      const c = compressChannel(layer.cmyka, ch, 5, layer.width, layer.height);
      chs.push({ id: ch, lengths: c.scanlineLengths, data: c.compressed });
    }
    if (layer.hasTransparency) {
      const c = compressChannel(layer.cmyka, 4, 5, layer.width, layer.height);
      chs.push({ id: -1, lengths: c.scanlineLengths, data: c.compressed });
    }
    return chs;
  });

  // Write layer records
  for (let i = 0; i < layers.length; i++) {
    writeLayerRecord(w, layers[i], allChData[i]);
  }

  // Write channel image data
  for (let i = 0; i < layers.length; i++) {
    for (const ch of allChData[i]) {
      w.u16(1); // compression type: RLE
      for (const len of ch.lengths) w.u16(len);
      w.bytes(ch.data);
    }
  }

  w.pad(2);
  w.patch32(liStart, w.pos - liStart - 4);
  w.u32(0); // Global layer mask info: empty
  w.patch32(lmStart, w.pos - lmStart - 4);
}

/**
 * Build 'luni' (Unicode layer name) additional-layer-information block.
 *
 * Adobe PSD spec — Additional Layer Information:
 *   '8BIM'(4) + key(4) + u32(data length)(4) + data + (pad to even)
 *
 * For 'luni', data is a Unicode string (Photoshop 7.0+):
 *   u32(char count incl. null terminator) + UTF-16BE chars + u16(0)
 *
 * Both the outer data-length and the inner char-count are required:
 * the outer length lets strict parsers (and Photoshop) skip/align the block,
 * the inner count is what ag-psd's readUnicodeString reads to recover the name.
 */
export function buildLuniResource(name: string): Uint8Array {
  const buf = new BinaryWriter();
  buf.str('8BIM');             // signature
  buf.str('luni');             // key
  // data: u32(char count, 含 null) + UTF-16BE 字符 + u16(0) null。
  // count 含 null 与 ag-psd readUnicodeString 约定一致（本项目用 ag-psd 读 PSD）。
  const count = name.length + 1;
  const dataLen = 4 + count * 2; // u32(count) + count 个 UTF-16BE 字符（末位为 null）
  buf.u32(dataLen);            // 外层 data length（Adobe additional-layer-info 规范）
  buf.u32(count);              // 内层字符数（含 null），ag-psd 据此读取
  for (let i = 0; i < name.length; i++) {
    buf.u16(name.charCodeAt(i));
  }
  buf.u16(0);                  // null terminator
  // dataLen 始终为偶数（4 + 偶数），无需额外对齐 padding
  return buf.toUint8Array();
}

/** Write a single layer record (bounds, channels, blend mode, extra data) */
function writeLayerRecord(w: BinaryWriter, layer: CmykLayer, chs: ChData[]): void {
  w.i32(layer.top);
  w.i32(layer.left);
  w.i32(layer.top + layer.height);
  w.i32(layer.left + layer.width);
  w.u16(chs.length);

  for (const ch of chs) {
    w.i16(ch.id);
    w.u32(2 + layer.height * 2 + ch.data.length);
  }

  // Blend mode: normal
  w.str('8BIM');
  w.str('norm');
  w.u8(255); // Opacity
  w.u8(0);   // Clipping
  w.u8(0);   // Flags
  w.u8(0);   // Filler

  // Extra data: layer mask (0) + blending ranges (0) + name + luni
  const extraBuf = new BinaryWriter();
  extraBuf.u32(0); // Layer mask data length
  extraBuf.u32(0); // Layer blending ranges data length

  // Pascal string name (padded to 4-byte boundary) — ASCII fallback
  const safeName = sanitiseLayerName(layer.name);
  const nameBytes = new TextEncoder().encode(safeName);
  const nameTotal = ((1 + nameBytes.length) + 3) & ~3;
  extraBuf.u8(nameBytes.length);
  for (const b of nameBytes) extraBuf.u8(b);
  for (let p = 1 + nameBytes.length; p < nameTotal; p++) extraBuf.u8(0);

  // Unicode layer name resource (luni) — preserves CJK characters
  const luniData = buildLuniResource(layer.name);
  extraBuf.bytes(luniData);

  const extraBytes = extraBuf.toUint8Array();
  w.u32(extraBytes.length);
  w.bytes(extraBytes);
}

/**
 * 在 CMYK(inverted ink) 空间直接做 alpha-over 合成。
 *
 * 替代旧的 CMYK→RGBA→canvas drawImage→RGBA→CMYK 两次有损转换路径：每图层按
 *   out_inv = src_inv·α + dst_inv·(1−α)
 * 逐通道混合（inverted ink 空间下线性混合等价于 RGBA 空间的 canvas 合成）。
 * K 通道与 CMY 同法 —— inverted ink 下 K 也是线性油墨量，边缘半透明过渡同样正确。
 *
 * 使用完整非预乘 alpha-over（与 canvas putImageData→drawImage 语义一致），必须考虑
 * 目标已有 alpha：简化公式 src·α+dst·(1−α) 仅适用于不透明目标，会污染透明区域。
 *   out_a   = src_a + dst_a·(1−src_a)
 *   out_inv = (src_inv·src_a + dst_inv·dst_a·(1−src_a)) / out_a   (out_a > 0)
 *
 * 初始画布为全透明纯黑（K=100%），与旧 clearRect→getImageData(0,0,0,0)→rgbaToCmyka
 * 的未覆盖像素行为一致：hasBackground 时作为不透明黑背景写出，否则 alpha=0 不显示。
 *
 * 不创建 canvas —— 解除 PSD composite 的 MAX_PREVIEW_PIXELS canvas 硬限制，并省掉
 * 整张 RGBA 缓冲与两次颜色转换，峰值内存从 ~13 B/px 降至 5 B/px（仅 compCmyka 自身）。
 */
export function compositeCmykaLayers(
  layers: CmykLayer[],
  canvasW: number,
  canvasH: number,
): Uint8Array {
  const rowBytes = canvasW * 5;
  const comp = new Uint8Array(canvasW * canvasH * 5);

  // 初始化为纯黑(K=100%)+透明：inverted CMYK = (255,255,255,0), alpha=0
  if (canvasW > 0 && canvasH > 0) {
    const rowPattern = new Uint8Array(rowBytes);
    for (let px = 0; px < canvasW; px++) {
      const o = px * 5;
      rowPattern[o] = 255;
      rowPattern[o + 1] = 255;
      rowPattern[o + 2] = 255;
      rowPattern[o + 3] = 0;
      rowPattern[o + 4] = 0;
    }
    for (let py = 0; py < canvasH; py++) comp.set(rowPattern, py * rowBytes);
  }

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const lw = layer.width;
    const lh = layer.height;
    const src = layer.cmyka;
    const left = layer.left;
    const top = layer.top;

    // 完全在画布外则跳过；否则裁剪到画布内有效区域
    if (left >= canvasW || top >= canvasH || left + lw <= 0 || top + lh <= 0) continue;
    const x0 = Math.max(0, -left);
    const x1 = Math.min(lw, canvasW - left);
    const y0 = Math.max(0, -top);
    const y1 = Math.min(lh, canvasH - top);

    for (let py = y0; py < y1; py++) {
      const dy = top + py;
      let srcIdx = (py * lw + x0) * 5;
      let dstIdx = (dy * canvasW + left + x0) * 5;
      for (let px = x0; px < x1; px++) {
        const sa = src[srcIdx + 4];
        if (sa === 255) {
          // 源不透明：直接覆盖目标（out_a=1 → out_inv=src_inv）
          comp[dstIdx]     = src[srcIdx];
          comp[dstIdx + 1] = src[srcIdx + 1];
          comp[dstIdx + 2] = src[srcIdx + 2];
          comp[dstIdx + 3] = src[srcIdx + 3];
          comp[dstIdx + 4] = 255;
        } else if (sa !== 0) {
          const da = comp[dstIdx + 4];
          const saN = sa / 255;
          const daN = da / 255;
          const oaN = saN + daN * (1 - saN);
          if (oaN > 0) {
            const w1 = saN / oaN;
            const w2 = (daN * (1 - saN)) / oaN;
            let v = src[srcIdx]     * w1 + comp[dstIdx]     * w2;
            comp[dstIdx]     = v > 255 ? 255 : Math.round(v);
            v =                 src[srcIdx + 1] * w1 + comp[dstIdx + 1] * w2;
            comp[dstIdx + 1] = v > 255 ? 255 : Math.round(v);
            v =                 src[srcIdx + 2] * w1 + comp[dstIdx + 2] * w2;
            comp[dstIdx + 2] = v > 255 ? 255 : Math.round(v);
            v =                 src[srcIdx + 3] * w1 + comp[dstIdx + 3] * w2;
            comp[dstIdx + 3] = v > 255 ? 255 : Math.round(v);
            const outA = oaN * 255;
            comp[dstIdx + 4] = outA >= 255 ? 255 : Math.round(outA);
          }
        }
        srcIdx += 5;
        dstIdx += 5;
      }
    }
  }

  return comp;
}

/** §5. Composite Image Data — flattened preview in CMYK */
function writeCompositeImageData(
  w: BinaryWriter,
  layers: CmykLayer[],
  canvasW: number,
  canvasH: number,
  compositeHasAlpha: boolean
): void {
  // Composite preview: 直接在 CMYK 空间合成所有图层（不经 canvas / RGBA 往返）
  const compCmyka = compositeCmykaLayers(layers, canvasW, canvasH);

  w.u16(1); // Compression: RLE

  const compChannels = [0, 1, 2, 3];
  if (compositeHasAlpha) compChannels.push(4);

  // Write scanline lengths first, then compressed data
  const compCompressed: Uint8Array[] = [];
  for (const chOff of compChannels) {
    const c = compressChannel(compCmyka, chOff, 5, canvasW, canvasH);
    for (const len of c.scanlineLengths) w.u16(len);
    compCompressed.push(c.compressed);
  }
  for (const data of compCompressed) {
    w.bytes(data);
  }
}

/**
 * Convert CMYKA (inverted ink) back to RGBA.
 *
 * 历史上用于 composite 渲染（CMYK→RGBA→canvas 合成）；composite 已改为直接 CMYK 空间
 * 合成（见 compositeCmykaLayers），本函数保留作 CMYK↔RGBA 往返工具与单元测试。
 *
 * In PSD's inverted ink convention:
 *   C_inv = 255 × (1 - C),  K_inv = 255 × (1 - K)
 *
 * To recover RGB:
 *   R = 255 × (1 - C)(1 - K)
 *     = 255 × (C_inv / 255) × (K_inv / 255)
 *     = C_inv × K_inv / 255
 *
 * Verification:
 *   White RGBA(255,255,255) → CMYK(0,0,0,0) → inv(255,255,255,255) → 255×255/255 = 255 ✅
 *   Black RGBA(0,0,0,0)    → CMYK(0,0,0,1) → inv(255,255,255,0)   → 255×0/255   = 0   ✅
 */
export function cmykaToRgba(cmyka: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const n = width * height;
  const rgba = new Uint8ClampedArray(n * 4);
  for (let p = 0; p < n; p++) {
    const c = cmyka[p * 5];
    const m = cmyka[p * 5 + 1];
    const y = cmyka[p * 5 + 2];
    const k = cmyka[p * 5 + 3];
    const a = cmyka[p * 5 + 4];
    rgba[p * 4]     = Math.round(c * k / 255);   // R = C_inv × K_inv / 255
    rgba[p * 4 + 1] = Math.round(m * k / 255);   // G = M_inv × K_inv / 255
    rgba[p * 4 + 2] = Math.round(y * k / 255);   // B = Y_inv × K_inv / 255
    rgba[p * 4 + 3] = a;                          // A = alpha (unchanged)
  }
  return rgba;
}

// ─── Public API ───────────────────────────────────────────────────────

export function writeCmykPsd(
  layers: CmykLayer[],
  canvasW: number,
  canvasH: number,
  hasBackground: boolean,
  dpi: number
): Uint8Array {
  const w = new BinaryWriter();
  const compositeHasAlpha = !hasBackground;

  writeFileHeader(w, canvasW, canvasH, compositeHasAlpha);
  writeColorModeData(w);
  writeImageResources(w, dpi);
  writeLayerAndMaskInfo(w, layers);
  writeCompositeImageData(w, layers, canvasW, canvasH, compositeHasAlpha);

  return w.toUint8Array();
}
