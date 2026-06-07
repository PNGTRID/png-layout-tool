/**
 * Image loading and processing utilities.
 * Pure functions for loading PNG images, computing trim bounds, and generating thumbnails.
 */

import { MAX_THUMB_SIZE, MAX_IMAGE_DIMENSION } from '../shared/constants';
import type { UploadedImage } from '../shared/types';

/** Generate a short unique ID */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36).substring(0, 4);
}

/**
 * Scan image alpha channel to find the tight bounding box of non-transparent content.
 * Uses row-by-row scanning to limit memory: only one row of ImageData is allocated
 * at a time, so even a 16384×16384 image uses at most ~256KB per scan pass.
 */
export function computeTrimBounds(img: HTMLImageElement): { x: number; y: number; w: number; h: number } {
  const canvas = document.createElement('canvas');
  // Use full image size for drawing, but scan one row at a time
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { x: 0, y: 0, w: img.width, h: img.height };

  ctx.drawImage(img, 0, 0);

  const { width, height } = canvas;

  let minX = width, minY = height, maxX = 0, maxY = 0;
  let hasContent = false;

  // Scan one row at a time to avoid allocating the full ImageData buffer
  for (let y = 0; y < height; y++) {
    const rowData = ctx.getImageData(0, y, width, 1);
    const { data } = rowData;
    for (let x = 0; x < width; x++) {
      if (data[x * 4 + 3] > 0) {
        hasContent = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!hasContent) return { x: 0, y: 0, w: img.width, h: img.height };

  return {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  };
}

/** Given a loaded Image, compute trim bounds + thumbnail → UploadedImage */
export function processLoadedImage(img: HTMLImageElement, file: File, objectUrl: string): UploadedImage {
  const trim = computeTrimBounds(img);

  const scale = Math.min(1, MAX_THUMB_SIZE / img.width, MAX_THUMB_SIZE / img.height);
  const thumbWidth = Math.round(img.width * scale);
  const thumbHeight = Math.round(img.height * scale);

  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumbWidth;
  thumbCanvas.height = thumbHeight;
  const ctx = thumbCanvas.getContext('2d');
  if (!ctx) {
    return {
      id: generateId(),
      filePath: (file as File & { path?: string }).path || file.name,
      name: file.name,
      width: img.width,
      height: img.height,
      trimX: trim.x,
      trimY: trim.y,
      trimWidth: trim.w,
      trimHeight: trim.h,
      quantity: 1,
      rotation: 0,
      dataUrl: objectUrl,
      objectUrl,
    };
  }
  ctx.drawImage(img, 0, 0, thumbWidth, thumbHeight);

  let dataUrl: string;
  try {
    dataUrl = thumbCanvas.toDataURL('image/png');
  } catch {
    dataUrl = objectUrl;
  }

  return {
    id: generateId(),
    filePath: (file as File & { path?: string }).path || file.name,
    name: file.name,
    width: img.width,
    height: img.height,
    trimX: trim.x,
    trimY: trim.y,
    trimWidth: trim.w,
    trimHeight: trim.h,
    quantity: 1,
    rotation: 0,
    dataUrl,
    objectUrl,
  };
}

/** Load a single PNG file → UploadedImage */
export function loadImageInfo(file: File): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      if (img.width > MAX_IMAGE_DIMENSION || img.height > MAX_IMAGE_DIMENSION) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`图片尺寸过大 (${img.width}×${img.height})，最大支持 ${MAX_IMAGE_DIMENSION}px`));
        return;
      }
      resolve(processLoadedImage(img, file, objectUrl));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`无法加载图片: ${file.name}`));
    };

    img.src = objectUrl;
  });
}
