import { useState, useCallback } from 'react';
import { UploadedImage } from '../shared/types';
import { MAX_FILE_SIZE_MB } from '../shared/constants';
import { loadImageInfo } from '../lib/image-loader';
import { loadPsdAsImages } from '../lib/psd-loader';
import { showToast } from '../components/Toast';

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

      // Load files in parallel, collecting errors per file
      const failedFiles: string[] = [];
      const newImages = (
        await Promise.all(
          validFiles.map(f =>
            f.name.toLowerCase().endsWith('.psd')
              ? loadPsdAsImages(f).catch(err => {
                  failedFiles.push(`${f.name}: ${err instanceof Error ? err.message : String(err)}`);
                  return [] as UploadedImage[];
                })
              : loadImageInfo(f).then(img => [img]).catch(err => {
                  failedFiles.push(`${f.name}: ${err instanceof Error ? err.message : String(err)}`);
                  return [] as UploadedImage[];
                })
          )
        )
      ).flat();

      // Notify user about failures
      if (failedFiles.length > 0) {
        showToast('error', `${failedFiles.length} 个文件加载失败: ${failedFiles.slice(0, 3).join('; ')}${failedFiles.length > 3 ? '...' : ''}`);
      }

      if (newImages.length > 0) {
        setImages(prev => [...prev, ...newImages]);
      }
    } catch (err) {
      console.error('[images] Unexpected error:', err);
      showToast('error', `图片加载异常: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages(prev => prev.filter(i => i.id !== id));
  }, []);

  const reorderImages = useCallback((newOrder: UploadedImage[]) => {
    setImages(newOrder);
  }, []);

  const clearAll = useCallback(() => {
    // Use functional update to access latest state, then revoke all URLs
    setImages((prev) => {
      for (const img of prev) {
        URL.revokeObjectURL(img.objectUrl);
      }
      return [];
    });
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    setImages(prev => prev.map(img =>
      img.id === id ? { ...img, quantity: Math.max(1, Math.min(99, quantity)) } : img
    ));
  }, []);

  const batchUpdateQuantity = useCallback((ids: string[], quantity: number) => {
    const q = Math.max(1, Math.min(99, quantity));
    const idSet = new Set(ids);
    setImages(prev => prev.map(img =>
      idSet.has(img.id) ? { ...img, quantity: q } : img
    ));
  }, []);

  const updateTargetSize = useCallback((id: string, targetWidthCm?: number, targetHeightCm?: number) => {
    setImages(prev => prev.map(img =>
      img.id === id ? { ...img, targetWidthCm, targetHeightCm } : img
    ));
  }, []);

  const rotateImage = useCallback((id: string) => {
    setImages(prev => prev.map(img => {
      if (img.id !== id) return img;
      const next = ((img.rotation / 90) + 1) % 4 * 90 as 0 | 90 | 180 | 270;
      return { ...img, rotation: next };
    }));
  }, []);

  const totalQuantity = images.reduce((sum, img) => sum + img.quantity, 0);

  return { images, isProcessing, addFiles, removeImage, reorderImages, clearAll, updateQuantity, batchUpdateQuantity, updateTargetSize, rotateImage, totalQuantity };
}
