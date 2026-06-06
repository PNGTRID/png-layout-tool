import { LayoutResult, UploadedImage } from '../shared/types';

const imageCache = new Map<string, HTMLImageElement>();

async function loadImage(objectUrl: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(objectUrl);
  if (cached && cached.complete) {
    return cached;
  }

  const img = new Image();
  img.src = objectUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load image: ${objectUrl}`));
  });
  imageCache.set(objectUrl, img);
  return img;
}

export async function renderToCanvas(
  canvas: HTMLCanvasElement,
  layout: LayoutResult,
  images: UploadedImage[],
  backgroundColor: string | null
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

  // Draw each image at its layout position
  for (const cell of layout.cells) {
    const imgData = images.find(i => i.id === cell.imageId);
    if (!imgData) continue;

    const img = await loadImage(imgData.objectUrl);
    const srcW = cell.srcWidth - cell.srcTrimX * 2;
    const srcH = cell.srcHeight - cell.srcTrimY * 2;

    if (cell.rotated) {
      ctx.save();
      ctx.translate(cell.x + cell.drawWidth, cell.y);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, cell.srcTrimX, cell.srcTrimY, srcW, srcH, 0, 0, cell.drawHeight, cell.drawWidth);
      ctx.restore();
    } else {
      ctx.drawImage(img, cell.srcTrimX, cell.srcTrimY, srcW, srcH, cell.x, cell.y, cell.drawWidth, cell.drawHeight);
    }
  }
}

export async function exportPNG(canvas: HTMLCanvasElement, filePath: string): Promise<void> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Failed to create PNG blob'));
    }, 'image/png');
  });

  const arrayBuffer = await blob.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  if (window.electronAPI) {
    await window.electronAPI.writeFile(filePath, buffer);
  } else {
    // Browser fallback: trigger download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filePath.split('/').pop() || filePath.split('\\').pop() || 'export.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
