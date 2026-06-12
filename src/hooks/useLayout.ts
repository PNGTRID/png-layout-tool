import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
// layoutVersionRef is no longer needed — using useState instead
import type { LayoutParams, LayoutResult, UploadedImage } from '../shared/types';
import { calculateLayout, LayoutResultWithWarnings } from '../lib/layout-engine';
import {
  EMPTY_POSITION_HISTORY,
  beginPositionEdit as beginEdit,
  undoPosition as undoEdit,
  redoPosition as redoEdit,
  type PositionHistory,
} from '../lib/position-history';

const DEFAULT_PARAMS: LayoutParams = {
  gap: 2,              // cm
  canvasWidthCm: 57,    // cm
  canvasHeightCm: 0,    // 0 = auto
  dpi: 300,
  autoRotate: false,
  backgroundColor: null,
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

  // Manual undo/redo history for position overrides (separate from useUndoRedo
  // to avoid recording intermediate drag states). Transition rules live in the
  // pure position-history module; this ref only holds the immutable snapshots so
  // high-frequency drag updates don't trigger history-related re-renders.
  const positionHistoryRef = useRef<PositionHistory>(EMPTY_POSITION_HISTORY);
  const overridesRef = useRef(positionOverrides);
  overridesRef.current = positionOverrides;

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
  // layoutVersion intentionally listed: relayout() bumps it to force recomputation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setPositionOverrides({});
    positionHistoryRef.current = EMPTY_POSITION_HISTORY;
  }, [params]);

  /**
   * Begin a position edit — called once when a drag actually starts (first move
   * past the dead zone), BEFORE updatePosition has mutated the overrides.
   * Captures the pre-edit snapshot so undo can restore it. See position-history.
   */
  const beginPositionEdit = useCallback(() => {
    positionHistoryRef.current = beginEdit(positionHistoryRef.current, { ...overridesRef.current });
  }, []);

  /** Update position during drag — real-time feedback, does NOT affect undo history */
  const updatePosition = useCallback((cellId: string, x: number, y: number) => {
    setPositionOverrides(prev => ({ ...prev, [cellId]: { x, y } }));
  }, []);

  /** Undo last position change — returns false if no history */
  const undoPosition = useCallback((): boolean => {
    const { history, restored } = undoEdit(positionHistoryRef.current, { ...overridesRef.current });
    if (!restored) return false;
    positionHistoryRef.current = history;
    setPositionOverrides(restored);
    return true;
  }, []);

  /** Redo last undone position change — returns false if no future */
  const redoPosition = useCallback((): boolean => {
    const { history, restored } = redoEdit(positionHistoryRef.current, { ...overridesRef.current });
    if (!restored) return false;
    positionHistoryRef.current = history;
    setPositionOverrides(restored);
    return true;
  }, []);

  return { params, layout, warnings, updateParam, relayout, updatePosition, beginPositionEdit, undoPosition, redoPosition };
}
