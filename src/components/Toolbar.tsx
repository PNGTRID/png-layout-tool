import { useState, useEffect, useRef } from 'react';
import { Trash2, Layers, ImagePlus, FileImage, FileType, LayoutGrid, RefreshCw, Undo2, Redo2, Settings, ChevronDown, Check } from 'lucide-react';

type ExportFormatKey = 'PNG' | 'PSD' | 'TIF';

interface ToolbarProps {
  onExportPNG: () => void;
  onExportPSD: () => void;
  onExportTIF: () => void;
  onClear: () => void;
  onRelayout: () => void;
  hasImages: boolean;
  checkingUpdate?: boolean;
  onCheckUpdate?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onOpenSettings?: () => void;
}

interface ExportSplitButtonProps {
  hasImages: boolean;
  onExportPNG: () => void;
  onExportPSD: () => void;
  onExportTIF: () => void;
}

/**
 * 导出分裂按钮：主按钮显示并导出当前选中格式（默认 PNG），
 * 右侧小三角展开格式选择菜单（PNG / PSD / TIF），切换后记忆为当前格式。
 */
function ExportSplitButton({ hasImages, onExportPNG, onExportPSD, onExportTIF }: ExportSplitButtonProps) {
  const [format, setFormat] = useState<ExportFormatKey>('PNG');
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const options: { key: ExportFormatKey; label: string; Icon: typeof FileImage; desc: string; handler: () => void }[] = [
    { key: 'PNG', label: 'PNG', Icon: FileImage, desc: '位图', handler: onExportPNG },
    { key: 'PSD', label: 'PSD', Icon: Layers, desc: '含图层', handler: onExportPSD },
    { key: 'TIF', label: 'TIF', Icon: FileType, desc: '透明位图', handler: onExportTIF },
  ];
  const current = options.find(o => o.key === format) ?? options[0];

  // 点击组件外部时收起菜单
  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [menuOpen]);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex overflow-hidden rounded-lg border border-lt-border bg-white shadow-sm transition-all hover:border-lt-sub/30">
        {/* 主按钮：点击导出当前格式 */}
        <button
          onClick={() => { setMenuOpen(false); current.handler(); }}
          disabled={!hasImages}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-lt-sub transition-all
                     hover:bg-lt-hover hover:text-lt-text active:scale-[0.97]
                     disabled:cursor-not-allowed disabled:opacity-40"
          title={`导出为 ${current.label}`}
        >
          <current.Icon className="h-3.5 w-3.5" />
          {current.label}
        </button>
        {/* 小三角：展开/收起格式菜单 */}
        <button
          onClick={() => setMenuOpen(v => !v)}
          disabled={!hasImages}
          className="flex items-center border-l border-lt-border px-1.5 text-lt-sub transition-all
                     hover:bg-lt-hover hover:text-lt-text disabled:cursor-not-allowed disabled:opacity-40"
          title="选择导出格式"
          aria-label="选择导出格式"
          aria-expanded={menuOpen}
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* 格式下拉菜单 */}
      {menuOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-lg border border-lt-border bg-white py-1 shadow-lg">
          {options.map(opt => {
            const active = opt.key === format;
            return (
              <button
                key={opt.key}
                onClick={() => { setFormat(opt.key); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-lt-sub transition-colors
                           hover:bg-lt-hover hover:text-lt-text"
              >
                <opt.Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="font-medium">{opt.label}</span>
                <span className="text-[10px] text-lt-dim">{opt.desc}</span>
                {active && <Check className="ml-auto h-3 w-3 text-accent-500" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Toolbar({ onExportPNG, onExportPSD, onExportTIF, onClear, onRelayout, hasImages, checkingUpdate, onCheckUpdate, canUndo, canRedo, onUndo, onRedo, onOpenSettings }: ToolbarProps) {
  return (
    <div className="flex h-12 items-center justify-between border-b border-lt-border bg-white px-4">
      {/* Left: App branding */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent-600 to-accent-500 shadow-sm">
          <ImagePlus className="h-4 w-4 text-white" />
        </div>
        <div className="flex items-baseline gap-2">
          <h1 className="text-sm font-semibold text-lt-text">PNG 排版工具</h1>
          <span className="text-[10px] text-lt-muted hidden sm:inline">透明图片自动排版</span>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Undo / Redo */}
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="flex h-7 w-7 items-center justify-center rounded-md text-lt-sub transition-all hover:bg-lt-hover hover:text-lt-text disabled:cursor-not-allowed disabled:opacity-30"
          title="撤销 (Ctrl+Z)"
          aria-label="撤销"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="flex h-7 w-7 items-center justify-center rounded-md text-lt-sub transition-all hover:bg-lt-hover hover:text-lt-text disabled:cursor-not-allowed disabled:opacity-30"
          title="重做 (Ctrl+Y)"
          aria-label="重做"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </button>

        <div className="mx-0.5 h-5 w-px bg-lt-border" />

        {/* Relayout button */}
        <button
          onClick={onRelayout}
          disabled={!hasImages}
          className="flex items-center gap-1.5 rounded-lg bg-accent-600 px-3.5 py-1.5 text-xs
                     font-medium text-white shadow-sm transition-all hover:bg-accent-700
                     active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
          title="按数量重新排版"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          排版
        </button>

        <div className="mx-0.5 h-5 w-px bg-lt-border" />

        {/* Export — split button: 主按钮导出当前格式，小三角切换格式 */}
        <ExportSplitButton
          hasImages={hasImages}
          onExportPNG={onExportPNG}
          onExportPSD={onExportPSD}
          onExportTIF={onExportTIF}
        />

        <div className="mx-0.5 h-5 w-px bg-lt-border" />

        {/* Clear all */}
        <button
          onClick={onClear}
          disabled={!hasImages}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-lt-muted
                     transition-all hover:bg-red-50 hover:text-red-500
                     active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
          title="清空所有图片"
          aria-label="清空所有图片"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>

        <div className="mx-0.5 h-5 w-px bg-lt-border" />

        {/* Settings (quantity recognition, etc.) */}
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-lt-muted
                     transition-all hover:bg-accent-50 hover:text-accent-600
                     active:scale-[0.97]"
          title="设置（数量识别等）"
          aria-label="设置"
        >
          <Settings className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">设置</span>
        </button>

        <div className="mx-0.5 h-5 w-px bg-lt-border" />

        {/* Check for updates */}
        <button
          onClick={onCheckUpdate}
          disabled={checkingUpdate}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-lt-muted
                     transition-all hover:bg-accent-50 hover:text-accent-600
                     active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
          title="检查更新"
          aria-label="检查更新"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{checkingUpdate ? '检查中...' : '检查更新'}</span>
        </button>
      </div>
    </div>
  );
}
