import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
// layoutVersionRef is no longer needed — using useState instead
import type { LayoutParams, LayoutResult, UploadedImage } from '../shared/types';
import { calculateLayout, LayoutResultWithWarnings } from '../lib/layout-engine';

const DEFAULT_PARAMS: LayoutParams = {
  gap: 2,              // cm
  canvasWidthCm: 57,    // cm
  canvasHeightCm: 0,    // 0 = auto
  dpi: 300,
  autoRotate: false,
  backgroundColor: null,
  alignMode: 'center',
  showCropMarks: false,
  bleedCm: 0,
};

/** Debounce delay (ms) for expensive layout recalculations */
const LAYOUT_DEBOUNCE_MS = 200;

export function useLayout(images: UploadedImage[]) {
  const [params, setParams] = useState<LayoutParams>(DEFAULT_PARAMS);

  // Debounced params — layout engine reads these instead of raw params
  const [debouncedParams, setDebouncedParams] = useState<LayoutParams>(DEFAULT_PARAMS);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Per-cell position overrides, keyed by unique cellId
  const [positionOverrides, setPositionOverrides] = useState<Record<string, { x: number; y: number }>>({});

  // updateParam with debounce for expensive numeric params
  const updateParam = useCallback(<K extends keyof LayoutParams>(
    key: K,
    value: LayoutParams[K]
  ) => {
    // Validate backgroundColor format (CSS hex color or null)
    if (key === 'backgroundColor' && value !== null) {
      const str = value as string;
      if (!/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(str)) {
        console.warn('[layout] Invalid backgroundColor rejected:', str);
        return;
      }
    }

    setParams(prev => ({ ...prev, [key]: value }));

    // Determine if this param needs debouncing (numeric params that trigger full relayout)
    const needsDebounce = key === 'gap' || key === 'dpi' || key === 'canvasWidthCm' || key === 'canvasHeightCm';

    if (needsDebounce) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        setDebouncedParams(prev => ({ ...prev, [key]: value }));
      }, LAYOUT_DEBOUNCE_MS);
    } else {
      // Boolean/enum/color params apply immediately
      setDebouncedParams(prev => ({ ...prev, [key]: value }));
    }
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Version counter to force relayout on demand
  const [layoutVersion, setLayoutVersion] = useState(0);

  // Algorithm-computed layout
  const computedResult: LayoutResultWithWarnings = useMemo(() => {
    return calculateLayout(images, debouncedParams);
  }, [images, debouncedParams, layoutVersion]);

  // Apply manual position overrides to layout
  const layout: LayoutResult = useMemo(() => {
    const keys = Object.keys(positionOverrides);
    if (keys.length === 0) return computedResult;
    return {
      ...computedResult,
      cells: computedResult.cells.map(cell => {
        const o = positionOverrides[cell.cellId];
        return o ? { ...cell, x: o.x, y: o.y } : cell;
      }),
    };
  }, [computedResult, positionOverrides]);

  const warnings = computedResult.warnings;

  const relayout = useCallback(() => {
    // Sync debounced params immediately on explicit relayout
    setDebouncedParams(params);
    setLayoutVersion(v => v + 1);
    setPositionOverrides({}); // Clear manual positions on relayout
  }, [params]);

  const updatePosition = useCallback((cellId: string, x: number, y: number) => {
    setPositionOverrides(prev => ({ ...prev, [cellId]: { x, y } }));
  }, []);

  return { params, layout, warnings, updateParam, relayout, updatePosition };
}
