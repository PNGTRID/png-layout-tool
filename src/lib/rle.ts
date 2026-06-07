/**
 * PackBits RLE compression (PSD standard).
 */

export function rleCompressScanline(data: Uint8Array): Uint8Array {
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
export function compressChannel(
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
