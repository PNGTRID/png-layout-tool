/**
 * TIFF file loading utilities.
 * Browsers cannot natively render TIFF, so we decode via the `utif` library into
 * RGBA pixels, paint onto a canvas, then feed it through the shared image
 * pipeline (trim detection + thumbnail) by re-encoding as a PNG ObjectURL.
 *
 * Full resolution and transparency are preserved — only the decode path differs from PNG.
 */
import UTIF from 'utif';
import { MAX_IMAGE_DIMENSION, TIF_ALPHA_SAMPLE_TARGET } from '../shared/constants';
import type { UploadedImage } from '../shared/types';
import { processLoadedImage } from './image-loader';

/**
 * 检测并丢弃无效的 alpha 通道（专色 TIFF 的伪透明度）。
 *
 * 部分印刷用 TIFF（含 Photoshop 专色/蒙版通道）携带一个语义"未指定"
 * 的额外样本（ExtraSamples=0），UTIF 会将其当作 alpha。该通道实际存储
 * 蒙版或专色强度等数据，值集中在低区段，会让大面积像素近乎透明，
 * 图案无法显示。
 *
 * 启发式判定：合法的透明蒙版必然存在完全透明(alpha=0)的像素；
 * 若采样后找不到任何 0 值，即认定该 alpha 不表达透明度，强制全部不透明。
 *
 * @param data RGBA 像素数据（原地修改）
 * @param pixelCount 像素总数
 */
export function flattenInvalidAlpha(data: Uint8ClampedArray, pixelCount: number): void {
  // 均匀采样约 TIF_ALPHA_SAMPLE_TARGET 点用于判定（大图全扫过慢）
  const stride = Math.max(1, Math.floor(pixelCount / TIF_ALPHA_SAMPLE_TARGET));
  let transparentPixels = 0;
  for (let i = 0; i < pixelCount; i += stride) {
    if (data[i * 4 + 3] === 0) transparentPixels++;
  }
  // 存在完全透明像素 → alpha 表达真实透明度，保留原状
  if (transparentPixels > 0) return;
  // 无任何透明像素 → 该 alpha 非透明度，丢弃并强制不透明，只显示图案
  for (let i = 0; i < pixelCount; i++) {
    data[i * 4 + 3] = 255;
  }
  console.info(`[tif-loader] 检测到非透明度 alpha 通道（疑似专色/蒙版），已强制不透明仅保留图案 (${pixelCount} px)`);
}

/** Decode a TIFF File into an HTMLCanvasElement (RGBA) via UTIF. */
async function decodeTiffToCanvas(file: File): Promise<HTMLCanvasElement> {
  const buffer = await file.arrayBuffer();
  const ifds = UTIF.decode(buffer);
  if (ifds.length === 0) {
    throw new Error(`无法解析 TIFF 文件: ${file.name}`);
  }
  // Multi-page TIFFs are uncommon for print artwork — use the first page
  const firstIfd = ifds[0];
  UTIF.decodeImage(buffer, firstIfd, ifds);
  const rgba = UTIF.toRGBA8(firstIfd);
  const width = firstIfd.width;
  const height = firstIfd.height;

  if (!width || !height) {
    throw new Error(`TIFF 尺寸无效: ${file.name}`);
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    throw new Error(`图片尺寸过大 (${width}×${height})，最大支持 ${MAX_IMAGE_DIMENSION}px`);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D 不可用');
  }
  // Build an ArrayBuffer-backed ImageData and copy decoded RGBA into it.
  // (UTIF returns Uint8Array<ArrayBufferLike>; ImageData requires a concrete ArrayBuffer.)
  const imageData = new ImageData(width, height);
  imageData.data.set(rgba);
  // 丢弃专色 TIFF 的伪 alpha 通道（如 ExtraSamples=0 的蒙版/专色强度），
  // 否则图案区域会因 alpha 过低而消失，无法显示图案。
  flattenInvalidAlpha(imageData.data, width * height);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Load a single TIFF file → UploadedImage (full resolution, transparency preserved). */
export async function loadTiffImage(file: File): Promise<UploadedImage> {
  const canvas = await decodeTiffToCanvas(file);

  // Re-encode the decoded canvas as PNG so the existing image pipeline
  // (trim detection, thumbnail) processes it uniformly with PNG/PSD imports.
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      b => b ? resolve(b) : reject(new Error('TIFF 转 PNG 失败')),
      'image/png',
    );
  });
  const objectUrl = URL.createObjectURL(blob);

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`无法加载 TIFF 图像: ${file.name}`));
    };
    img.src = objectUrl;
  });

  return processLoadedImage(img, file, objectUrl);
}
