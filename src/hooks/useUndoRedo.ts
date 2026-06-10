/**
 * Generic undo/redo hook using an immutable state history stack.
 *
 * Usage:
 * ```
 * const [images, setImages, undoRedo] = useUndoRedo<UploadedImage[]>([]);
 * // setImages works like normal setState — each call snapshots previous state
 * // undoRedo.undo() / undoRedo.redo() restore from history
 * ```
 */

import { useState, useCallback } from 'react';

/** Maximum number of history entries to keep in memory */
const MAX_HISTORY = 50;

export interface UndoRedoActions {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export function useUndoRedo<T>(initialState: T): [T, (value: T | ((prev: T) => T)) => void, UndoRedoActions] {
  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initialState,
    future: [],
  });

  const setState = useCallback((value: T | ((prev: T) => T)) => {
    setHistory(prev => {
      const nextPresent = value instanceof Function ? value(prev.present) : value;

      const newPast = [...prev.past, prev.present];
      if (newPast.length > MAX_HISTORY) newPast.shift();

      return {
        past: newPast,
        present: nextPresent,
        future: [], // clear redo on new action
      };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory(prev => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      const newPast = prev.past.slice(0, -1);
      return {
        past: newPast,
        present: previous,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory(prev => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      const newFuture = prev.future.slice(1);
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: newFuture,
      };
    });
  }, []);

  return [
    history.present,
    setState,
    { undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0 },
  ];
}
