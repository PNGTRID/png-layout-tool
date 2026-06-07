import { useEffect, useRef, useMemo } from 'react';
import { LayoutResult, UploadedImage, LayoutParams } from '../shared/types';
import { findNearestGaps, pxToCm } from '../lib/canvas-utils';
import { useCanvasZoom } from '../hooks/useCanvasZoom';
import { useCanvasInteraction } from '../hooks/useCanvasInteraction';
import { useCanvasRenderer } from '../hooks/useCanvasRenderer';
import { RotateCw } from 'lucide-react';

interface LayoutCanvasProps {
  layout: LayoutResult;
  images: UploadedImage[];
  backgroundColor: string | null;
  params: LayoutParams;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  onReorder?: (newOrder: UploadedImage[]) => void;
  onRotate?: (imageId: string) => void;
  onUpdatePosition?: (cellId: string, x: number, y: number) => void;
}

export function LayoutCanvas({ layout, images, backgroundColor, params, canvasRef, onRotate, onUpdatePosition }: LayoutCanvasProps) {
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Zoom hook
  const { containerRef, scale: effectiveScale, scaleReady, handleWheel } = useCanvasZoom(layout.canvasWidth, layout.canvasHeight);

  // Interaction hook
  const {
    selectedCellId, hoveredCellId, isDragging,
    handleMouseDown, handleMouseMove, handleMouseUp, handleMouseLeave,
    clearSelection,
  } = useCanvasInteraction({
    cells: layout.cells,
    effectiveScale,
    canvasElement: previewCanvasRef.current,
    canvasWidth: layout.canvasWidth,
    canvasHeight: layout.canvasHeight,
    onUpdatePosition,
  });

  // Current active cell (selected or hovered) for gap ruler
  const activeCellId = isDragging ? selectedCellId : (selectedCellId || hoveredCellId);

  // Memoize activeCell by ID to avoid unstable object references
  const activeCell = useMemo(() => {
    if (!activeCellId) return null;
    return layout.cells.find(c => c.cellId === activeCellId) ?? null;
  }, [activeCellId, layout.cells]);

  // Memoize nearestGaps to avoid triggering re-renders on every mousemove
  const nearestGaps = useMemo(() => {
    if (!activeCell) return [];
    return findNearestGaps(activeCell, layout.cells, 3);
  }, [activeCell, layout.cells]);

  // Canvas rendering — extracted into dedicated hook
  useCanvasRenderer({
    canvasRef: previewCanvasRef,
    layout,
    images,
    backgroundColor,
    selectedCellId,
    hoveredCellId,
    isDragging,
    nearestGaps,
    dpi: params.dpi,
  });

  // Sync export canvas dimensions
  useEffect(() => {
    const exportCanvas = canvasRef.current;
    if (!exportCanvas) return;
    if (layout.canvasWidth === 0 || layout.canvasHeight === 0) return;
    exportCanvas.width = layout.canvasWidth;
    exportCanvas.height = layout.canvasHeight;
  }, [canvasRef, layout.canvasWidth, layout.canvasHeight]);

  // Keyboard shortcuts — R rotates the selected cell's source image
  const selectedCellData = selectedCellId ? layout.cells.find(c => c.cellId === selectedCellId) : null;
  const selectedImageIdForRotate = selectedCellData?.imageId ?? null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'r' || e.key === 'R') && selectedImageIdForRotate && onRotate) {
        e.preventDefault();
        onRotate(selectedImageIdForRotate);
      }
      if (e.key === 'Escape') {
        clearSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImageIdForRotate, onRotate, clearSelection]);

  if (layout.canvasWidth === 0 || layout.canvasHeight === 0) {
    return (
      <div className="flex h-full items-center justify-center text-lt-muted">
        <p className="text-sm">上传图片后将在此显示排版预览</p>
      </div>
    );
  }

  if (!scaleReady) {
    return (
      <div ref={containerRef} className="flex h-full w-full bg-lt-bg" />
    );
  }

  const displayWidth = Math.round(layout.canvasWidth * effectiveScale);
  const displayHeight = Math.round(layout.canvasHeight * effectiveScale);

  const activeImage = activeCell ? images.find(i => i.id === activeCell.imageId) : null;
  const selectedCell = selectedCellId ? layout.cells.find(c => c.cellId === selectedCellId) : null;
  const selectedImage = selectedCell ? images.find(i => i.id === selectedCell.imageId) : null;

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
          {Math.round(effectiveScale * 100)}%
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
                cursor: isDragging ? 'grabbing' : hoveredCellId ? 'grab' : 'default',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
            />
          </div>

          {/* Hover/Selected info overlay */}
          {activeCell && activeImage && !isDragging && (
            <div
              className="pointer-events-none absolute flex gap-2 rounded bg-white/90 px-2 py-1 text-[10px] text-lt-text whitespace-nowrap shadow-sm border border-lt-border"
              style={{
                top: Math.max(0, Math.round(activeCell.y * effectiveScale) - 24),
                left: Math.round((activeCell.x + activeCell.drawWidth / 2) * effectiveScale),
                transform: 'translateX(-50%)',
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

          {/* Floating toolbar */}
          {selectedCell && selectedImage && !isDragging && (
            <div
              className="absolute flex items-center gap-0.5 rounded-lg bg-white shadow-lg border border-lt-border p-0.5"
              style={{
                top: Math.max(0, Math.round(selectedCell.y * effectiveScale) - 36),
                left: Math.round((selectedCell.x + selectedCell.drawWidth) * effectiveScale) - 32,
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onRotate) onRotate(selectedCell.imageId);
                }}
                className="flex h-6 w-6 items-center justify-center rounded-md text-lt-sub transition-all hover:bg-accent-50 hover:text-accent-600"
                title="旋转 90° (R)"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom hint */}
      {selectedCellId && !isDragging && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/95 px-4 py-1.5 text-[10px] text-accent-600 shadow-lg border border-lt-border whitespace-nowrap">
          拖拽移动位置 · 按 R 旋转 · Esc 取消 · Ctrl+滚轮缩放
        </div>
      )}
    </div>
  );
}
