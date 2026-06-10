/**
 * Canvas interaction hook — manages selection, hover, drag-to-move.
 */

import { useState, useCallback, useRef } from 'react';
import type { LayoutCell } from '../shared/types';
import { hitTest } from '../lib/canvas-utils';

/** Minimum movement (px in canvas space) before mouse-down becomes a drag */
const DRAG_DEAD_ZONE = 3;

interface UseCanvasInteractionOptions {
  cells: LayoutCell[];
  effectiveScale: number;
  canvasElement: HTMLCanvasElement | null;
  canvasWidth: number;
  canvasHeight: number;
  onUpdatePosition?: (cellId: string, x: number, y: number) => void;
}

export function useCanvasInteraction({
  cells,
  effectiveScale,
  canvasElement,
  canvasWidth,
  canvasHeight,
  onUpdatePosition,
}: UseCanvasInteractionOptions) {
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [hoveredCellId, setHoveredCellId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const dragRef = useRef<{
    cellId: string;
    imageId: string;
    startX: number;
    startY: number;
    cellStartX: number;
    cellStartY: number;
    moved: boolean;
  } | null>(null);

  const screenToCanvas = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    if (!canvasElement) return null;
    const rect = canvasElement.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / effectiveScale,
      y: (clientY - rect.top) / effectiveScale,
    };
  }, [canvasElement, effectiveScale]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey) return;
    const pos = screenToCanvas(e.clientX, e.clientY);
    if (!pos) return;
    const cell = hitTest(cells, pos.x, pos.y);
    if (cell) {
      setSelectedCellId(cell.cellId);
      dragRef.current = {
        cellId: cell.cellId,
        imageId: cell.imageId,
        startX: pos.x,
        startY: pos.y,
        cellStartX: cell.x,
        cellStartY: cell.y,
        moved: false,
      };
    } else {
      setSelectedCellId(null);
    }
  }, [cells, screenToCanvas]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const pos = screenToCanvas(e.clientX, e.clientY);
    if (!pos) return;

    const drag = dragRef.current;
    if (drag) {
      const dx = pos.x - drag.startX;
      const dy = pos.y - drag.startY;

      // Dead zone: only start dragging after minimum movement
      if (!drag.moved && Math.sqrt(dx * dx + dy * dy) < DRAG_DEAD_ZONE) return;

      if (!drag.moved) {
        drag.moved = true;
        setIsDragging(true);
      }

      const cell = cells.find(c => c.cellId === drag.cellId);
      const newX = Math.max(0, Math.min(canvasWidth - (cell?.drawWidth ?? 0), drag.cellStartX + dx));
      const newY = Math.max(0, Math.min(canvasHeight - (cell?.drawHeight ?? 0), drag.cellStartY + dy));
      onUpdatePosition?.(drag.cellId, newX, newY);
    } else {
      const cell = hitTest(cells, pos.x, pos.y);
      setHoveredCellId(cell ? cell.cellId : null);
    }
  }, [cells, screenToCanvas, onUpdatePosition]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredCellId(null);
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedCellId(null);
  }, []);

  return {
    selectedCellId,
    hoveredCellId,
    isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    clearSelection,
  };
}
