import { CMYK_GCR_NEUTRAL, CMYK_GCR_COLORFUL, CMYK_TAC_LIMIT } from '../shared/constants';

/** Clamp to [0, 1] — 防御浮点误差导致反相后越界 */
function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * RGBA → CMYK(A) colour conversion — 快速近似版（无 ICC profile / 3D LUT）。
 *
 * PSD stores CMYK as INVERTED ink values: 0 = 100% ink, 255 = 0% ink.
 *
 * 转换流程：
 *   1. 基础 CMY = 1 − RGB。
 *   2. GCR（Gray Component Replacement）：将三色共同的中性灰成分部分转给黑版 K。
 *      中性像素（c≈m≈y）多转（CMYK_GCR_NEUTRAL，暗调稳定），
 *      彩色像素少转（CMYK_GCR_COLORFUL，保留饱和度）。
 *   3. TAC（Total Area Coverage）clamp：总墨量 C+M+Y+K ≤ CMYK_TAC_LIMIT（300%），
 *      超限四通道等比缩放，防止印刷糊版。
 *
 * ⚠ 快速近似，未做 ICC 色域映射：鲜艳 RGB 可能溢出 CMYK 色域、暗调层次有限。
 *    专业印刷建议在 Photoshop 中用目标 ICC profile（SWOP / FOGRA39）重新转换。
 */
export function rgbaToCmyka(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const n = width * height;
  const out = new Uint8Array(n * 5);
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4] / 255;
    const g = rgba[i * 4 + 1] / 255;
    const b = rgba[i * 4 + 2] / 255;

    // 1. 基础 CMY（1 − RGB）
    let c = 1 - r;
    let m = 1 - g;
    let y = 1 - b;

    // 2. GCR：灰成分部分转 K。中性度越高（越接近灰）转越多，彩色少转以保饱和度。
    //    neutrality ∈ [0,1]：1 = 纯中性灰（c=m=y），0 = 纯彩色（某通道为 0 → gray=0 不转）。
    const gray = Math.min(c, m, y);
    const sum = c + m + y;
    const neutrality = sum > 0 ? (gray * 3) / sum : 1;
    const gcr = CMYK_GCR_COLORFUL + (CMYK_GCR_NEUTRAL - CMYK_GCR_COLORFUL) * neutrality;
    const removed = gray * gcr;
    c -= removed;
    m -= removed;
    y -= removed;
    let k = removed;

    // 3. TAC clamp：总墨量上限，等比缩放四通道防糊版
    const total = c + m + y + k;
    if (total > CMYK_TAC_LIMIT) {
      const scale = CMYK_TAC_LIMIT / total;
      c *= scale;
      m *= scale;
      y *= scale;
      k *= scale;
    }

    // 4. Invert to PSD convention: 255 = no ink, 0 = full ink
    out[i * 5]     = 255 - Math.round(clamp01(c) * 255);
    out[i * 5 + 1] = 255 - Math.round(clamp01(m) * 255);
    out[i * 5 + 2] = 255 - Math.round(clamp01(y) * 255);
    out[i * 5 + 3] = 255 - Math.round(clamp01(k) * 255);
    out[i * 5 + 4] = rgba[i * 4 + 3]; // alpha unchanged
  }
  return out;
}
