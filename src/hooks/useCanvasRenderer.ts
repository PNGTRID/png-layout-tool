/**
 * Canvas renderer hook — manages async image drawing with cancellation.
 * Extracted from LayoutCanvas for separation of concerns.
 */

import { useEffect, type RefObject } from 'react';
import { LayoutResult, UploadedImage } from '../shared/types';
import { MAX_PREVIEW_PIXELS } from '../shared/constants';
import { drawRotatedImage } from '../lib/draw-rotated';
import { loadImage } from '../lib/image-cache';
import { drawGapRulers, getSrcCropRect } from '../lib/canvas-utils';
import { showToast } from '../components/Toast';
import type { GapInfo } from '../lib/gap-ruler';

interface UseCanvasRendererOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  layout: LayoutResult;
  images: UploadedImage[];
  backgroundColor: string | null;
  selectedCellId: string | null;
  hoveredCellId: string | null;
  isDragging: boolean;
  nearestGaps: (GapInfo & { cell: import('../shared/types').LayoutCell })[];
  dpi: number;
  scaleReady: boolean;
}

/**
 * Clamp canvas dimensions to fit within the pixel budget, preserving aspect ratio.
 */
function clampCanvasSize(w: number, h: number): { w: number; h: number; scale: number } {
  const pixels = w * h;
  if (pixels <= MAX_PREVIEW_PIXELS) return { w, h, scale: 1 };
  const scale = Math.sqrt(MAX_PREVIEW_PIXELS / pixels);
  return { w: Math.round(w * scale), h: Math.round(h * scale), scale };
}

export function useCanvasRenderer({
  canvasRef,
  layout,
  images,
  backgroundColor,
  selectedCellId,
  hoveredCellId,
  isDragging,
  nearestGaps,
  dpi,
  scaleReady,
}: UseCanvasRendererOptions) {
  // Stable serialization key for highlight state
  const highlightKey = `${selectedCellId}|${hoveredCellId}|${isDragging}`;

  useEffect(() => {
    if (layout.canvasWidth === 0 || layout.canvasHeight === 0) return;
    // Wait until the canvas DOM element is actually mounted (scaleReady ensures this)
    if (!scaleReady) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clamp canvas size to prevent OOM crash
    const { w: canvasW, h: canvasH, scale } = clampCanvasSize(layout.canvasWidth, layout.canvasHeight);

    canvas.width = canvasW;
    canvas.height = canvasH;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (backgroundColor) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Apply scaling so layout coordinates still work correctly
    if (scale < 1) {
      ctx.scale(scale, scale);
    }

    let cancelled = false;

    const imageMap = new Map(images.map(img => [img.id, img]));

    (async () => {
      // Draw each layout cell
      for (const cell of layout.cells) {
        if (cancelled) return;
        const imgData = imageMap.get(cell.imageId);
        if (!imgData) continue;
        try {
          const img = await loadImage(imgData.objectUrl);
          if (cancelled) return;
          const { trimX, trimY, trimW, trimH } = getSrcCropRect(cell);
          drawRotatedImage(
            ctx, img,
            cell.x, cell.y, cell.drawWidth, cell.drawHeight,
            trimX, trimY, trimW, trimH,
            imgData.rotation, cell.rotated
          );
        } catch (err) {
          console.error('[canvas] render failed for cell:', cell.cellId, err);
          ctx.fillStyle = '#ff4444';
          ctx.fillRect(cell.x, cell.y, cell.drawWidth, cell.drawHeight);
          showToast('error', `图片渲染失败: ${imgData?.name || cell.cellId}`);
        }
      }

      if (cancelled) return;

      // Hover highlight
      if (!isDragging && hoveredCellId && hoveredCellId !== selectedCellId) {
        const hoverCell = layout.cells.find(c => c.cellId === hoveredCellId);
        if (hoverCell) {
          ctx.save();
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
          ctx.lineWidth = Math.max(2, Math.round(layout.canvasWidth / 500));
          ctx.setLineDash([]);
          ctx.strokeRect(hoverCell.x, hoverCell.y, hoverCell.drawWidth, hoverCell.drawHeight);
          ctx.restore();
        }
      }

      // Selection highlight
      if (selectedCellId) {
        const selCell = layout.cells.find(c => c.cellId === selectedCellId);
        if (selCell) {
          ctx.save();
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = Math.max(2, Math.round(layout.canvasWidth / 500));
          ctx.setLineDash([Math.max(4, Math.round(layout.canvasWidth / 300))]);
          ctx.strokeRect(
            selCell.x - 2, selCell.y - 2,
            selCell.drawWidth + 4, selCell.drawHeight + 4
          );
          ctx.restore();
        }
      }

      // Gap rulers
      if (!cancelled) {
        drawGapRulers(ctx, nearestGaps, layout.canvasWidth, dpi);
      }
    })();

    return () => { cancelled = true; };
  }, [canvasRef, layout, images, backgroundColor, highlightKey, nearestGaps, dpi, selectedCellId, hoveredCellId, isDragging, scaleReady]);
}
