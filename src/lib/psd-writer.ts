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
import { rgbaToCmyka } from './cmyk';

export interface CmykLayer {
  name: string;
  cmyka: Uint8Array;
  width: number;
  height: number;
  left: number;
  top: number;
  hasAlpha: boolean;
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

/** §3. Image Resources — Resolution info resource #1005 */
function writeImageResources(w: BinaryWriter): void {
  const resBuf = new BinaryWriter();
  resBuf.str('8BIM');
  resBuf.u16(1005);
  resBuf.u8(0); resBuf.u8(0);
  resBuf.u32(16);
  resBuf.u16(72); resBuf.u16(0); // Horizontal resolution: 72 PPI
  resBuf.u16(1);                  // Horizontal unit: 1 = PPI
  resBuf.u16(1);                  // Width unit: 1 = inches
  resBuf.u16(72); resBuf.u16(0); // Vertical resolution: 72 PPI
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
    if (layer.hasAlpha) {
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

  // Extra data: layer mask (0) + blending ranges (0) + name
  const extraBuf = new BinaryWriter();
  extraBuf.u32(0); // Layer mask data length
  extraBuf.u32(0); // Layer blending ranges data length

  // Pascal string name (padded to 4-byte boundary)
  const safeName = sanitiseLayerName(layer.name);
  const nameBytes = new TextEncoder().encode(safeName);
  const nameTotal = ((1 + nameBytes.length) + 3) & ~3;
  extraBuf.u8(nameBytes.length);
  for (const b of nameBytes) extraBuf.u8(b);
  for (let p = 1 + nameBytes.length; p < nameTotal; p++) extraBuf.u8(0);

  const extraBytes = extraBuf.toUint8Array();
  w.u32(extraBytes.length);
  w.bytes(extraBytes);
}

/** §5. Composite Image Data — flattened preview in CMYK */
function writeCompositeImageData(
  w: BinaryWriter,
  layers: CmykLayer[],
  canvasW: number,
  canvasH: number,
  compositeHasAlpha: boolean
): void {
  // Composite preview: render all layers onto a single canvas via CMYK→RGBA→CMYK round-trip
  const compCanvas = document.createElement('canvas');
  compCanvas.width = canvasW;
  compCanvas.height = canvasH;
  const compCtx = compCanvas.getContext('2d');
  if (!compCtx) throw new Error('Failed to get 2d context for composite image');
  compCtx.clearRect(0, 0, canvasW, canvasH);

  for (const layer of layers) {
    const rgba = cmykaToRgba(layer.cmyka, layer.width, layer.height);
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = layer.width;
    tmpCanvas.height = layer.height;
    const tmpCtx = tmpCanvas.getContext('2d');
    if (!tmpCtx) continue;
    tmpCtx.putImageData(new ImageData(rgba, layer.width, layer.height), 0, 0);
    compCtx.drawImage(tmpCanvas, layer.left, layer.top);

    // Release temp canvas memory promptly
    tmpCanvas.width = 0;
    tmpCanvas.height = 0;
  }

  const compRgba = compCtx.getImageData(0, 0, canvasW, canvasH);
  const compCmyka = rgbaToCmyka(compRgba.data, canvasW, canvasH);

  // Release composite canvas
  compCanvas.width = 0;
  compCanvas.height = 0;

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

/** Convert CMYKA (inverted ink) back to RGBA for canvas rendering */
function cmykaToRgba(cmyka: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const n = width * height;
  const rgba = new Uint8ClampedArray(n * 4);
  for (let p = 0; p < n; p++) {
    // CMYK values are stored as inverted ink: 255 = 0% ink, 0 = 100% ink
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
  hasBackground: boolean
): Uint8Array {
  const w = new BinaryWriter();
  const compositeHasAlpha = !hasBackground;

  writeFileHeader(w, canvasW, canvasH, compositeHasAlpha);
  writeColorModeData(w);
  writeImageResources(w);
  writeLayerAndMaskInfo(w, layers);
  writeCompositeImageData(w, layers, canvasW, canvasH, compositeHasAlpha);

  return w.toUint8Array();
}
