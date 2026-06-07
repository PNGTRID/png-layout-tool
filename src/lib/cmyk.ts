/**
 * RGBA → CMYK(A) colour conversion.
 * PSD stores CMYK as INVERTED ink values: 0 = 100% ink, 255 = 0% ink.
 */

export function rgbaToCmyka(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
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
