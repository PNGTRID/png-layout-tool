import { useCallback, useReducer, useRef, useState, useEffect } from 'react';
import { Settings, ImageIcon, Loader2 } from 'lucide-react';
import { useImages } from './hooks/useImages';
import { useLayout } from './hooks/useLayout';
import { useDragDrop } from './hooks/useDragDrop';
import type { ExportProgressCallback } from './lib/export-psd';
import { exportSegmented, computeSegmentStartYs, needsVerticalSegmenting } from './lib/export-segmented';
import { exportStreamed } from './lib/export-streamed';
import { clearImageCache } from './lib/image-cache';
import { parseQuantityFromName } from './lib/quantity-parser';
import { Toolbar } from './components/Toolbar';
import { ControlPanel } from './components/ControlPanel';
import { UploadArea } from './components/UploadArea';
import { ImageList } from './components/ImageList';
import { LayoutCanvas } from './components/LayoutCanvas';
import { ToastContainer, showToast } from './components/Toast';
import { ExportProgressOverlay, setExportProgress, setExportCancelHandler, type ExportFormat } from './components/ExportProgressOverlay';
import { UpdateDialog } from './components/UpdateDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { useAppUpdater } from './hooks/useAppUpdater';
import { useAppSettings } from './hooks/useAppSettings';
import { platformAPI } from './shared/ipc';

/** Map technical error messages to user-friendly Chinese text */
function friendlyErrorMessage(err: unknown, context: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('2d context')) return `${context}失败：渲染引擎初始化错误，请重启应用`;
  if (msg.includes('PNG blob')) return `${context}失败：图像压缩错误`;
  if (msg.includes('getImageData') || msg.includes('encode') || msg.includes('TIFF')) return `${context}失败：图像编码错误`;
  if (msg.includes('write') || msg.includes('保存')) return `${context}失败：文件写入错误，请检查磁盘空间`;
  if (msg.includes('cancelled') || msg.includes('取消')) return `${context}已取消`;
  // 兜底：保留原始 message；若有 cause 链，输出到控制台辅助诊断（UI 不展示底层堆栈）
  if (err instanceof Error && err.cause) {
    console.error(`[export] ${context} 原始错误链:`, err.cause);
  }
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

  // App settings (filename-quantity recognition, persisted to localStorage)
  const { settings, updateSettings } = useAppSettings();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const resolveQuantity = useCallback(
    (name: string) => parseQuantityFromName(name, settings.quantityTemplate),
    [settings.quantityTemplate],
  );

  // Images hook — onAction pushes to unified action log; resolveQuantity auto-sets copies from filenames
  const { images, isProcessing, addFiles, removeImage, clearAll, updateQuantity, batchUpdateQuantity, updateTargetSize, rotateImage, totalQuantity, undoRedo } = useImages(recordImageAction, { resolveQuantity });
  const { params, layout, warnings, isComputing, updateParam, relayout, updatePosition, beginPositionEdit, undoPosition, redoPosition } = useLayout(images);
  const { isDragging } = useDragDrop({ onFilesDropped: addFiles });
  const updater = useAppUpdater();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const exportFormatRef = useRef<ExportFormat>('PNG');

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

  // Shared progress callback for exports — pushes to the overlay's imperative
  // store, so per-cell progress updates never trigger an App re-render (which
  // would re-render the whole image list on every cell during large exports).
  const onExportProgress: ExportProgressCallback = useCallback((phase, current, total) => {
    if (phase === 'done') {
      setExportProgress(null);
    } else {
      setExportProgress({ format: exportFormatRef.current, phase, current, total });
    }
  }, []);

  // 分块多文件导出统一编排：先选保存路径，再按段渲染+导出。
  // 超长画布（高度 > EXPORT_SEGMENT_MAX_PX）自动垂直分块，每段一个文件。
  const runExport = useCallback(async (
    format: ExportFormat,
    defaultPath: string,
    filters: { name: string; extensions: string[] }[],
  ) => {
    if (images.length === 0 || layout.cells.length === 0) return;
    exportFormatRef.current = format;
    setIsExporting(true);
    const controller = new AbortController();
    setExportCancelHandler(() => controller.abort());
    let mayHavePartialFile = false; // 流式 / 多段导出取消时磁盘可能残留不完整文件
    setExportProgress({ format, phase: 'prepare', current: 0, total: 0 });
    const t0 = performance.now();
    try {
      const result = await platformAPI.showSaveDialog({ defaultPath, filters });
      if (!result) return;

      const fileName = result.split('/').pop() || result.split('\\').pop();

      // 超长画布 + TIF / PNG(需 CompressionStream) → 流式单文件；其余 → 分块多文件 / 整图单文件
      // PNG 在不支持 CompressionStream 的环境降级到分块多文件
      if (needsVerticalSegmenting(layout.canvasHeight) &&
          (format === 'TIF' || (format === 'PNG' && 'CompressionStream' in window))) {
        showToast('info', '画布过高，采用流式导出为单个文件，请稍候');
        mayHavePartialFile = true;
        await exportStreamed(format, layout, images, params, result, onExportProgress, controller.signal);
        const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
        showToast('success', `${format} 已导出: ${fileName} (${elapsed}s)`);
        return;
      }

      const segCount = computeSegmentStartYs(layout.canvasHeight).length;
      if (segCount > 1) {
        mayHavePartialFile = true;
        showToast('info', `画布过高，将拆分为 ${segCount} 个文件依次导出`);
      }
      const { segmentCount, outputDir } = await exportSegmented(format, layout, images, params, result, onExportProgress, controller.signal);
      const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
      if (segmentCount > 1) {
        showToast('success', `${format} 已导出 ${segmentCount} 个文件到 ${outputDir || '所选目录'} (${elapsed}s)`);
      } else {
        showToast('success', `${format} 已导出: ${fileName} (${elapsed}s)`);
      }
    } catch (err) {
      if (controller.signal.aborted) {
        // 用户取消：流式 / 多段已写入部分文件（platformAPI 无删除能力，需手动清理）
        showToast('info', mayHavePartialFile
          ? '导出已取消，已写入的文件可能不完整，请手动检查并删除'
          : '导出已取消');
      } else {
        console.error(`[export] ${format} failed:`, err);
        showToast('error', friendlyErrorMessage(err, `导出 ${format}`));
      }
    } finally {
      setExportCancelHandler(null);
      setIsExporting(false);
      setExportProgress(null);
    }
  }, [images, layout, params, onExportProgress]);

  const handleExportPNG = useCallback(
    () => runExport('PNG', 'layout.png', [{ name: 'PNG 图片', extensions: ['png'] }]),
    [runExport],
  );

  const handleExportPSD = useCallback(
    () => runExport('PSD', 'layout.psd', [{ name: 'Photoshop 文件', extensions: ['psd'] }]),
    [runExport],
  );

  const handleExportTIF = useCallback(
    () => runExport('TIF', 'layout.tif', [{ name: 'TIFF 图片', extensions: ['tif', 'tiff'] }]),
    [runExport],
  );

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

      {/* Settings dialog (filename-quantity recognition, etc.) */}
      {settingsVisible && (
        <SettingsDialog
          initial={settings}
          onSave={(next) => {
            updateSettings(() => next);
            setSettingsVisible(false);
            showToast('info', '设置已保存');
          }}
          onClose={() => setSettingsVisible(false)}
        />
      )}

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
            <p className="text-xs text-lt-muted">PNG / PSD / TIF · 支持文件夹</p>
          </div>
        </div>
      )}

      {/* Export progress overlay — driven by the imperative setExportProgress store */}
      <ExportProgressOverlay />

      {/* Top Toolbar */}
      <Toolbar
        onExportPNG={handleExportPNG}
        onExportPSD={handleExportPSD}
        onExportTIF={handleExportTIF}
        onClear={handleClearAll}
        onRelayout={handleRelayout}
        onOpenSettings={() => setSettingsVisible(true)}
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
          {hasImages && isComputing && (
            <div className="pointer-events-none absolute right-6 top-6 z-10 flex items-center gap-2 rounded-full border border-lt-border bg-white/95 px-3 py-1.5 text-xs font-medium text-lt-text shadow-lg">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-500" />
              排版计算中
            </div>
          )}
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
              onRemove={removeImage}
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

        </aside>
      </div>

      {/* Hidden export canvas */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

export default App;
