/**
 * Image loading and processing utilities.
 * Pure functions for loading PNG images, computing trim bounds, and generating thumbnails.
 *
 * Memory strategy for large images:
 * - Imported images are NEVER downscaled — full resolution is preserved for print quality.
 * - computeTrimBounds uses a two-phase approach (coarse + fine ROI) to avoid creating
 *   full-size canvases during trim detection, saving ~1GB RAM for large images.
 * - Only thumbnails (≤200px) are downscaled — these are for UI display only.
 */

import { MAX_THUMB_SIZE, MAX_IMAGE_DIMENSION, TRIM_SMALL_IMAGE_PIXELS, TRIM_COARSE_MAX_DIM, MIN_VALID_DPI, MAX_VALID_DPI } from '../shared/constants';
import type { UploadedImage } from '../shared/types';

/** Monotonic counter for unique ID generation (avoids collision under concurrent loads) */
let idCounter = 0;

/** Generate a short unique ID with collision resistance */
export function generateId(): string {
  const counter = idCounter++;
  const random = Math.random().toString(36).substring(2, 8);
  const timestamp = Date.now().toString(36);
  return `${random}${timestamp}${counter.toString(36)}`;
}

/**
 * Read DPI from PNG pHYs chunk.
 * PNG structure: 8-byte signature, then chunks (4-byte length + 4-byte type + data + 4-byte CRC).
 * pHYs chunk data: pixelsPerUnitX (4 bytes) + pixelsPerUnitY (4 bytes) + unit (1 byte).
 * unit=1 means meter. DPI = pixelsPerUnit / 39.3701
 *
 * This preserves the image's intended physical dimensions — e.g. a 30cm image
 * at 150 DPI won't appear as 15cm when the layout tool uses 300 DPI.
 */
async function readPngDpi(file: File): Promise<number | null> {
  try {
    // Only read the first 64KB — pHYs must appear before IDAT
    const buffer = await file.slice(0, 65536).arrayBuffer();
    const view = new DataView(buffer);

    // Verify PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < 8; i++) {
      if (view.getUint8(i) !== sig[i]) return null;
    }

    let offset = 8;
    while (offset + 12 <= buffer.byteLength) {
      const chunkLength = view.getUint32(offset);
      // Guard against overflow: chunkLength must not push offset beyond buffer
      if (chunkLength > buffer.byteLength - offset - 12) break;
      const chunkType = String.fromCharCode(
        view.getUint8(offset + 4),
        view.getUint8(offset + 5),
        view.getUint8(offset + 6),
        view.getUint8(offset + 7),
      );

      if (chunkType === 'pHYs' && offset + 8 + 9 <= buffer.byteLength) {
        const ppux = view.getUint32(offset + 8);
        const unit = view.getUint8(offset + 16);

        if (unit === 1 && ppux > 0) {
          return Math.round(ppux / 39.3701);
        }
        return null;
      }

      if (chunkType === 'IDAT') break; // pHYs must appear before IDAT

      offset += 12 + chunkLength;
    }
  } catch {
    // Silently ignore pHYs reading errors
  }
  return null;
}

/**
 * Scan image alpha channel to find the tight bounding box of non-transparent content.
 * Uses a two-phase approach for large images to avoid OOM:
 *   Phase 1: Coarse scan on a downscaled version (≤1024px) to find approximate bounds
 *   Phase 2: Fine scan only on the ROI (region of interest) of the full image
 * For images ≤4M pixels (≈2048×2048), does direct full scan one row at a time.
 *
 * IMPORTANT: This does NOT modify or downscale the original image.
 * It only creates temporary small canvases for detection purposes.
 */
export function computeTrimBounds(img: HTMLImageElement): { x: number; y: number; w: number; h: number } {
  const { width, height } = img;

  // For small images, do a direct row-by-row scan (no downscale needed)
  if (width * height <= TRIM_SMALL_IMAGE_PIXELS) {
    return computeTrimBoundsDirect(img);
  }

  // Phase 1: Coarse scan on downscaled image (uses ~4MB RAM max)
  const scale = Math.min(TRIM_COARSE_MAX_DIM / width, TRIM_COARSE_MAX_DIM / height);
  const cw = Math.round(width * scale);
  const ch = Math.round(height * scale);

  const coarseCanvas = document.createElement('canvas');
  coarseCanvas.width = cw;
  coarseCanvas.height = ch;
  const coarseCtx = coarseCanvas.getContext('2d');
  if (!coarseCtx) return computeTrimBoundsDirect(img);

  coarseCtx.drawImage(img, 0, 0, cw, ch);

  let coarseMinX = cw, coarseMinY = ch, coarseMaxX = 0, coarseMaxY = 0;
  let hasContent = false;

  for (let y = 0; y < ch; y++) {
    const rowData = coarseCtx.getImageData(0, y, cw, 1);
    const { data } = rowData;
    for (let x = 0; x < cw; x++) {
      if (data[x * 4 + 3] > 0) {
        hasContent = true;
        if (x < coarseMinX) coarseMinX = x;
        if (x > coarseMaxX) coarseMaxX = x;
        if (y < coarseMinY) coarseMinY = y;
        if (y > coarseMaxY) coarseMaxY = y;
      }
    }
  }

  if (!hasContent) return { x: 0, y: 0, w: width, h: height };

  // Map coarse bounds back to original coordinates with 2px margin
  const margin = Math.ceil(2 / scale);
  const roiX = Math.max(0, Math.floor(coarseMinX / scale) - margin);
  const roiY = Math.max(0, Math.floor(coarseMinY / scale) - margin);
  const roiR = Math.min(width, Math.ceil(coarseMaxX / scale) + margin + 1);
  const roiB = Math.min(height, Math.ceil(coarseMaxY / scale) + margin + 1);
  const roiW = roiR - roiX;
  const roiH = roiB - roiY;

  // Phase 2: Fine scan only on the ROI — much smaller than full image
  const roiCanvas = document.createElement('canvas');
  roiCanvas.width = roiW;
  roiCanvas.height = roiH;
  const roiCtx = roiCanvas.getContext('2d');
  if (!roiCtx) return computeTrimBoundsDirect(img);

  roiCtx.drawImage(img, roiX, roiY, roiW, roiH, 0, 0, roiW, roiH);

  let minX = roiW, minY = roiH, maxX = 0, maxY = 0;
  let fineHasContent = false;

  for (let y = 0; y < roiH; y++) {
    const rowData = roiCtx.getImageData(0, y, roiW, 1);
    const { data } = rowData;
    for (let x = 0; x < roiW; x++) {
      if (data[x * 4 + 3] > 0) {
        fineHasContent = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!fineHasContent) return { x: 0, y: 0, w: width, h: height };

  return {
    x: roiX + minX,
    y: roiY + minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  };
}

/**
 * Direct row-by-row trim bound computation for small images.
 * Only one row of ImageData is allocated at a time.
 */
function computeTrimBoundsDirect(img: HTMLImageElement): { x: number; y: number; w: number; h: number } {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { x: 0, y: 0, w: img.width, h: img.height };

  ctx.drawImage(img, 0, 0);

  const { width, height } = canvas;

  let minX = width, minY = height, maxX = 0, maxY = 0;
  let hasContent = false;

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

    img.onload = async () => {
      // Hard dimension limit — canvas API cannot handle images beyond this
      if (img.width > MAX_IMAGE_DIMENSION || img.height > MAX_IMAGE_DIMENSION) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`图片尺寸过大 (${img.width}×${img.height})，最大支持 ${MAX_IMAGE_DIMENSION}px`));
        return;
      }

      // Process at FULL resolution — no downscaling for print quality
      const result = processLoadedImage(img, file, objectUrl);

      // Read PNG pHYs chunk to detect the image's intended physical dimensions
      const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
      if (isPng) {
        const imageDpi = await readPngDpi(file);
        // Clamp DPI to a reasonable range (72–2400) to prevent absurd cm values
        if (imageDpi && imageDpi >= MIN_VALID_DPI && imageDpi <= MAX_VALID_DPI) {
          const wCm = parseFloat((result.trimWidth * 2.54 / imageDpi).toFixed(2));
          const hCm = parseFloat((result.trimHeight * 2.54 / imageDpi).toFixed(2));
          // Only set target cm when the computed size is within a printable range
          if (wCm >= 0.1 && wCm <= 500 && hCm >= 0.1 && hCm <= 500) {
            result.targetWidthCm = wCm;
            result.targetHeightCm = hCm;
          }
        }
      }

      resolve(result);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`无法加载图片: ${file.name}`));
    };

    img.src = objectUrl;
  });
}
