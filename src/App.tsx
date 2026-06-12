import { useCallback, useReducer, useRef, useState, useEffect } from 'react';
import { Settings, ImageIcon } from 'lucide-react';
import { useImages } from './hooks/useImages';
import { useLayout } from './hooks/useLayout';
import { useDragDrop } from './hooks/useDragDrop';
import { renderToCanvas, exportPNG } from './lib/export-png';
import { exportPSD } from './lib/export-psd';
import type { ExportProgressCallback } from './lib/export-psd';
import { clearImageCache, evictImage } from './lib/image-cache';
import { Toolbar } from './components/Toolbar';
import { ControlPanel } from './components/ControlPanel';
import { UploadArea } from './components/UploadArea';
import { ImageList } from './components/ImageList';
import { LayoutCanvas } from './components/LayoutCanvas';
import { ToastContainer, showToast } from './components/Toast';
import { UpdateDialog } from './components/UpdateDialog';
import { useAppUpdater } from './hooks/useAppUpdater';
import { platformAPI } from './shared/ipc';

/** Map technical error messages to user-friendly Chinese text */
function friendlyErrorMessage(err: unknown, context: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('2d context')) return `${context}失败：渲染引擎初始化错误，请重启应用`;
  if (msg.includes('PNG blob')) return `${context}失败：图像压缩错误`;
  if (msg.includes('write') || msg.includes('保存')) return `${context}失败：文件写入错误，请检查磁盘空间`;
  if (msg.includes('cancelled') || msg.includes('取消')) return `${context}已取消`;
  return `${context}失败：${msg}`;
}

function App() {
  // Unified action log for coordinating undo/redo across two independent history stacks
  type ActionType = 'image' | 'position';
  const actionLogRef = useRef<ActionType[]>([]);
  const redoLogRef = useRef<ActionType[]>([]);
  const [actionSeq, setActionSeq] = useReducer((x: number) => x + 1, 0);

  // Stable callback: pushes an image action to the unified action log. Empty deps
  // so useImages' action callbacks stay referentially stable across renders.
  const recordImageAction = useCallback(() => {
    actionLogRef.current.push('image');
    redoLogRef.current = [];
    setActionSeq();
  }, []);

  // Images hook — onAction pushes to unified action log
  const { images, isProcessing, addFiles, removeImage, clearAll, updateQuantity, batchUpdateQuantity, updateTargetSize, rotateImage, totalQuantity, undoRedo } = useImages(recordImageAction);
  const { params, layout, warnings, updateParam, relayout, updatePosition, beginPositionEdit, undoPosition, redoPosition } = useLayout(images);
  const { isDragging } = useDragDrop({ onFilesDropped: addFiles });
  const updater = useAppUpdater();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);

  // Unified undo/redo — dispatches to the correct history stack based on action log
  const canUndo = actionLogRef.current.length > 0;
  const canRedo = redoLogRef.current.length > 0;
  // actionSeq is used to trigger re-renders when action log changes
  void actionSeq;

  const handleUndo = useCallback(() => {
    const last = actionLogRef.current.pop();
    if (!last) return;
    if (last === 'image') {
      undoRedo.undo();
    } else {
      undoPosition();
    }
    redoLogRef.current.push(last);
    setActionSeq();
  }, [undoRedo, undoPosition]);

  const handleRedo = useCallback(() => {
    const next = redoLogRef.current.pop();
    if (!next) return;
    if (next === 'image') {
      undoRedo.redo();
    } else {
      redoPosition();
    }
    actionLogRef.current.push(next);
    setActionSeq();
  }, [undoRedo, redoPosition]);

  // Drag started — capture pre-edit snapshot into the position undo history.
  // (The action log entry is added on drag end so only committed drags are undoable.)
  const handleDragStart = useCallback(() => {
    beginPositionEdit();
  }, [beginPositionEdit]);

  // Drag ended with movement — record the position action. (x, y) were already
  // applied via updatePosition during the drag, so nothing is written here.
  const handleDragEnd = useCallback(() => {
    actionLogRef.current.push('position');
    redoLogRef.current = [];
    setActionSeq();
  }, []);

  // Wrap relayout: resetting position overrides/history must also purge stale
  // 'position' entries from the unified action log, otherwise undo would pop a
  // 'position' whose history is already empty (no-op + desynced redo log).
  // Image entries stay — their history lives independently in useUndoRedo.
  const handleRelayout = useCallback(() => {
    relayout();
    actionLogRef.current = actionLogRef.current.filter(a => a !== 'position');
    redoLogRef.current = redoLogRef.current.filter(a => a !== 'position');
    setActionSeq();
  }, [relayout]);

  // Show layout warnings as toasts
  useEffect(() => {
    for (const w of warnings) {
      showToast(w.type === 'overflow' ? 'warning' : 'info', w.message);
    }
  }, [warnings]);

  // Check for updates on startup (delay 3s to avoid blocking initial render)
  useEffect(() => {
    const timer = setTimeout(() => {
      updater.checkForUpdate();
    }, 3000);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Undo/Redo keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        if (canRedo) handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, handleUndo, handleRedo]);

  // Shared progress callback for exports
  const onExportProgress: ExportProgressCallback = useCallback((phase, current, total) => {
    if (phase === 'done') {
      setExportProgress(null);
    } else {
      const phaseLabel: Record<string, string> = {
        render: '渲染图层',
        compress: '压缩图像',
        write: '生成文件',
        save: '保存文件',
      };
      const label = phaseLabel[phase] || phase;
      setExportProgress(`${label} ${current}/${total}`);
    }
  }, []);

  const handleExportPNG = useCallback(async () => {
    if (images.length === 0 || layout.cells.length === 0) return;
    setIsExporting(true);
    const t0 = performance.now();
    try {
      const canvas = canvasRef.current;
      if (!canvas) {
        showToast('error', '导出失败：画布未就绪，请重试');
        return;
      }

      await renderToCanvas(canvas, layout, images, params.backgroundColor, onExportProgress, params.showCropMarks, params.dpi);

      const result = await platformAPI.showSaveDialog({
        defaultPath: 'layout.png',
        filters: [{ name: 'PNG 图片', extensions: ['png'] }],
      });

      if (!result) {
        return;
      }

      await exportPNG(canvas, result, params.dpi, onExportProgress);
      const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
      showToast('success', `PNG 已导出: ${result.split('/').pop() || result.split('\\').pop()} (${elapsed}s)`);
    } catch (err) {
      console.error('[export] PNG failed:', err);
      showToast('error', friendlyErrorMessage(err, '导出 PNG'));
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  }, [images, layout, params.backgroundColor, params.dpi, params.showCropMarks, onExportProgress]);

  const handleExportPSD = useCallback(async () => {
    if (images.length === 0 || layout.cells.length === 0) return;
    setIsExporting(true);
    const t0 = performance.now();
    try {
      const result = await platformAPI.showSaveDialog({
        defaultPath: 'layout.psd',
        filters: [{ name: 'Photoshop 文件', extensions: ['psd'] }],
      });

      if (!result) {
        return;
      }

      await exportPSD(layout, images, params, result, onExportProgress);
      const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
      showToast('success', `PSD 已导出: ${result.split('/').pop() || result.split('\\').pop()} (${elapsed}s)`);
    } catch (err) {
      console.error('[export] PSD failed:', err);
      showToast('error', friendlyErrorMessage(err, '导出 PSD'));
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  }, [images, layout, params, onExportProgress]);

  // Wrap removeImage to also evict from image cache
  const handleRemoveImage = useCallback((id: string) => {
    const img = images.find(i => i.id === id);
    if (img) {
      evictImage(img.objectUrl);
      URL.revokeObjectURL(img.objectUrl);
    }
    removeImage(id);
  }, [images, removeImage]);

  // Wrap clearAll to also clear caches
  const handleClearAll = useCallback(() => {
    // clearAll is a stable callback; image-cache clearing happens inside useImages
    clearImageCache();
    clearAll();
  }, [clearAll]);

  const hasImages = images.length > 0;

  return (
    <div className="flex h-screen w-screen flex-col bg-lt-bg text-lt-text select-none overflow-hidden">
      {/* Toast notifications */}
      <ToastContainer />

      {/* Update dialog */}
      {updater.updateAvailable && updater.updateInfo && (
        <UpdateDialog
          version={updater.updateInfo.version}
          notes={updater.updateInfo.body}
          downloading={updater.downloading}
          downloadProgress={updater.downloadProgress}
          installing={updater.installing}
          error={updater.error}
          onConfirm={updater.downloadAndInstall}
          onDismiss={updater.dismissUpdate}
        />
      )}

      {/* Full-screen drag overlay — visible when files are dragged over the window */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-accent-500/10 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-accent-400 bg-white/90 px-12 py-8 shadow-xl">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent-500">
              <ImageIcon className="h-7 w-7 text-white" />
            </div>
            <p className="text-base font-medium text-accent-600">松开以添加图片</p>
            <p className="text-xs text-lt-muted">PNG / PSD · 支持文件夹</p>
          </div>
        </div>
      )}

      {/* Top Toolbar */}
      <Toolbar
        onExportPNG={handleExportPNG}
        onExportPSD={handleExportPSD}
        onClear={handleClearAll}
        onRelayout={handleRelayout}
        hasImages={hasImages && !isExporting}
        checkingUpdate={updater.checking}
        onCheckUpdate={async () => {
          const found = await updater.checkForUpdate();
          if (!found && !updater.error) {
            showToast('info', '当前已是最新版本');
          }
        }}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      {/* Main Content — three columns */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left column — upload + settings */}
        <aside className="flex w-[280px] shrink-0 flex-col border-r border-lt-border bg-white">
          {/* Upload area */}
          <div className="border-b border-lt-border p-4">
            <UploadArea
              onFilesSelected={addFiles}
              isDragging={isDragging}
            />
          </div>

          {/* Settings title */}
          <div className="border-b border-lt-border px-4 py-2.5">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold text-lt-sub">
              <Settings className="h-3.5 w-3.5 text-accent-500" />
              排版设置
            </h2>
          </div>

          {/* Settings content */}
          <div className="flex-1 overflow-y-auto p-4">
            <ControlPanel
              params={params}
              onUpdateParam={updateParam}
              imageCount={totalQuantity}
            />
          </div>
        </aside>

        {/* Center column — canvas preview */}
        <main className="relative flex flex-1 min-w-0 bg-lt-bg overflow-hidden">
          <div className="flex h-full w-full flex-col p-4">
            {hasImages ? (
              <LayoutCanvas
                layout={layout}
                images={images}
                backgroundColor={params.backgroundColor}
                params={params}
                canvasRef={canvasRef}
                onRotate={rotateImage}
                onUpdatePosition={updatePosition}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-lt-muted">
                <div className="checkerboard flex h-20 w-20 items-center justify-center rounded-xl border border-lt-border shadow-sm">
                  <span className="text-2xl text-lt-dim">PNG</span>
                </div>
                <p className="text-sm">上传 PNG / PSD 图片开始排版</p>
                <p className="text-xs text-lt-dim">支持拖拽文件夹、多选文件、Ctrl+滚轮缩放预览</p>
              </div>
            )}
          </div>
        </main>

        {/* Right column — image list */}
        <aside className="flex w-[320px] shrink-0 flex-col border-l border-lt-border bg-white">
          {/* Panel title */}
          <div className="flex items-center justify-between border-b border-lt-border px-4 py-3">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold text-lt-sub">
              <ImageIcon className="h-3.5 w-3.5 text-accent-500" />
              图片列表
            </h2>
            {totalQuantity > 0 && (
              <span className="rounded-full bg-accent-500 px-2 py-0.5 text-[10px] font-medium text-white leading-none">
                {totalQuantity}
              </span>
            )}
          </div>

          {/* Image list content */}
          <div className="flex-1 overflow-y-auto p-4">
            <ImageList
              images={images}
              onRemove={handleRemoveImage}
              onUpdateQuantity={updateQuantity}
              onBatchUpdateQuantity={batchUpdateQuantity}
              onUpdateTargetSize={updateTargetSize}
              onRotate={rotateImage}
              dpi={params.dpi}
            />
          </div>

          {/* Processing indicator */}
          {isProcessing && (
            <div className="border-t border-lt-border bg-white px-4 py-2 text-center">
              <span className="text-xs text-accent-500 animate-pulse">
                正在处理图片...
              </span>
            </div>
          )}

          {/* Exporting indicator with progress */}
          {isExporting && (
            <div className="border-t border-lt-border bg-accent-50 px-4 py-2 text-center">
              <span className="text-xs text-accent-600 animate-pulse">
                {exportProgress || '正在导出...'}
              </span>
            </div>
          )}
        </aside>
      </div>

      {/* Hidden export canvas */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

export default App;
