import { LayoutResult, LayoutCell, UploadedImage } from '../shared/types';
import { platformAPI } from '../shared/ipc';
import { drawRotatedImage } from './draw-rotated';
import { loadImage, clearImageCache } from './image-cache';
import { getSrcCropRect } from './canvas-utils';
import { downloadBlob } from './download';
import type { ExportProgressCallback } from './export-psd';

/**
 * Maximum height (px) per rendering strip.
 * A 4096px tall strip at full layout width keeps memory under ~250MB per strip
 * even for a 6732px-wide layout (6732 × 4096 × 4 = ~110MB RGBA).
 */
const STRIP_HEIGHT = 4096;

/**
 * Estimated safe pixel budget for a single canvas allocation.
 * ~100M pixels ≈ 400MB RGBA — safe for most WebView processes.
 */
const SAFE_CANVAS_PIXELS = 100_000_000;

/**
 * Check if a cell overlaps with a horizontal strip [stripY, stripY + stripH).
 */
function cellOverlapsStrip(cell: LayoutCell, stripY: number, stripH: number): boolean {
  const cellBottom = cell.y + cell.drawHeight;
  const stripBottom = stripY + stripH;
  return cell.y < stripBottom && cellBottom > stripY;
}

/**
 * Render a single horizontal strip of the layout onto a canvas.
 * Only draws cells that overlap with the strip region.
 */
async function renderStrip(
  stripCanvas: HTMLCanvasElement,
  layout: LayoutResult,
  images: UploadedImage[],
  backgroundColor: string | null,
  stripY: number,
  stripH: number
): Promise<void> {
  const ctx = stripCanvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d context');

  stripCanvas.width = layout.canvasWidth;
  stripCanvas.height = stripH;

  // Clear (transparent)
  ctx.clearRect(0, 0, stripCanvas.width, stripCanvas.height);

  // Draw background
  if (backgroundColor) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, stripCanvas.width, stripCanvas.height);
  }

  // Translate so that layout coordinates map correctly
  ctx.save();
  ctx.translate(0, -stripY);

  // Build image lookup map
  const imageMap = new Map(images.map(img => [img.id, img]));

  // Only draw cells that overlap this strip
  for (const cell of layout.cells) {
    if (!cellOverlapsStrip(cell, stripY, stripH)) continue;

    const imgData = imageMap.get(cell.imageId);
    if (!imgData) continue;

    const img = await loadImage(imgData.objectUrl);
    const { trimX, trimY, trimW, trimH } = getSrcCropRect(cell);

    drawRotatedImage(
      ctx, img,
      cell.x, cell.y, cell.drawWidth, cell.drawHeight,
      trimX, trimY, trimW, trimH,
      imgData.rotation, cell.rotated
    );
  }

  ctx.restore();
}

/**
 * Render the full layout to a canvas — uses strip rendering for large layouts
 * to avoid OOM crashes. For small layouts, renders directly.
 *
 * MEMORY STRATEGY:
 * - Small layouts (<100M pixels): direct single-canvas render (original behavior)
 * - Large layouts: render in horizontal strips (≤4096px each), composite onto
 *   the final canvas. Peak memory = final canvas + one strip buffer.
 * - Before rendering, clears the image cache to free memory occupied by
 *   previously loaded preview images.
 */
export async function renderToCanvas(
  canvas: HTMLCanvasElement,
  layout: LayoutResult,
  images: UploadedImage[],
  backgroundColor: string | null,
  onProgress?: ExportProgressCallback
): Promise<void> {
  const totalPixels = layout.canvasWidth * layout.canvasHeight;
  const totalCells = layout.cells.length;

  // Clear image cache before export to free memory from preview rendering
  clearImageCache();

  // --- Small layout: direct render (fast, simple) ---
  if (totalPixels <= SAFE_CANVAS_PIXELS) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2d context');

    canvas.width = layout.canvasWidth;
    canvas.height = layout.canvasHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (backgroundColor) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const imageMap = new Map(images.map(img => [img.id, img]));

    for (let idx = 0; idx < totalCells; idx++) {
      onProgress?.('render', idx + 1, totalCells);
      const cell = layout.cells[idx];
      const imgData = imageMap.get(cell.imageId);
      if (!imgData) continue;

      const img = await loadImage(imgData.objectUrl);
      const { trimX, trimY, trimW, trimH } = getSrcCropRect(cell);

      drawRotatedImage(
        ctx, img,
        cell.x, cell.y, cell.drawWidth, cell.drawHeight,
        trimX, trimY, trimW, trimH,
        imgData.rotation, cell.rotated
      );
    }
    return;
  }

  // --- Large layout: strip-based render ---
  console.info(`[export] Large canvas detected (${layout.canvasWidth}×${layout.canvasHeight}, ${(totalPixels / 1e6).toFixed(1)}M pixels) — using strip rendering`);

  const numStrips = Math.ceil(layout.canvasHeight / STRIP_HEIGHT);
  const stripCanvas = document.createElement('canvas');

  // Set up final canvas
  canvas.width = layout.canvasWidth;
  canvas.height = layout.canvasHeight;
  const finalCtx = canvas.getContext('2d');
  if (!finalCtx) throw new Error('Failed to get 2d context');
  finalCtx.clearRect(0, 0, canvas.width, canvas.height);

  if (backgroundColor) {
    finalCtx.fillStyle = backgroundColor;
    finalCtx.fillRect(0, 0, canvas.width, canvas.height);
  }

  let renderedCells = 0;

  for (let s = 0; s < numStrips; s++) {
    const stripY = s * STRIP_HEIGHT;
    const stripH = Math.min(STRIP_HEIGHT, layout.canvasHeight - stripY);

    await renderStrip(stripCanvas, layout, images, null, stripY, stripH);

    // Composite strip onto final canvas
    finalCtx.drawImage(stripCanvas, 0, stripY);

    // Progress: estimate based on strips
    renderedCells = Math.round(((s + 1) / numStrips) * totalCells);
    onProgress?.('render', Math.min(renderedCells, totalCells), totalCells);

    // Clear strip canvas to free its backing store before next iteration
    const stripCtx = stripCanvas.getContext('2d');
    stripCtx?.clearRect(0, 0, stripCanvas.width, stripCanvas.height);
  }

  onProgress?.('render', totalCells, totalCells);
}

export async function exportPNG(
  canvas: HTMLCanvasElement,
  filePath: string,
  onProgress?: ExportProgressCallback
): Promise<void> {
  onProgress?.('compress', 0, 1);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Failed to create PNG blob'));
    }, 'image/png');
  });

  const arrayBuffer = await blob.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  onProgress?.('save', 0, 1);
  if (filePath !== '__browser_fallback__') {
    await platformAPI.writeFile(filePath, buffer);
  } else {
    downloadBlob(blob, 'layout.png');
  }

  onProgress?.('done', 1, 1);
}
