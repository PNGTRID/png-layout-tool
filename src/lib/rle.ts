/**
 * PackBits RLE compression (PSD standard).
 */

export function rleCompressScanline(data: Uint8Array): Uint8Array {
  // PackBits 最坏情况是全 literal：每个 run ≤128 输入字节编码为 1 header + N data，
  // 故输出上界 = 输入长度 + run 数 ⌈n/128⌉。预分配后用 subarray 截断实际长度，
  // 避免原 number[] 逐字节 push 的装箱/扩容开销（binary-writer 同思路）。
  const maxOut = data.length + Math.ceil(data.length / 128);
  const out = new Uint8Array(maxOut);
  let pos = 0;
  let i = 0;
  while (i < data.length) {
    let runLen = 1;
    while (i + runLen < data.length && data[i + runLen] === data[i] && runLen < 128) runLen++;
    if (runLen >= 2) {
      out[pos++] = 1 - runLen; // repeat: -(count-1)
      out[pos++] = data[i];
      i += runLen;
    } else {
      const start = i;
      while (i < data.length && (i - start) < 128) {
        if (i + 1 < data.length && data[i] === data[i + 1]) break;
        i++;
      }
      const count = i - start;
      if (count > 0) {
        out[pos++] = count - 1;
        for (let j = start; j < start + count; j++) out[pos++] = data[j];
      }
    }
  }
  return out.subarray(0, pos);
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
