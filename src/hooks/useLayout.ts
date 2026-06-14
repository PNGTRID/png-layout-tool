import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { LayoutParams, LayoutResult, UploadedImage } from '../shared/types';
import { DEFAULT_GAP_CM, DEFAULT_CANVAS_WIDTH_CM, DEFAULT_CANVAS_HEIGHT_CM, DEFAULT_DPI } from '../shared/constants';
import { calculateLayout, type LayoutInputImage, type LayoutResultWithWarnings } from '../lib/layout-engine';
import type { LayoutWorkerRequest, LayoutWorkerResponse } from '../workers/layout-worker';
import {
  EMPTY_POSITION_HISTORY,
  beginPositionEdit as beginEdit,
  undoPosition as undoEdit,
  redoPosition as redoEdit,
  type PositionHistory,
} from '../lib/position-history';

const DEFAULT_PARAMS: LayoutParams = {
  gap: DEFAULT_GAP_CM,
  canvasWidthCm: DEFAULT_CANVAS_WIDTH_CM,
  canvasHeightCm: DEFAULT_CANVAS_HEIGHT_CM,
  dpi: DEFAULT_DPI,
  autoRotate: false,
  backgroundColor: null,
  showCropMarks: false,
  bleedCm: 0,
};

/** Debounce delay (ms) for expensive layout recalculations */
const LAYOUT_DEBOUNCE_MS = 200;

/** 空排版结果 —— 初始 state 与 Worker 不可用时的降级占位 */
const EMPTY_RESULT: LayoutResultWithWarnings = {
  canvasWidth: 0,
  canvasHeight: 0,
  cells: [],
  warnings: [],
};

/**
 * 将 UploadedImage 压缩为排版引擎实际读取的纯字段（LayoutInputImage）。
 * postMessage 走结构化克隆，剔除 dataUrl（大 base64）与 objectUrl（主线程专属 URL），
 * 避免跨线程克隆无意义的大体积数据。
 */
function serializeForLayout(images: UploadedImage[]): LayoutInputImage[] {
  return images.map(({ id, width, height, trimX, trimY, trimWidth, trimHeight, quantity, rotation, targetWidthCm, targetHeightCm }) => ({
    id,
    width,
    height,
    trimX,
    trimY,
    trimWidth,
    trimHeight,
    quantity,
    rotation,
    targetWidthCm,
    targetHeightCm,
  }));
}

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

  // ─── Worker-backed async layout ────────────────────────────────────
  // calculateLayout（6 策略 × N 候选宽度 + compactCells 压缩 + verifyNoOverlap 兜底）
  // 在大集合下耗时，移入 Worker 避免阻塞主线程拖动/动画。computedResult 为算法原始
  // 结果，positionOverrides 作为第二层 useMemo 叠加其上。等待期间保留上一次结果，
  // 故拖动滑块时画布/Toast 动画不冻结。
  const [computedResult, setComputedResult] = useState<LayoutResultWithWarnings>(EMPTY_RESULT);
  const [isComputing, setIsComputing] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const reqIdRef = useRef(0);

  /**
   * 懒创建排版 Worker。onmessage 在创建时绑定一次 —— 闭包捕获的 setState 与
   * reqIdRef 均为稳定引用，不会因组件重渲染而过期。reqId 守卫丢弃拖动滑块
   * 期间产生的过期响应（Worker 串行处理，但守卫可防御任何乱序）。
   */
  const getWorker = useCallback((): Worker | null => {
    if (workerRef.current === null && typeof Worker !== 'undefined') {
      const worker = new Worker(
        new URL('../workers/layout-worker.ts', import.meta.url),
        { type: 'module' },
      );
      worker.onmessage = (e: MessageEvent<LayoutWorkerResponse>) => {
        const { reqId, result } = e.data;
        if (reqId !== reqIdRef.current) return; // 过期响应，丢弃
        setComputedResult(result);
        setIsComputing(false);
      };
      worker.onerror = () => {
        // Worker 崩溃：解除 loading 锁，让用户能继续操作（下次请求会重建）
        console.error('[layout] worker error');
        setIsComputing(false);
      };
      workerRef.current = worker;
    }
    return workerRef.current;
  }, []);

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

  // Dispatch layout computation to the Worker whenever inputs change.
  // layoutVersion is intentionally a dependency — relayout() bumps it to force
  // recomputation even when images/params are unchanged.
  useEffect(() => {
    const worker = getWorker();
    if (worker === null) {
      // 非 Worker 环境（测试/jsdom）降级为同步计算，避免 Worker 构造异常
      setComputedResult(calculateLayout(images, debouncedParams));
      return;
    }
    const reqId = ++reqIdRef.current;
    setIsComputing(true);
    const request: LayoutWorkerRequest = {
      reqId,
      images: serializeForLayout(images),
      params: debouncedParams,
    };
    worker.postMessage(request);
  }, [images, debouncedParams, layoutVersion, getWorker]);

  // Terminate Worker on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

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

  return { params, layout, warnings, isComputing, updateParam, relayout, updatePosition, beginPositionEdit, undoPosition, redoPosition };
}
