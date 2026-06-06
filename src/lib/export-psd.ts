import { LayoutResult, UploadedImage, LayoutParams } from '../shared/types';

const imageCache = new Map<string, HTMLImageElement>();

async function loadImage(objectUrl: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(objectUrl);
  if (cached && cached.complete) return cached;
  const img = new Image();
  img.src = objectUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load: ${objectUrl}`));
  });
  imageCache.set(objectUrl, img);
  return img;
}

// ─── RGBA → CMYK conversion ─────────────────────────────────────────
// PSD stores CMYK as INVERTED ink values: 0 = 100% ink, 255 = 0% ink

function rgbaToCmyka(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const n = width * height;
  const out = new Uint8Array(n * 5);
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4] / 255;
    const g = rgba[i * 4 + 1] / 255;
    const b = rgba[i * 4 + 2] / 255;
    const k = 1 - Math.max(r, g, b);
    const c = k >= 1 ? 0 : (1 - r - k) / (1 - k);
    const m = k >= 1 ? 0 : (1 - g - k) / (1 - k);
    const y = k >= 1 ? 0 : (1 - b - k) / (1 - k);
    // Invert to PSD convention: 255 = no ink, 0 = full ink
    out[i * 5]     = 255 - Math.round(c * 255);
    out[i * 5 + 1] = 255 - Math.round(m * 255);
    out[i * 5 + 2] = 255 - Math.round(y * 255);
    out[i * 5 + 3] = 255 - Math.round(k * 255);
    out[i * 5 + 4] = rgba[i * 4 + 3]; // alpha unchanged
  }
  return out;
}

// ─── PackBits RLE compression (PSD standard) ────────────────────────

function rleCompressScanline(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    let runLen = 1;
    while (i + runLen < data.length && data[i + runLen] === data[i] && runLen < 128) runLen++;
    if (runLen >= 2) {
      out.push(1 - runLen); // repeat: -(count-1)
      out.push(data[i]);
      i += runLen;
    } else {
      const start = i;
      while (i < data.length && (i - start) < 128) {
        if (i + 1 < data.length && data[i] === data[i + 1]) break;
        i++;
      }
      const count = i - start;
      if (count > 0) {
        out.push(count - 1);
        for (let j = start; j < start + count; j++) out.push(data[j]);
      }
    }
  }
  return new Uint8Array(out);
}

/** Extract one channel from interleaved pixel data and RLE-compress it */
function compressChannel(
  pixelData: Uint8Array, offset: number, step: number,
  width: number, height: number
): { scanlineLengths: number[]; compressed: Uint8Array } {
  const scanlineLengths: number[] = [];
  const chunks: Uint8Array[] = [];

  for (let y = 0; y < height; y++) {
    const scanline = new Uint8Array(width);
    for (let x = 0; x < width; x++) {
      scanline[x] = pixelData[(y * width + x) * step + offset];
    }
    const c = rleCompressScanline(scanline);
    scanlineLengths.push(c.length);
    chunks.push(c);
  }

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const merged = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) { merged.set(c, pos); pos += c.length; }
  return { scanlineLengths, compressed: merged };
}

// ─── Big-endian binary writer ───────────────────────────────────────

class W {
  private d: number[] = [];
  get pos() { return this.d.length; }
  u8(v: number) { this.d.push(v & 0xff); }
  u16(v: number) { this.d.push((v >> 8) & 0xff, v & 0xff); }
  u32(v: number) { this.d.push((v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff); }
  i16(v: number) { this.u16(v < 0 ? v + 0x10000 : v); }
  i32(v: number) { this.u32(v < 0 ? v + 0x100000000 : v); }
  bytes(arr: Uint8Array) { for (let i = 0; i < arr.length; i++) this.d.push(arr[i]); }
  str(s: string) { for (let i = 0; i < s.length; i++) this.d.push(s.charCodeAt(i)); }
  pad(m: number) { while (this.d.length % m !== 0) this.d.push(0); }
  patch32(off: number, v: number) {
    this.d[off] = (v >> 24) & 0xff;
    this.d[off + 1] = (v >> 16) & 0xff;
    this.d[off + 2] = (v >> 8) & 0xff;
    this.d[off + 3] = v & 0xff;
  }
  toUint8Array() { return new Uint8Array(this.d); }
}

// ─── Layer data ─────────────────────────────────────────────────────

interface CmykLayer {
  name: string;
  cmyka: Uint8Array;
  width: number;
  height: number;
  left: number;
  top: number;
  hasAlpha: boolean;
}

// ─── Write a CMYK PSD file ──────────────────────────────────────────

function writeCmykPsd(layers: CmykLayer[], canvasW: number, canvasH: number): Uint8Array {
  const w = new W();

  // ── 1. File Header (26 bytes) ──
  w.str('8BPS');                          // signature
  w.u16(1);                               // version
  w.u16(0); w.u16(0); w.u16(0);           // reserved
  // Composite channels: CMYK = 4, + alpha if composite has transparency
  const compositeHasAlpha = true;         // layout canvas always has transparent areas
  w.u16(compositeHasAlpha ? 5 : 4);       // channels
  w.u32(canvasH);                         // rows
  w.u32(canvasW);                         // columns
  w.u16(8);                               // depth
  w.u16(4);                               // color mode: CMYK

  // ── 2. Color Mode Data ──
  w.u32(0);                               // empty for CMYK

  // ── 3. Image Resources ──
  const resBuf = new W();
  // Resolution resource (ID 1005)
  resBuf.str('8BIM');                     // signature
  resBuf.u16(1005);                       // resource ID
  resBuf.u8(0); resBuf.u8(0);             // pascal name (empty, padded to 2)
  resBuf.u32(16);                         // data size: 16 bytes
  resBuf.u16(72); resBuf.u16(0);          // hRes: 72.0 fixed-point
  resBuf.u16(1);                          // hResUnit: PPI
  resBuf.u16(1);                          // widthUnit: inches
  resBuf.u16(72); resBuf.u16(0);          // vRes: 72.0 fixed-point
  resBuf.u16(1);                          // vResUnit: PPI
  resBuf.u16(1);                          // heightUnit: inches
  const resData = resBuf.toUint8Array();
  w.u32(resData.length);
  w.bytes(resData);

  // ── 4. Layer and Mask Information ──
  const lmStart = w.pos;
  w.u32(0);                               // placeholder: section length

  // --- 4a. Layer Info sub-section ---
  const liStart = w.pos;
  w.u32(0);                               // placeholder: layer info length

  // Merge layer count + alpha flag:
  // Negative count means first layer's alpha is "real" alpha (not a shape mask)
  w.i16(-layers.length);                  // negative = first alpha is transparency

  // Pre-compress all channel data
  interface ChData { id: number; lengths: number[]; data: Uint8Array; }
  const allChData: ChData[][] = layers.map(layer => {
    const chs: ChData[] = [];
    for (let ch = 0; ch < 4; ch++) {      // C=0, M=1, Y=2, K=3
      const c = compressChannel(layer.cmyka, ch, 5, layer.width, layer.height);
      chs.push({ id: ch, lengths: c.scanlineLengths, data: c.compressed });
    }
    if (layer.hasAlpha) {
      const c = compressChannel(layer.cmyka, 4, 5, layer.width, layer.height);
      chs.push({ id: -1, lengths: c.scanlineLengths, data: c.compressed });
    }
    return chs;
  });

  // Write layer records (one per layer)
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const chs = allChData[i];

    w.i32(layer.top);                     // top
    w.i32(layer.left);                     // left
    w.i32(layer.top + layer.height);       // bottom
    w.i32(layer.left + layer.width);       // right
    w.u16(chs.length);                     // channel count

    for (const ch of chs) {
      w.i16(ch.id);                        // channel ID (-1=alpha, 0-3=CMYK)
      // data length = compression(2) + scanline count table (height*2) + compressed bytes
      w.u32(2 + layer.height * 2 + ch.data.length);
    }

    w.str('8BIM');                         // blend mode signature
    w.str('norm');                         // blend mode key
    w.u8(255);                              // opacity
    w.u8(0);                                // clipping
    w.u8(0);                                // flags
    w.u8(0);                                // filler

    // Extra data field
    const extraBuf = new W();
    extraBuf.u32(0);                        // layer mask data (empty)
    extraBuf.u32(0);                        // blending ranges (empty)
    // Layer name: pascal string padded to multiple of 4
    const nameBytes = new TextEncoder().encode(layer.name);
    const nameTotal = ((1 + nameBytes.length) + 3) & ~3; // pad to 4
    extraBuf.u8(nameBytes.length);
    for (const b of nameBytes) extraBuf.u8(b);
    for (let p = 1 + nameBytes.length; p < nameTotal; p++) extraBuf.u8(0);

    const extraBytes = extraBuf.toUint8Array();
    w.u32(extraBytes.length);
    w.bytes(extraBytes);
  }

  // Write channel image data (follows all layer records)
  for (let i = 0; i < layers.length; i++) {
    for (const ch of allChData[i]) {
      w.u16(1);                             // compression: RLE
      // Scanline byte counts — MUST be big-endian
      for (const len of ch.lengths) w.u16(len);
      w.bytes(ch.data);
    }
  }

  // Pad layer info to even boundary
  w.pad(2);
  // Patch layer info length
  w.patch32(liStart, w.pos - liStart - 4);

  // Global layer mask info (empty)
  w.u32(0);

  // Patch layer-and-mask section length
  w.patch32(lmStart, w.pos - lmStart - 4);

  // ── 5. Composite Image Data ──
  // Build composite by merging all layers onto a transparent canvas
  const compCanvas = new OffscreenCanvas(canvasW, canvasH);
  const compCtx = compCanvas.getContext('2d')!;
  compCtx.clearRect(0, 0, canvasW, canvasH);

  for (const layer of layers) {
    // Convert CMYK (PSD inverted: 255=no ink, 0=full ink) back to RGBA
    const rgba = new Uint8ClampedArray(layer.width * layer.height * 4);
    for (let p = 0; p < layer.width * layer.height; p++) {
      const c = layer.cmyka[p * 5];
      const m = layer.cmyka[p * 5 + 1];
      const y = layer.cmyka[p * 5 + 2];
      const k = layer.cmyka[p * 5 + 3];
      const a = layer.cmyka[p * 5 + 4];
      // R = stored_C * stored_K / 255 (since stored = 255 - ink%)
      rgba[p * 4]     = Math.round(c * k / 255);
      rgba[p * 4 + 1] = Math.round(m * k / 255);
      rgba[p * 4 + 2] = Math.round(y * k / 255);
      rgba[p * 4 + 3] = a;
    }
    const tmpCanvas = new OffscreenCanvas(layer.width, layer.height);
    const tmpCtx = tmpCanvas.getContext('2d')!;
    tmpCtx.putImageData(new ImageData(rgba, layer.width, layer.height), 0, 0);
    compCtx.drawImage(tmpCanvas, layer.left, layer.top);
  }

  const compRgba = compCtx.getImageData(0, 0, canvasW, canvasH);
  const compCmyka = rgbaToCmyka(compRgba.data, canvasW, canvasH);

  w.u16(1);                                // compression: RLE

  // Write channels: C(0) M(1) Y(2) K(3) A(-1)
  const compChannels = [0, 1, 2, 3];
  if (compositeHasAlpha) compChannels.push(4); // alpha at offset 4

  // PSD composite RLE spec: ALL scanline byte counts first, THEN ALL compressed data
  // (This is different from layer channel data, which interleaves per channel)
  const compCompressed: Uint8Array[] = [];
  for (const chOff of compChannels) {
    const c = compressChannel(compCmyka, chOff, 5, canvasW, canvasH);
    for (const len of c.scanlineLengths) w.u16(len);
    compCompressed.push(c.compressed);
  }
  for (const data of compCompressed) {
    w.bytes(data);
  }

  return w.toUint8Array();
}

// ─── Public export function ─────────────────────────────────────────

export async function exportPSD(
  layout: LayoutResult,
  images: UploadedImage[],
  params: LayoutParams,
  filePath: string
): Promise<void> {
  const layerPromises = layout.cells.map(async (cell): Promise<CmykLayer | null> => {
    const imgData = images.find(i => i.id === cell.imageId);
    if (!imgData) return null;

    const canvas = document.createElement('canvas');
    canvas.width = cell.drawWidth;
    canvas.height = cell.drawHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const trimW = cell.srcWidth - cell.srcTrimX * 2;
    const trimH = cell.srcHeight - cell.srcTrimY * 2;
    const img = await loadImage(imgData.objectUrl);

    if (cell.rotated) {
      ctx.translate(cell.drawWidth, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, cell.srcTrimX, cell.srcTrimY, trimW, trimH, 0, 0, cell.drawHeight, cell.drawWidth);
    } else {
      ctx.drawImage(img, cell.srcTrimX, cell.srcTrimY, trimW, trimH, 0, 0, cell.drawWidth, cell.drawHeight);
    }

    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const cmyka = rgbaToCmyka(rgba.data, canvas.width, canvas.height);
    const hasAlpha = rgba.data.some((v, i) => i % 4 === 3 && v < 255);

    return {
      name: imgData.name.replace(/\.[^.]+$/, ''),
      cmyka,
      width: canvas.width,
      height: canvas.height,
      left: cell.x,
      top: cell.y,
      hasAlpha,
    };
  });

  const layers = (await Promise.all(layerPromises)).filter((l): l is CmykLayer => l !== null);

  if (params.backgroundColor) {
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = layout.canvasWidth;
    bgCanvas.height = layout.canvasHeight;
    const bgCtx = bgCanvas.getContext('2d')!;
    bgCtx.fillStyle = params.backgroundColor;
    bgCtx.fillRect(0, 0, layout.canvasWidth, layout.canvasHeight);

    const bgRgba = bgCtx.getImageData(0, 0, layout.canvasWidth, layout.canvasHeight);
    const bgCmyka = rgbaToCmyka(bgRgba.data, layout.canvasWidth, layout.canvasHeight);

    layers.unshift({
      name: 'Background',
      cmyka: bgCmyka,
      width: layout.canvasWidth,
      height: layout.canvasHeight,
      left: 0,
      top: 0,
      hasAlpha: false,
    });
  }

  const psdData = writeCmykPsd(layers, layout.canvasWidth, layout.canvasHeight);

  if (window.electronAPI) {
    await window.electronAPI.writeFile(filePath, psdData);
  } else {
    const blob = new Blob([psdData.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filePath.split('/').pop() || filePath.split('\\').pop() || 'export.psd';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
