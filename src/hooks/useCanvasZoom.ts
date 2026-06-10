/**
 * Canvas zoom hook — manages scale-to-fit and user zoom (Ctrl+scroll).
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { ZOOM_STEP, ZOOM_MIN, ZOOM_MAX, CANVAS_PAD_X, CANVAS_PAD_Y } from '../shared/constants';

export function useCanvasZoom(canvasWidth: number, canvasHeight: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [userZoom, setUserZoom] = useState(1);
  const [scaleReady, setScaleReady] = useState(false);

  // Scale to fit on canvas size change
  useEffect(() => {
    const container = containerRef.current;
    if (!container || canvasWidth === 0 || canvasHeight === 0) {
      setScale(0);
      setScaleReady(false);
      return;
    }
    setUserZoom(1);

    const observer = new ResizeObserver(() => {
      const pw = container.clientWidth - CANVAS_PAD_X;
      const ph = container.clientHeight - CANVAS_PAD_Y;
      if (pw <= 0 || ph <= 0) return;
      const sx = pw / canvasWidth;
      const sy = ph / canvasHeight;
      setScale(Math.min(sx, sy, 1));
      setScaleReady(true);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [canvasWidth, canvasHeight]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setUserZoom(prev => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev + delta)));
    }
  }, []);

  const effectiveScale = scale * userZoom;

  return { containerRef, scale: effectiveScale, scaleReady, handleWheel };
}
