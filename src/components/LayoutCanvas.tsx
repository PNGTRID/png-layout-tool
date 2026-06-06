import { useEffect, useRef, useState, useCallback } from 'react';
import { LayoutResult, LayoutCell, UploadedImage, LayoutParams } from '../shared/types';

interface LayoutCanvasProps {
  layout: LayoutResult;
  images: UploadedImage[];
  backgroundColor: string | null;
  params: LayoutParams;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  onReorder?: (newOrder: UploadedImage[]) => void;
}

const imageCache = new Map<string, HTMLImageElement>();

async function loadImageForCanvas(objectUrl: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(objectUrl);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return cached;
  }
  const img = new Image();
  img.src = objectUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load: ${objectUrl}`));
  });
  imageCache.set(objectUrl, img);
  return img;
}

function pxToCm(px: number, dpi: number): string {
  return (px * 2.54 / dpi).toFixed(2);
}

/** Find which cell is under a canvas-space point */
function hitTest(cells: LayoutCell[], x: number, y: number): LayoutCell | null {
  for (let i = cells.length - 1; i >= 0; i--) {
    const c = cells[i];
    if (x >= c.x && x <= c.x + c.drawWidth && y >= c.y && y <= c.y + c.drawHeight) {
      return c;
    }
  }
  return null;
}

export function LayoutCanvas({ layout, images, backgroundColor, params, canvasRef, onReorder }: LayoutCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [hoveredImageId, setHoveredImageId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    sourceImageId: string;
    targetImageId: string | null;
  }>({ isDragging: false, sourceImageId: '', targetImageId: null });

  // Render preview canvas (including selection highlight)
  useEffect(() => {
    if (layout.canvasWidth === 0 || layout.canvasHeight === 0) return;

    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = layout.canvasWidth;
    canvas.height = layout.canvasHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (backgroundColor) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    let cancelled = false;

    (async () => {
      for (const cell of layout.cells) {
        if (cancelled) return;
        const imgData = images.find(i => i.id === cell.imageId);
        if (!imgData) continue;

        try {
          const img = await loadImageForCanvas(imgData.objectUrl);
          if (cancelled) return;

          // Source crop: trimmed content region
          const srcW = cell.srcWidth - cell.srcTrimX * 2;
          const srcH = cell.srcHeight - cell.srcTrimY * 2;

          if (cell.rotated) {
            // Draw rotated 90° CW
            ctx.save();
            ctx.translate(cell.x + cell.drawWidth, cell.y);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(
              img,
              cell.srcTrimX, cell.srcTrimY, srcW, srcH,
              0, 0, cell.drawHeight, cell.drawWidth
            );
            ctx.restore();
          } else {
            ctx.drawImage(
              img,
              cell.srcTrimX, cell.srcTrimY, srcW, srcH,
              cell.x, cell.y, cell.drawWidth, cell.drawHeight
            );
          }
        } catch {
          ctx.fillStyle = '#ff4444';
          ctx.fillRect(cell.x, cell.y, cell.drawWidth, cell.drawHeight);
        }
      }

      if (cancelled) return;

      // Draw hover highlight
      const activeHoverId = dragState.isDragging ? null : hoveredImageId;
      if (activeHoverId && activeHoverId !== selectedImageId) {
        const hoverCell = layout.cells.find(c => c.imageId === activeHoverId);
        if (hoverCell) {
          ctx.save();
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
          ctx.lineWidth = Math.max(2, Math.round(layout.canvasWidth / 500));
          ctx.setLineDash([]);
          ctx.strokeRect(hoverCell.x, hoverCell.y, hoverCell.drawWidth, hoverCell.drawHeight);
          ctx.restore();
        }
      }

      // Draw selection highlight
      if (selectedImageId) {
        const selectedCell = layout.cells.find(c => c.imageId === selectedImageId);
        if (selectedCell) {
          ctx.save();
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = Math.max(2, Math.round(layout.canvasWidth / 500));
          ctx.setLineDash([Math.max(4, Math.round(layout.canvasWidth / 300))]);
          ctx.strokeRect(
            selectedCell.x - 2,
            selectedCell.y - 2,
            selectedCell.drawWidth + 4,
            selectedCell.drawHeight + 4
          );
          ctx.restore();
        }
      }

      // Draw drag target highlight
      if (dragState.isDragging && dragState.targetImageId) {
        const targetCell = layout.cells.find(c => c.imageId === dragState.targetImageId);
        if (targetCell) {
          ctx.save();
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = Math.max(3, Math.round(layout.canvasWidth / 400));
          ctx.setLineDash([]);
          ctx.strokeRect(
            targetCell.x - 3,
            targetCell.y - 3,
            targetCell.drawWidth + 6,
            targetCell.drawHeight + 6
          );
          ctx.restore();
        }
      }
    })();

    return () => { cancelled = true; };
  }, [layout, images, backgroundColor, selectedImageId, hoveredImageId, dragState]);

  // Scale to fit both container width and height (show entire canvas)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || layout.canvasWidth === 0 || layout.canvasHeight === 0) {
      setScale(1);
      return;
    }

    const observer = new ResizeObserver(() => {
      const pw = container.clientWidth - 32;
      const ph = container.clientHeight - 50; // info bar height + padding
      if (pw <= 0 || ph <= 0) return;
      const sx = pw / layout.canvasWidth;
      const sy = ph / layout.canvasHeight;
      setScale(Math.min(sx, sy, 1));
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [layout.canvasWidth, layout.canvasHeight]);

  // Sync export canvas
  useEffect(() => {
    const exportCanvas = canvasRef.current;
    if (!exportCanvas) return;
    if (layout.canvasWidth === 0 || layout.canvasHeight === 0) return;
    exportCanvas.width = layout.canvasWidth;
    exportCanvas.height = layout.canvasHeight;
  }, [canvasRef, layout.canvasWidth, layout.canvasHeight]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale(prev => Math.max(0.1, Math.min(2, prev + delta)));
    }
  }, []);

  const screenToCanvas = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
    };
  }, [scale]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey) return;
    const pos = screenToCanvas(e.clientX, e.clientY);
    if (!pos) return;
    const cell = hitTest(layout.cells, pos.x, pos.y);
    if (cell) {
      setSelectedImageId(cell.imageId);
      setDragState({ isDragging: true, sourceImageId: cell.imageId, targetImageId: null });
    } else {
      setSelectedImageId(null);
    }
  }, [layout.cells, screenToCanvas]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const pos = screenToCanvas(e.clientX, e.clientY);
    if (!pos) return;
    const cell = hitTest(layout.cells, pos.x, pos.y);
    setHoveredImageId(cell ? cell.imageId : null);
    if (!dragState.isDragging) return;
    const targetId = cell && cell.imageId !== dragState.sourceImageId ? cell.imageId : null;
    setDragState(prev => ({ ...prev, targetImageId: targetId }));
  }, [dragState.isDragging, layout.cells, screenToCanvas]);

  const handleMouseUp = useCallback(() => {
    if (dragState.isDragging && dragState.targetImageId && onReorder) {
      const srcIdx = images.findIndex(img => img.id === dragState.sourceImageId);
      const tgtIdx = images.findIndex(img => img.id === dragState.targetImageId);
      if (srcIdx !== -1 && tgtIdx !== -1 && srcIdx !== tgtIdx) {
        const newOrder = [...images];
        const [moved] = newOrder.splice(srcIdx, 1);
        newOrder.splice(tgtIdx, 0, moved);
        onReorder(newOrder);
      }
    }
    setDragState({ isDragging: false, sourceImageId: '', targetImageId: null });
  }, [dragState, images, onReorder]);

  const handleMouseLeave = useCallback(() => {
    setHoveredImageId(null);
    handleMouseUp();
  }, [handleMouseUp]);

  if (layout.canvasWidth === 0 || layout.canvasHeight === 0) {
    return (
      <div className="flex h-full items-center justify-center text-lt-muted">
        <p className="text-sm">上传图片后将在此显示排版预览</p>
      </div>
    );
  }

  const displayWidth = Math.round(layout.canvasWidth * scale);
  const displayHeight = Math.round(layout.canvasHeight * scale);

  const activeImageId = selectedImageId || hoveredImageId;
  const activeCell = activeImageId ? layout.cells.find(c => c.imageId === activeImageId) : null;
  const activeImage = activeImageId ? images.find(i => i.id === activeImageId) : null;

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full flex-col items-center overflow-y-auto overflow-x-hidden bg-lt-bg"
      onWheel={handleWheel}
    >
      {/* Top info bar */}
      <div className="flex w-full items-center justify-between px-4 pt-2 pb-1 flex-shrink-0">
        <span className="text-[10px] text-lt-muted">
          {pxToCm(layout.canvasWidth, params.dpi)} × {pxToCm(layout.canvasHeight, params.dpi)} cm
        </span>
        <span className="text-[10px] text-lt-muted">
          {Math.round(scale * 100)}%
        </span>
      </div>

      {/* Canvas */}
      <div className="flex-shrink-0 px-4 pb-16">
        <div
          className="relative shadow-lg"
          style={{ width: displayWidth, height: displayHeight }}
        >
          <div
            className="checkerboard relative overflow-hidden rounded border border-lt-border"
            style={{ width: displayWidth, height: displayHeight }}
          >
            <canvas
              ref={previewCanvasRef}
              className="block"
              style={{
                width: displayWidth,
                height: displayHeight,
                cursor: dragState.isDragging ? 'grabbing' : hoveredImageId ? 'pointer' : 'default',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
            />
          </div>

          {/* Image size info overlay */}
          {activeCell && activeImage && (
            <div
              className="pointer-events-none absolute left-0 flex gap-2 rounded bg-white/90 px-2 py-1 text-[10px] text-lt-text whitespace-nowrap shadow-sm border border-lt-border"
              style={{
                top: Math.max(0, Math.round(activeCell.y * scale) - 22),
              }}
            >
              <span className="font-medium">{activeImage.name}</span>
              <span className="text-lt-muted">
                {activeImage.trimWidth} × {activeImage.trimHeight} px
              </span>
              <span className="text-accent-600">
                {pxToCm(activeImage.trimWidth, params.dpi)} × {pxToCm(activeImage.trimHeight, params.dpi)} cm
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom hint */}
      {selectedImageId && !dragState.isDragging && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/95 px-4 py-1.5 text-[10px] text-accent-600 shadow-lg border border-lt-border">
          拖拽图片可交换位置 · 点击空白取消选择 · Ctrl+滚轮缩放
        </div>
      )}
    </div>
  );
}
