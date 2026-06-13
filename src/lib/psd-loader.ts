/**
 * PSD file loading and parsing utilities.
 * Handles PSD magic header validation and ag-psd integration.
 */

import { MAX_PSD_SIZE_MB } from '../shared/constants';
import type { UploadedImage } from '../shared/types';
import { processLoadedImage } from './image-loader';

/** Maximum recursion depth for nested layer groups */
const MAX_LAYER_DEPTH = 10;

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

  /**
   * Recursively collect layers from PSD tree, including nested groups.
   * Group nodes are traversed but not themselves converted to images.
   */
  async function collectLayers(
    children: Array<{ canvas?: HTMLCanvasElement; name?: string; children?: unknown[]; hidden?: boolean }>,
    parentPrefix: string,
    depth: number
  ): Promise<void> {
    if (depth >= MAX_LAYER_DEPTH) {
      console.warn(`[psd-loader] Max layer depth (${MAX_LAYER_DEPTH}) reached, skipping nested groups`);
      return;
    }
    for (const layer of children) {
      // Group node: recurse into children
      if ('children' in layer && Array.isArray(layer.children) && layer.children.length > 0) {
        const groupPrefix = parentPrefix ? `${parentPrefix}/${layer.name || '组'}` : (layer.name || '组');
        await collectLayers(layer.children as Array<{ canvas?: HTMLCanvasElement; name?: string; children?: unknown[]; hidden?: boolean }>, groupPrefix, depth + 1);
        continue;
      }

      // Skip hidden layers
      if ('hidden' in layer && layer.hidden) continue;

      const layerCanvas = layer.canvas;
      if (!layerCanvas || layerCanvas.width === 0 || layerCanvas.height === 0) continue;

      const layerName = layer.name || `${file.name} - 图层 ${results.length + 1}`;
      const displayName = parentPrefix ? `${parentPrefix}/${layerName}` : layerName;
      results.push(await layerCanvasToImage(layerCanvas, file, displayName));
    }
  }

  await collectLayers(psd.children as Array<{ canvas?: HTMLCanvasElement; name?: string; children?: unknown[]; hidden?: boolean }>, '', 0);

  if (results.length === 0) {
    throw new Error(`PSD 没有有效图层: ${file.name}`);
  }

  return results;
}
