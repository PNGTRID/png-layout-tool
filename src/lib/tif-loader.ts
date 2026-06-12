/**
 * TIFF file loading utilities.
 * Browsers cannot natively render TIFF, so we decode via the `utif` library into
 * RGBA pixels, paint onto a canvas, then feed it through the shared image
 * pipeline (trim detection + thumbnail) by re-encoding as a PNG ObjectURL.
 *
 * Full resolution and transparency are preserved — only the decode path differs from PNG.
 */
import UTIF from 'utif';
import { MAX_IMAGE_DIMENSION } from '../shared/constants';
import type { UploadedImage } from '../shared/types';
import { processLoadedImage } from './image-loader';

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
