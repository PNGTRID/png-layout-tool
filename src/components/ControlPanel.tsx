import type { LayoutParams } from '../shared/types';
import { Square, Ruler, Maximize, Columns, Sparkles } from 'lucide-react';

interface ControlPanelProps {
  params: LayoutParams;
  onUpdateParam: <K extends keyof LayoutParams>(key: K, value: LayoutParams[K]) => void;
  imageCount: number;
}

export function ControlPanel({ params, onUpdateParam, imageCount }: ControlPanelProps) {
  return (
    <div className="space-y-4">
      {/* 图片数量统计 */}
      <div className="flex items-center gap-2.5 rounded-lg bg-accent-50/60 px-3 py-2.5 border border-accent-100">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-500/10">
          <Square className="h-3.5 w-3.5 text-accent-600" />
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-lt-muted leading-none">图片数量</span>
          <span className="text-sm font-bold text-accent-600 leading-tight">{imageCount}</span>
        </div>
      </div>

      <hr className="border-lt-border" />

      {/* 画布尺寸 — 宽 x 高 */}
      <div className="space-y-2">
        <label className="flex items-center gap-1.5 text-xs font-medium text-lt-sub">
          <Maximize className="h-3.5 w-3.5" />
          画布尺寸
        </label>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                step={0.1}
                value={params.canvasWidthCm || ''}
                onChange={(e) => onUpdateParam('canvasWidthCm', Number(e.target.value) || 0)}
                placeholder="自动"
                className="w-full rounded-md border border-lt-border bg-white px-2 py-1 text-xs
                           text-lt-text placeholder-lt-dim shadow-sm
                           focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/20
                           transition-all"
              />
              <span className="text-[10px] text-lt-muted shrink-0">cm</span>
            </div>
            <span className="mt-0.5 block text-[10px] text-lt-dim">宽度 (0=自动)</span>
          </div>
          <span className="text-xs text-lt-dim mt-[-12px]">×</span>
          <div className="flex-1">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                step={0.1}
                value={params.canvasHeightCm || ''}
                onChange={(e) => onUpdateParam('canvasHeightCm', Number(e.target.value) || 0)}
                placeholder="自动"
                className="w-full rounded-md border border-lt-border bg-white px-2 py-1 text-xs
                           text-lt-text placeholder-lt-dim shadow-sm
                           focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/20
                           transition-all"
              />
              <span className="text-[10px] text-lt-muted shrink-0">cm</span>
            </div>
            <span className="mt-0.5 block text-[10px] text-lt-dim">高度 (0=自动)</span>
          </div>
        </div>
      </div>

      <hr className="border-lt-border" />

      {/* 图片间距 — 直接输入 + 滑块 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs font-medium text-lt-sub">
            <Columns className="h-3.5 w-3.5" />
            图片间距
          </label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={5}
              step={0.1}
              value={parseFloat(params.gap.toFixed(1))}
              onChange={(e) => {
                const v = Number(e.target.value);
                onUpdateParam('gap', isNaN(v) ? 0 : Math.max(0, Math.min(5, v)));
              }}
              className="w-[72px] rounded-md border border-lt-border bg-white px-2 py-1 text-right text-xs
                         font-mono text-accent-600 shadow-sm
                         focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/20
                         transition-all"
            />
            <span className="text-[10px] text-lt-muted">cm</span>
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={5}
          step={0.1}
          value={params.gap}
          onChange={(e) => onUpdateParam('gap', Number(e.target.value))}
          className="custom-slider w-full"
          aria-label="图片间距"
          aria-valuenow={params.gap}
          aria-valuemin={0}
          aria-valuemax={5}
        />
      </div>

      <hr className="border-lt-border" />

      {/* 智能排版：自动旋转竖图 + 多宽度搜索择优 */}
      <label
        title="智能排版：自动旋转竖图横排，并尝试多种画布宽度选出最紧凑的布局"
        className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-lt-border bg-white px-3 py-2.5 shadow-sm transition-all hover:bg-lt-hover"
      >
        <input
          type="checkbox"
          checked={params.autoRotate}
          onChange={(e) => onUpdateParam('autoRotate', e.target.checked)}
          className="h-3.5 w-3.5 rounded border-lt-border text-accent-500 focus:ring-accent-500"
        />
        <Sparkles className="h-3.5 w-3.5 text-lt-sub" />
        <span className="text-xs text-lt-sub">智能排版</span>
      </label>

      <hr className="border-lt-border" />

      {/* DPI — 直接输入 + 滑块 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs font-medium text-lt-sub">
            <Ruler className="h-3.5 w-3.5" />
            DPI 分辨率
          </label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={72}
              max={600}
              step={1}
              value={params.dpi}
              onChange={(e) => {
                const v = Number(e.target.value);
                onUpdateParam('dpi', isNaN(v) ? 72 : Math.max(72, Math.min(600, v)));
              }}
              className="w-[72px] rounded-md border border-lt-border bg-white px-2 py-1 text-right text-xs
                         font-mono text-accent-600 shadow-sm
                         focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/20
                         transition-all"
            />
          </div>
        </div>
        <input
          type="range"
          min={72}
          max={600}
          step={1}
          value={params.dpi}
          onChange={(e) => onUpdateParam('dpi', Number(e.target.value))}
          className="custom-slider w-full"
          aria-label="DPI 分辨率"
          aria-valuenow={params.dpi}
          aria-valuemin={72}
          aria-valuemax={600}
        />
        <div className="flex justify-between text-[10px] text-lt-dim">
          <span>72</span>
          <span>600</span>
        </div>
      </div>

      <hr className="border-lt-border" />

      {/* Crop marks toggle */}
      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-lt-border bg-white px-3 py-2.5 shadow-sm transition-all hover:bg-lt-hover">
        <input
          type="checkbox"
          checked={params.showCropMarks}
          onChange={(e) => onUpdateParam('showCropMarks', e.target.checked)}
          className="h-3.5 w-3.5 rounded border-lt-border text-accent-500 focus:ring-accent-500"
        />
        <span className="text-xs text-lt-sub">裁切线（印刷标记）</span>
      </label>

      {/* Bleed size */}
      {params.showCropMarks && (
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs text-lt-sub shrink-0">
            出血
          </label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={params.bleedCm}
              onChange={(e) => {
                const v = Number(e.target.value);
                onUpdateParam('bleedCm', isNaN(v) ? 0 : Math.max(0, Math.min(1, v)));
              }}
              className="w-[72px] rounded-md border border-lt-border bg-white px-2 py-1 text-right text-xs
                         font-mono text-accent-600 shadow-sm
                         focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/20
                         transition-all"
            />
            <span className="text-[10px] text-lt-muted w-5">cm</span>
          </div>
        </div>
      )}
    </div>
  );
}
