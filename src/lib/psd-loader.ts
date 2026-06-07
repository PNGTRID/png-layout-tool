/**
 * PSD file loading and parsing utilities.
 * Handles PSD magic header validation and ag-psd integration.
 */

import { MAX_FILE_SIZE_MB } from '../shared/constants';
import type { UploadedImage } from '../shared/types';
import { processLoadedImage } from './image-loader';

/** Maximum PSD file size (MB) — PSDs require ~5x memory for parsing */
const MAX_PSD_SIZE_MB = MAX_FILE_SIZE_MB * 0.5;

// Lazy-initialize ag-psd canvas factory (avoids module-level side effects)
let psdInitialized = false;

/** Reset PSD init state — call in test beforeEach to ensure isolation */
export function resetPsdState(): void {
  psdInitialized = false;
}
async function ensurePsdInit(): Promise<void> {
  if (psdInitialized) return;
  const { initializeCanvas } = await import('ag-psd');
  initializeCanvas((w: number, h: number) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  });
  psdInitialized = true;
}

/** Validate PSD file magic header (8BPS) */
export function isPsdFile(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;
      if (buffer.byteLength < 4) { resolve(false); return; }
      const view = new DataView(buffer);
      const sig = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
      resolve(sig === '8BPS');
    };
    reader.onerror = () => resolve(false);
    // Only read first 4 bytes for magic number check
    reader.readAsArrayBuffer(file.slice(0, 4));
  });
}

/** Convert a single layer canvas → UploadedImage */
async function layerCanvasToImage(
  canvas: HTMLCanvasElement,
  file: File,
  name: string
): Promise<UploadedImage> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      b => b ? resolve(b) : reject(new Error('Canvas toBlob failed')),
      'image/png'
    );
  });
  const objectUrl = URL.createObjectURL(blob);

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`无法加载 PSD 图层: ${name}`));
    };
    img.src = objectUrl;
  });

  const result = processLoadedImage(img, file, objectUrl);
  result.name = name;
  return result;
}

/** Load a PSD file and return one UploadedImage per layer */
export async function loadPsdAsImages(file: File): Promise<UploadedImage[]> {
  // Memory protection: reject oversized PSDs early
  if (file.size > MAX_PSD_SIZE_MB * 1024 * 1024) {
    throw new Error(`PSD 文件过大 (${(file.size / 1024 / 1024).toFixed(0)}MB)，最大支持 ${MAX_PSD_SIZE_MB.toFixed(0)}MB`);
  }

  // Validate file header before parsing
  if (!(await isPsdFile(file))) {
    throw new Error(`不是有效的 PSD 文件: ${file.name}`);
  }

  await ensurePsdInit();
  const { readPsd } = await import('ag-psd');

  const buffer = await file.arrayBuffer();
  const psd = readPsd(buffer);

  if (!psd.children || psd.children.length === 0) {
    if (psd.canvas && psd.canvas.width > 0) {
      return [await layerCanvasToImage(psd.canvas, file, file.name)];
    }
    throw new Error(`PSD 没有图层: ${file.name}`);
  }

  const results: UploadedImage[] = [];
  for (const layer of psd.children) {
    const layerCanvas = layer.canvas;
    if (!layerCanvas || layerCanvas.width === 0 || layerCanvas.height === 0) continue;

    const layerName = layer.name || `${file.name} - 图层 ${results.length + 1}`;
    results.push(await layerCanvasToImage(layerCanvas, file, layerName));
  }

  return results;
}
