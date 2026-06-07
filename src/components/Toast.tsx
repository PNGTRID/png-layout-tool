import { useState, useEffect, useCallback } from 'react';
import { TOAST_AUTO_DISMISS_MS, TOAST_MAX_COUNT } from '../shared/constants';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  text: string;
}

let toastIdCounter = 0;
let addToastExternal: ((toast: ToastMessage) => void) | null = null;

/** Reset internal state — call in test beforeEach to ensure isolation */
export function resetToastState(): void {
  toastIdCounter = 0;
  addToastExternal = null;
}

/** Imperative API: show a toast from anywhere (including non-React code) */
export function showToast(type: ToastMessage['type'], text: string): void {
  if (addToastExternal) {
    addToastExternal({ id: `toast-${toastIdCounter++}`, type, text });
  } else {
    // ToastContainer not mounted yet — log as fallback so message is not lost
    console.warn('[toast]', type, text);
  }
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((toast: ToastMessage) => {
    setToasts(prev => {
      // Deduplicate: skip if same type + text already visible
      if (prev.some(t => t.type === toast.type && t.text === toast.text)) return prev;
      // Enforce max count (drop oldest)
      const next = [...prev, toast];
      if (next.length > TOAST_MAX_COUNT) next.splice(0, next.length - TOAST_MAX_COUNT);
      return next;
    });
    // Auto-dismiss
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toast.id));
    }, TOAST_AUTO_DISMISS_MS);
  }, []);

  useEffect(() => {
    addToastExternal = addToast;
    return () => { addToastExternal = null; };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-medium shadow-lg border transition-all animate-in slide-in-from-right ${
            toast.type === 'error'   ? 'bg-red-50 text-red-700 border-red-200' :
            toast.type === 'warning' ? 'bg-amber-50 text-amber-700 border-amber-200' :
            toast.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' :
                                       'bg-blue-50 text-blue-700 border-blue-200'
          }`}
        >
          <span className="text-base">
            {toast.type === 'error'   ? '✕' :
             toast.type === 'warning' ? '⚠' :
             toast.type === 'success' ? '✓' :
                                        'ℹ'}
          </span>
          <span>{toast.text}</span>
        </div>
      ))}
    </div>
  );
}
