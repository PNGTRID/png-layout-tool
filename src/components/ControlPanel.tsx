import { LayoutParams } from '../shared/types';
import { Square, Ruler, Maximize, Columns, RotateCw } from 'lucide-react';

interface ControlPanelProps {
  params: LayoutParams;
  onUpdateParam: <K extends keyof LayoutParams>(key: K, value: LayoutParams[K]) => void;
  imageCount: number;
}

/** Slider + number input combo for cm values */
function CmSliderInput({
  label,
  icon,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs text-lt-sub">
          {icon}
          {label}
        </label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={parseFloat(value.toFixed(1))}
            onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
            className="w-14 rounded border border-lt-border bg-white px-1.5 py-0.5 text-right text-xs font-mono text-accent-600 focus:border-accent-500 focus:outline-none shadow-sm"
          />
          <span className="text-[10px] text-lt-muted">cm</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="custom-slider w-full"
      />
    </div>
  );
}

export function ControlPanel({ params, onUpdateParam, imageCount }: ControlPanelProps) {
  return (
    <div className="space-y-4">
      {/* Image count */}
      <div className="flex items-center gap-2 rounded-lg bg-lt-card px-3 py-2">
        <Square className="h-3.5 w-3.5 text-lt-muted" />
        <span className="text-xs text-lt-sub">
          图片数量: <strong className="text-lt-text">{imageCount}</strong>
        </span>
      </div>

      {/* Canvas size (cm) */}
      <div className="space-y-2">
        <label className="flex items-center gap-1.5 text-xs text-lt-sub">
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
                className="w-full rounded-md border border-lt-border bg-white px-2 py-1.5 text-xs text-lt-text placeholder-lt-dim shadow-sm focus:border-accent-500 focus:outline-none"
              />
              <span className="text-[10px] text-lt-muted flex-shrink-0">cm</span>
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
                className="w-full rounded-md border border-lt-border bg-white px-2 py-1.5 text-xs text-lt-text placeholder-lt-dim shadow-sm focus:border-accent-500 focus:outline-none"
              />
              <span className="text-[10px] text-lt-muted flex-shrink-0">cm</span>
            </div>
            <span className="mt-0.5 block text-[10px] text-lt-dim">高度 (0=自动)</span>
          </div>
        </div>
      </div>

      {/* Spacing slider with number input */}
      <CmSliderInput
        label="图片间距"
        icon={<Columns className="h-3.5 w-3.5" />}
        value={params.gap}
        min={0}
        max={5}
        step={0.1}
        onChange={(val) => onUpdateParam('gap', val)}
      />

      {/* Auto rotate toggle */}
      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-lt-border bg-white px-3 py-2 shadow-sm transition-all hover:bg-lt-hover">
        <input
          type="checkbox"
          checked={params.autoRotate}
          onChange={(e) => onUpdateParam('autoRotate', e.target.checked)}
          className="h-3.5 w-3.5 rounded border-lt-border text-accent-500 focus:ring-accent-500"
        />
        <RotateCw className="h-3.5 w-3.5 text-lt-sub" />
        <span className="text-xs text-lt-sub">自动旋转</span>
      </label>

      {/* DPI */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs text-lt-sub">
            <Ruler className="h-3.5 w-3.5" />
            DPI
          </label>
          <span className="text-xs font-mono text-accent-600">{params.dpi}</span>
        </div>
        <input
          type="range"
          min={72}
          max={600}
          step={1}
          value={params.dpi}
          onChange={(e) => onUpdateParam('dpi', Number(e.target.value))}
          className="custom-slider w-full"
        />
      </div>
    </div>
  );
}
