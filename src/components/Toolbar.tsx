import { Download, Trash2, Layers, ImagePlus, FileImage, LayoutGrid } from 'lucide-react';

interface ToolbarProps {
  onExportPNG: () => void;
  onExportPSD: () => void;
  onClear: () => void;
  onRelayout: () => void;
  hasImages: boolean;
}

export function Toolbar({ onExportPNG, onExportPSD, onClear, onRelayout, hasImages }: ToolbarProps) {
  return (
    <div className="flex h-12 items-center justify-between border-b border-lt-border bg-white px-4 shadow-sm">
      {/* Left: App branding */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent-600 to-accent-500">
          <ImagePlus className="h-4 w-4 text-white" />
        </div>
        <div className="flex items-baseline gap-2">
          <h1 className="text-sm font-semibold text-lt-text">PNG 排版工具</h1>
          <span className="text-[10px] text-lt-muted">透明图片自动排版</span>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5">
        {/* Relayout button */}
        <button
          onClick={onRelayout}
          disabled={!hasImages}
          className="flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs
                     text-white shadow-sm transition-all hover:bg-accent-700
                     disabled:cursor-not-allowed disabled:opacity-40"
          title="按数量重新排版"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          排版
        </button>

        <div className="mx-1 h-5 w-px bg-lt-border" />

        {/* Export PNG */}
        <button
          onClick={onExportPNG}
          disabled={!hasImages}
          className="flex items-center gap-1.5 rounded-lg border border-lt-border bg-white px-3 py-1.5 text-xs
                     text-lt-sub shadow-sm transition-all hover:bg-lt-hover hover:text-lt-text
                     disabled:cursor-not-allowed disabled:opacity-40"
          title="导出为 PNG 图片"
        >
          <FileImage className="h-3.5 w-3.5" />
          PNG
        </button>

        {/* Export PSD */}
        <button
          onClick={onExportPSD}
          disabled={!hasImages}
          className="flex items-center gap-1.5 rounded-lg border border-lt-border bg-white px-3 py-1.5 text-xs
                     text-lt-sub shadow-sm transition-all hover:bg-lt-hover hover:text-lt-text
                     disabled:cursor-not-allowed disabled:opacity-40"
          title="导出为 PSD 文件（含图层）"
        >
          <Layers className="h-3.5 w-3.5" />
          PSD
        </button>

        <div className="mx-1 h-5 w-px bg-lt-border" />

        {/* Clear all */}
        <button
          onClick={onClear}
          disabled={!hasImages}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-lt-muted
                     transition-all hover:bg-red-50 hover:text-red-500
                     disabled:cursor-not-allowed disabled:opacity-40"
          title="清空所有图片"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
