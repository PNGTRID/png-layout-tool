import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { UploadedImage } from '../shared/types';
import { MAX_FILE_SIZE_MB, MAX_QUANTITY_PER_IMAGE } from '../shared/constants';
import { loadImageInfo } from '../lib/image-loader';
import { loadPsdAsImages } from '../lib/psd-loader';
import { loadTiffImage } from '../lib/tif-loader';
import { clearImageCache } from '../lib/image-cache';
import { showToast } from '../components/Toast';
import { useUndoRedo } from './useUndoRedo';

/** Maximum number of files to load concurrently — prevents memory spikes */
const MAX_CONCURRENT_LOADS = 10;

/**
 * Process an array of promises with bounded concurrency.
 * Starts at most `concurrency` tasks at once; as each finishes, starts the next.
 * Unlike Promise.all, individual failures do NOT abort remaining tasks.
 */
async function parallelLimit<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIdx = 0;

  async function worker(): Promise<void> {
    while (nextIdx < tasks.length) {
      const idx = nextIdx++;
      try {
        results[idx] = await tasks[idx]();
      } catch {
        // Store undefined as sentinel — caller handles failures separately
        results[idx] = undefined as unknown as T;
      }
    }
  }

  // Launch bounded workers — errors are caught per-task
  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

export function useImages(
  onAction?: () => void,
  options?: { resolveQuantity?: (name: string) => number | null },
) {
  const resolveQuantity = options?.resolveQuantity;
  const [images, setImages, undoRedo] = useUndoRedo<UploadedImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const addFiles = useCallback(async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    try {
      const fileArray = Array.from(files).filter(f =>
        f.type === 'image/png' || /\.(png|psd|tif|tiff)$/i.test(f.name)
      );

      if (fileArray.length === 0) {
        setIsProcessing(false);
        return;
      }

      // Enforce file size limit
      const oversized = fileArray.filter(f => f.size > MAX_FILE_SIZE_MB * 1024 * 1024);
      if (oversized.length > 0) {
        const names = oversized.map(f => f.name).join(', ');
        showToast('warning', `已跳过 ${oversized.length} 个超过 ${MAX_FILE_SIZE_MB}MB 的文件: ${names}`);
      }
      const validFiles = fileArray.filter(f => f.size <= MAX_FILE_SIZE_MB * 1024 * 1024);
      if (validFiles.length === 0) {
        setIsProcessing(false);
        return;
      }

      // Load files with bounded concurrency, collecting errors per file
      const failedFiles: string[] = [];
      const loadTasks = validFiles.map(f => {
        const lower = f.name.toLowerCase();
        const isPsd = lower.endsWith('.psd');
        const isTif = lower.endsWith('.tif') || lower.endsWith('.tiff');
        return () =>
          (isPsd
            ? loadPsdAsImages(f)
            : isTif
              ? loadTiffImage(f).then(img => [img])
              : loadImageInfo(f).then(img => [img])
          ).catch(err => {
            failedFiles.push(`${f.name}: ${err instanceof Error ? err.message : String(err)}`);
            return [] as UploadedImage[];
          });
      });

      const newImages = (await parallelLimit(loadTasks, MAX_CONCURRENT_LOADS)).flat();

      // Notify user about failures (log full list to console for debugging)
      if (failedFiles.length > 0) {
        console.error('[images] Failed files:', failedFiles);
        showToast('error', `${failedFiles.length} 个文件加载失败: ${failedFiles.slice(0, 3).join('; ')}${failedFiles.length > 3 ? '...' : ''}`);
      }

      if (newImages.length > 0) {
        // Apply filename-quantity recognition — PNG file names and PSD layer
        // names both surface as img.name, so a single resolver covers both.
        if (resolveQuantity) {
          for (const img of newImages) {
            const q = resolveQuantity(img.name);
            if (q !== null && q >= 1) {
              img.quantity = Math.min(q, MAX_QUANTITY_PER_IMAGE);
            }
          }
        }
        setImages(prev => [...prev, ...newImages]);
        onAction?.();
      }
    } catch (err) {
      console.error('[images] Unexpected error:', err);
      showToast('error', `图片加载异常: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  }, [onAction, setImages, resolveQuantity]);

  const removeImage = useCallback((id: string) => {
    setImages(prev => prev.filter(i => i.id !== id));
    onAction?.();
  }, [onAction, setImages]);

  const reorderImages = useCallback((newOrder: UploadedImage[]) => {
    setImages(newOrder);
    onAction?.();
  }, [onAction, setImages]);

  const clearAll = useCallback(() => {
    // Revoke URLs immediately (undo will restore state but URLs are gone — acceptable tradeoff)
    const current = imagesRef.current;
    for (const img of current) {
      URL.revokeObjectURL(img.objectUrl);
    }
    setImages([]);
    onAction?.();
  }, [onAction, setImages]);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    setImages(prev => prev.map(img =>
      img.id === id ? { ...img, quantity: Math.max(1, Math.min(MAX_QUANTITY_PER_IMAGE, quantity)) } : img
    ));
    onAction?.();
  }, [onAction, setImages]);

  const batchUpdateQuantity = useCallback((ids: string[], quantity: number) => {
    const q = Math.max(1, Math.min(MAX_QUANTITY_PER_IMAGE, quantity));
    const idSet = new Set(ids);
    setImages(prev => prev.map(img =>
      idSet.has(img.id) ? { ...img, quantity: q } : img
    ));
    onAction?.();
  }, [onAction, setImages]);

  const updateTargetSize = useCallback((id: string, targetWidthCm?: number, targetHeightCm?: number) => {
    setImages(prev => prev.map(img =>
      img.id === id ? { ...img, targetWidthCm, targetHeightCm } : img
    ));
    onAction?.();
  }, [onAction, setImages]);

  const rotateImage = useCallback((id: string) => {
    setImages(prev => prev.map(img => {
      if (img.id !== id) return img;
      const next = ((img.rotation / 90) + 1) % 4 * 90 as 0 | 90 | 180 | 270;
      return { ...img, rotation: next };
    }));
    onAction?.();
  }, [onAction, setImages]);

  const totalQuantity = useMemo(() => images.reduce((sum, img) => sum + img.quantity, 0), [images]);

  // Cleanup: revoke all ObjectURLs and clear cache on unmount
  const imagesRef = useRef(images);
  imagesRef.current = images;

  useEffect(() => {
    return () => {
      for (const img of imagesRef.current) {
        URL.revokeObjectURL(img.objectUrl);
      }
      clearImageCache();
    };
  }, []);

  return { images, isProcessing, addFiles, removeImage, reorderImages, clearAll, updateQuantity, batchUpdateQuantity, updateTargetSize, rotateImage, totalQuantity, undoRedo };
}
