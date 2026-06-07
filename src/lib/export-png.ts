import { LayoutResult, UploadedImage } from '../shared/types';
import { platformAPI } from '../shared/ipc';
import { drawRotatedImage } from './draw-rotated';
import { loadImage } from './image-cache';
import { getSrcCropRect } from './canvas-utils';
import { downloadBlob } from './download';
import type { ExportProgressCallback } from './export-psd';

export async function renderToCanvas(
  canvas: HTMLCanvasElement,
  layout: LayoutResult,
  images: UploadedImage[],
  backgroundColor: string | null,
  onProgress?: ExportProgressCallback
): Promise<void> {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d context');

  canvas.width = layout.canvasWidth;
  canvas.height = layout.canvasHeight;

  // Clear canvas (transparent)
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw background color if specified
  if (backgroundColor) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Build image lookup map for O(1) access instead of O(n) find()
  const imageMap = new Map(images.map(img => [img.id, img]));

  // Draw each image at its layout position
  const totalCells = layout.cells.length;
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
