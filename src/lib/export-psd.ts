/**
 * PSD export orchestrator.
 * Uses psd-writer, cmyk, and shared image-cache modules.
 */

import { LayoutResult, UploadedImage, LayoutParams } from '../shared/types';
import { platformAPI } from '../shared/ipc';
import { drawRotatedImage } from './draw-rotated';
import { loadImage, clearImageCache } from './image-cache';
import { rgbaToCmyka } from './cmyk';
import { writeCmykPsd, CmykLayer } from './psd-writer';
import { getSrcCropRect } from './canvas-utils';
import { downloadBlob } from './download';

export type ExportProgressCallback = (phase: string, current: number, total: number) => void;

export interface ExportAbortSignal {
  aborted: boolean;
}

export async function exportPSD(
  layout: LayoutResult,
  images: UploadedImage[],
  params: LayoutParams,
  filePath: string,
  onProgress?: ExportProgressCallback,
  abortSignal?: ExportAbortSignal
): Promise<void> {
  const totalCells = layout.cells.length;
  const layers: CmykLayer[] = [];

  // Clear image cache before PSD export to free memory from preview rendering
  clearImageCache();

  // Build image lookup map for O(1) access instead of O(n) find()
  const imageMap = new Map(images.map(img => [img.id, img]));

  // Phase 1: Render each cell to CMYK layer (sequential to avoid memory spikes)
  for (let idx = 0; idx < layout.cells.length; idx++) {
    // Cancellation checkpoint
    if (abortSignal?.aborted) return;

    onProgress?.('render', idx + 1, totalCells);

    const cell = layout.cells[idx];
    const imgData = imageMap.get(cell.imageId);
    if (!imgData) continue;

    const canvas = document.createElement('canvas');
    canvas.width = cell.drawWidth;
    canvas.height = cell.drawHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    const { trimX, trimY, trimW, trimH } = getSrcCropRect(cell);
    const img = await loadImage(imgData.objectUrl);

    // Check abort after async operation
    if (abortSignal?.aborted) return;

    drawRotatedImage(
      ctx, img,
      0, 0, cell.drawWidth, cell.drawHeight,
      trimX, trimY, trimW, trimH,
      imgData.rotation, cell.rotated
    );

    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const cmyka = rgbaToCmyka(rgba.data, canvas.width, canvas.height);
    const hasAlpha = rgba.data.some((v, i) => i % 4 === 3 && v < 255);

    layers.push({
      name: imgData.name.replace(/\.[^.]+$/, ''),
      cmyka,
      width: canvas.width,
      height: canvas.height,
      left: cell.x,
      top: cell.y,
      hasAlpha,
    });

    // Release canvas + ImageData memory promptly
    canvas.width = 0;
    canvas.height = 0;
  }

  // Final abort check before expensive binary write
  if (abortSignal?.aborted) return;

  // Phase 2: Add background if needed
  let hasBackground = false;
  if (params.backgroundColor) {
    hasBackground = true;
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = layout.canvasWidth;
    bgCanvas.height = layout.canvasHeight;
    const bgCtx = bgCanvas.getContext('2d');
    if (!bgCtx) throw new Error('Failed to get 2d context for background');
    bgCtx.fillStyle = params.backgroundColor;
    bgCtx.fillRect(0, 0, layout.canvasWidth, layout.canvasHeight);

    const bgRgba = bgCtx.getImageData(0, 0, layout.canvasWidth, layout.canvasHeight);
    const bgCmyka = rgbaToCmyka(bgRgba.data, layout.canvasWidth, layout.canvasHeight);

    layers.unshift({
      name: 'Background',
      cmyka: bgCmyka,
      width: layout.canvasWidth,
      height: layout.canvasHeight,
      left: 0,
      top: 0,
      hasAlpha: false,
    });
  }

  // Phase 3: Write PSD binary
  onProgress?.('write', 0, 1);
  const psdData = writeCmykPsd(layers, layout.canvasWidth, layout.canvasHeight, hasBackground);

  // Phase 4: Save to disk
  onProgress?.('save', 0, 1);
  if (filePath !== '__browser_fallback__') {
    await platformAPI.writeFile(filePath, psdData);
  } else {
    const blob = new Blob([psdData.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    downloadBlob(blob, 'layout.psd');
  }

  onProgress?.('done', 1, 1);
}
