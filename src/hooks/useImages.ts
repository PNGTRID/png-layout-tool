import { useState, useCallback } from 'react';
import { UploadedImage } from '../shared/types';
import { initializeCanvas, readPsd } from 'ag-psd';

// Initialize ag-psd canvas factory for PSD reading
initializeCanvas((w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
});

function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36).substring(0, 4);
}

/** Scan image alpha channel to find the tight bounding box of non-transparent content */
function computeTrimBounds(img: HTMLImageElement): { x: number; y: number; w: number; h: number } {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { x: 0, y: 0, w: img.width, h: img.height };

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;

  let minX = width, minY = height, maxX = 0, maxY = 0;
  let hasContent = false;

  // Sample every pixel to find alpha > 0 bounds
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 0) {
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

/** Shared: given a loaded Image, compute trim bounds + thumbnail → UploadedImage */
function processLoadedImage(img: HTMLImageElement, file: File, objectUrl: string): UploadedImage {
  const trim = computeTrimBounds(img);

  const maxThumbSize = 200;
  const scale = Math.min(1, maxThumbSize / img.width, maxThumbSize / img.height);
  const thumbWidth = Math.round(img.width * scale);
  const thumbHeight = Math.round(img.height * scale);

  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumbWidth;
  thumbCanvas.height = thumbHeight;
  const ctx = thumbCanvas.getContext('2d')!;
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
    dataUrl,
    objectUrl,
  };
}

function loadImageInfo(file: File): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => resolve(processLoadedImage(img, file, objectUrl));
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to load image: ${file.name}`));
    };

    img.src = objectUrl;
  });
}

/** Load a PSD file and return one UploadedImage per layer */
async function loadPsdAsImages(file: File): Promise<UploadedImage[]> {
  const buffer = await file.arrayBuffer();
  const psd = readPsd(buffer);

  if (!psd.children || psd.children.length === 0) {
    // No layers — fall back to composite
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
      reject(new Error(`Failed to load PSD layer: ${name}`));
    };
    img.src = objectUrl;
  });

  const result = processLoadedImage(img, file, objectUrl);
  result.name = name;
  return result;
}

export function useImages() {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const addFiles = useCallback(async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    try {
      const fileArray = Array.from(files).filter(f =>
        f.type === 'image/png' || f.name.toLowerCase().endsWith('.png') ||
        f.name.toLowerCase().endsWith('.psd')
      );

      if (fileArray.length === 0) {
        setIsProcessing(false);
        return;
      }

      const newImages = (
        await Promise.all(
          fileArray.map(f =>
            f.name.toLowerCase().endsWith('.psd')
              ? loadPsdAsImages(f)
              : loadImageInfo(f).then(img => [img])
          )
        )
      ).flat();
      setImages(prev => [...prev, ...newImages]);
    } catch (err) {
      console.error('Error loading images:', err);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages(prev => {
      const img = prev.find(i => i.id === id);
      if (img) {
        URL.revokeObjectURL(img.objectUrl);
      }
      return prev.filter(i => i.id !== id);
    });
  }, []);

  const reorderImages = useCallback((newOrder: UploadedImage[]) => {
    setImages(newOrder);
  }, []);

  const clearAll = useCallback(() => {
    setImages(prev => {
      prev.forEach(img => {
        URL.revokeObjectURL(img.objectUrl);
      });
      return [];
    });
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    setImages(prev => prev.map(img =>
      img.id === id ? { ...img, quantity: Math.max(1, Math.min(99, quantity)) } : img
    ));
  }, []);

  const totalQuantity = images.reduce((sum, img) => sum + img.quantity, 0);

  return { images, isProcessing, addFiles, removeImage, reorderImages, clearAll, updateQuantity, totalQuantity };
}
