import { useCallback, useRef, useState } from 'react';
import { Settings, ImageIcon, Upload } from 'lucide-react';
import { useImages } from './hooks/useImages';
import { useLayout } from './hooks/useLayout';
import { useDragDrop } from './hooks/useDragDrop';
import { renderToCanvas, exportPNG } from './lib/export-png';
import { exportPSD } from './lib/export-psd';
import { Toolbar } from './components/Toolbar';
import { ControlPanel } from './components/ControlPanel';
import { UploadArea } from './components/UploadArea';
import { ImageList } from './components/ImageList';
import { LayoutCanvas } from './components/LayoutCanvas';
import { platformAPI } from './shared/ipc';
type SidebarTab = 'settings' | 'images';

function App() {
  const { images, isProcessing, addFiles, removeImage, reorderImages, clearAll, updateQuantity, totalQuantity } = useImages();
  const { params, layout, updateParam, relayout } = useLayout(images);
  const { isDragging } = useDragDrop({ onFilesDropped: addFiles });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>('images');

  const handleExportPNG = useCallback(async () => {
    if (images.length === 0) return;
    setIsExporting(true);
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;

      await renderToCanvas(canvas, layout, images, params.backgroundColor);

      let filePath: string;
      const result = await platformAPI.showSaveDialog({
        defaultPath: 'layout.png',
        filters: [{ name: 'PNG 图片', extensions: ['png'] }],
      });
      if (result) {
        filePath = result;
      } else {
        filePath = 'layout.png';
      }

      await exportPNG(canvas, filePath);
    } catch (err) {
      console.error('Export PNG failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [images, layout, params.backgroundColor]);

  const handleExportPSD = useCallback(async () => {
    if (images.length === 0) return;
    setIsExporting(true);
    try {
      let filePath: string;
      const result = await platformAPI.showSaveDialog({
        defaultPath: 'layout.psd',
        filters: [{ name: 'Photoshop 文件', extensions: ['psd'] }],
      });
      if (result) {
        filePath = result;
      } else {
        filePath = 'layout.psd';
      }

      await exportPSD(layout, images, params, filePath);
    } catch (err) {
      console.error('Export PSD failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [images, layout, params]);

  const hasImages = images.length > 0;

  return (
    <div className="flex h-screen w-screen flex-col bg-lt-bg text-lt-text select-none overflow-hidden">
      {/* Top Toolbar */}
      <Toolbar
        onExportPNG={handleExportPNG}
        onExportPSD={handleExportPSD}
        onClear={clearAll}
        onRelayout={relayout}
        hasImages={hasImages && !isExporting}
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar with tabs */}
        <aside className="flex w-[300px] shrink-0 flex-col border-r border-lt-border bg-white">
          {/* Tab header */}
          <div className="flex border-b border-lt-border">
            <button
              onClick={() => setActiveTab('images')}
              className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-all
                ${activeTab === 'images'
                  ? 'border-b-2 border-accent-500 text-accent-600 bg-accent-50/50'
                  : 'text-lt-muted hover:text-lt-sub hover:bg-lt-hover'
                }`}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              图片
              {totalQuantity > 0 && (
                <span className="rounded-full bg-accent-500 px-1.5 py-0.5 text-[10px] text-white leading-none">
                  {totalQuantity}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-all
                ${activeTab === 'settings'
                  ? 'border-b-2 border-accent-500 text-accent-600 bg-accent-50/50'
                  : 'text-lt-muted hover:text-lt-sub hover:bg-lt-hover'
                }`}
            >
              <Settings className="h-3.5 w-3.5" />
              设置
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'images' ? (
              <div className="p-4 space-y-4">
                {/* Upload Area */}
                <UploadArea
                  onFilesSelected={addFiles}
                  isDragging={isDragging}
                />

                {/* Image List */}
                <ImageList
                  images={images}
                  onRemove={removeImage}
                  onUpdateQuantity={updateQuantity}
                  totalQuantity={totalQuantity}
                />
              </div>
            ) : (
              <div className="p-4">
                <ControlPanel
                  params={params}
                  onUpdateParam={updateParam}
                  imageCount={totalQuantity}
                />
              </div>
            )}
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

        {/* Right Canvas Area */}
        <main className="relative flex flex-1 bg-lt-bg">
          <div className="flex h-full w-full flex-col p-4">
            {hasImages ? (
              <LayoutCanvas
                layout={layout}
                images={images}
                backgroundColor={params.backgroundColor}
                params={params}
                canvasRef={canvasRef}
                onReorder={reorderImages}
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
      </div>

      {/* Hidden export canvas */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

export default App;
