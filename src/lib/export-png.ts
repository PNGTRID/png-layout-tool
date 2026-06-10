import type { LayoutResult, LayoutCell, UploadedImage } from '../shared/types';
import { STRIP_HEIGHT, MAX_PREVIEW_PIXELS, COLOR_ERROR_FILL } from '../shared/constants';
import { platformAPI } from '../shared/ipc';
import { drawRotatedImage } from './draw-rotated';
import { loadImage, clearImageCache } from './image-cache';
import { getSrcCropRect } from './canvas-utils';
import { drawCropMarks } from './crop-marks';
import { downloadBlob } from './download';
import type { ExportProgressCallback } from './export-psd';

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
  onProgress?: ExportProgressCallback,
  showCropMarks?: boolean,
  dpi?: number
): Promise<void> {
  const totalPixels = layout.canvasWidth * layout.canvasHeight;
  const totalCells = layout.cells.length;

  // Clear image cache before export to free memory from preview rendering
  clearImageCache();

  // --- Small layout: direct render (fast, simple) ---
  if (totalPixels <= MAX_PREVIEW_PIXELS) {
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

      try {
        const img = await loadImage(imgData.objectUrl);
        const { trimX, trimY, trimW, trimH } = getSrcCropRect(cell);

        drawRotatedImage(
          ctx, img,
          cell.x, cell.y, cell.drawWidth, cell.drawHeight,
          trimX, trimY, trimW, trimH,
          imgData.rotation, cell.rotated
        );
      } catch (err) {
        console.error(`[export-png] Cell render failed: ${imgData.name}`, err);
        // Draw red placeholder for failed cell
        ctx.fillStyle = COLOR_ERROR_FILL;
        ctx.fillRect(cell.x, cell.y, cell.drawWidth, cell.drawHeight);
      }
    }

    // Draw crop marks if enabled
    if (showCropMarks) {
      drawCropMarks(ctx, layout.cells, dpi ?? 300);
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

  // Draw crop marks on final canvas if enabled
  if (showCropMarks) {
    drawCropMarks(finalCtx, layout.cells, dpi ?? 300);
  }
}

export async function exportPNG(
  canvas: HTMLCanvasElement,
  filePath: string,
  dpi: number,
  onProgress?: ExportProgressCallback
): Promise<void> {
  onProgress?.('compress', 0, 1);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Failed to create PNG blob'));
    }, 'image/png');
  });

  const rawBuffer = new Uint8Array(await blob.arrayBuffer());

  // Inject pHYs chunk with DPI metadata before the first IDAT chunk
  const buffer = injectPhysChunk(rawBuffer, dpi) as Uint8Array<ArrayBuffer>;

  onProgress?.('save', 0, 1);
  if (filePath !== '__browser_fallback__') {
    await platformAPI.writeFile(filePath, buffer);
  } else {
    downloadBlob(new Blob([buffer], { type: 'image/png' }), 'layout.png');
  }

  onProgress?.('done', 1, 1);
}

/**
 * Inject a pHYs chunk into an existing PNG buffer to embed DPI metadata.
 * The pHYs chunk is inserted right before the first IDAT chunk.
 *
 * pHYs chunk format:
 *   4 bytes: length (9)
 *   4 bytes: "pHYs"
 *   4 bytes: pixels per unit, X axis (uint32 big-endian)
 *   4 bytes: pixels per unit, Y axis (uint32 big-endian)
 *   1 byte:  unit specifier (1 = meter)
 *   4 bytes: CRC32 over "pHYs" + data
 */
function injectPhysChunk(png: Uint8Array, dpi: number): Uint8Array {
  // Convert DPI to pixels per meter: dpi * 39.3701
  const ppm = Math.round(dpi * 39.3701);

  // Find the first IDAT chunk position and check for existing pHYs
  // PNG structure: 8-byte signature, then chunks: [4 length][4 type][data][4 CRC]
  let idatOffset = -1;
  let existingPhysOffset = -1;
  let existingPhysLength = 0;
  let offset = 8; // skip PNG signature
  while (offset < png.length - 8) {
    const chunkType = String.fromCharCode(png[offset + 4], png[offset + 5], png[offset + 6], png[offset + 7]);
    if (chunkType === 'pHYs') {
      existingPhysOffset = offset;
      existingPhysLength = 12 + ((png[offset] << 24) | (png[offset + 1] << 16) | (png[offset + 2] << 8) | png[offset + 3]);
    }
    if (chunkType === 'IDAT') {
      idatOffset = offset;
      break;
    }
    const chunkLen = (png[offset] << 24) | (png[offset + 1] << 16) | (png[offset + 2] << 8) | png[offset + 3];
    offset += 12 + chunkLen; // 4 len + 4 type + data + 4 CRC
  }

  if (idatOffset === -1) return png; // No IDAT found, return unchanged

  // If existing pHYs found, remove it first
  let cleanedPng = png;
  if (existingPhysOffset !== -1) {
    cleanedPng = new Uint8Array(png.length - existingPhysLength);
    cleanedPng.set(png.subarray(0, existingPhysOffset), 0);
    cleanedPng.set(png.subarray(existingPhysOffset + existingPhysLength), existingPhysOffset);
    // Adjust IDAT offset after removal
    idatOffset -= existingPhysLength;
  }

  // Build pHYs chunk: 4(length=9) + 4("pHYs") + 9(data) + 4(CRC) = 21 bytes
  const physChunk = new Uint8Array(21);
  const view = new DataView(physChunk.buffer);

  // Length = 9 (pHYs data is always 9 bytes)
  view.setUint32(0, 9);

  // Chunk type: "pHYs"
  physChunk[4] = 0x70; // p
  physChunk[5] = 0x48; // H
  physChunk[6] = 0x59; // Y
  physChunk[7] = 0x73; // s

  // Pixels per unit X
  view.setUint32(8, ppm);
  // Pixels per unit Y
  view.setUint32(12, ppm);
  // Unit: 1 = meter
  physChunk[16] = 1;

  // CRC32 over chunk type + data (bytes 4..16)
  const crc = crc32(physChunk, 4, 13);
  view.setUint32(17, crc);

  // Splice pHYs chunk before IDAT
  const result = new Uint8Array(cleanedPng.length + 21);
  result.set(cleanedPng.subarray(0, idatOffset), 0);
  result.set(physChunk, idatOffset);
  result.set(cleanedPng.subarray(idatOffset), idatOffset + 21);

  return result;
}

/** CRC32 lookup table (PNG polynomial 0xEDB88320) */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
})();

/** Compute CRC32 over a range of a Uint8Array */
function crc32(data: Uint8Array, start: number, length: number): number {
  let crc = 0xFFFFFFFF;
  const end = start + length;
  for (let i = start; i < end; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
