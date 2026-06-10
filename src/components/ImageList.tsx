import { useState, useEffect, useCallback } from 'react';
import { X, ImageIcon, Minus, Plus, RotateCcw, CheckSquare, Square, Check } from 'lucide-react';
import type { UploadedImage } from '../shared/types';

interface ImageListProps {
  images: UploadedImage[];
  onRemove: (id: string) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onBatchUpdateQuantity: (ids: string[], quantity: number) => void;
  onUpdateTargetSize: (id: string, targetWidthCm?: number, targetHeightCm?: number) => void;
  onRotate: (id: string) => void;
  dpi: number;
  totalQuantity: number;
}

function naturalCmSize(trimPx: number, dpi: number): string {
  return (trimPx * 2.54 / dpi).toFixed(2);
}

function ImageCard({
  img, dpi, selected, onToggleSelect, onRemove, onUpdateQuantity, onUpdateTargetSize, onRotate,
}: {
  img: UploadedImage; dpi: number; selected: boolean;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  onRemove: (id: string) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onUpdateTargetSize: (id: string, targetWidthCm?: number, targetHeightCm?: number) => void;
  onRotate: (id: string) => void;
}) {
  const [lockAspect, setLockAspect] = useState(true);

  const currentWidthCm = img.targetWidthCm !== undefined ? img.targetWidthCm : parseFloat(naturalCmSize(img.trimWidth, dpi));
  const currentHeightCm = img.targetHeightCm !== undefined ? img.targetHeightCm : parseFloat(naturalCmSize(img.trimHeight, dpi));
  const hasCustomSize = img.targetWidthCm !== undefined;

  const handleWidthChange = (value: string) => {
    const w = parseFloat(value);
    if (isNaN(w) || w <= 0) return;
    if (lockAspect && img.trimWidth > 0) {
      const ratio = img.trimHeight / img.trimWidth;
      onUpdateTargetSize(img.id, parseFloat(w.toFixed(2)), parseFloat((w * ratio).toFixed(2)));
    } else {
      onUpdateTargetSize(img.id, w, currentHeightCm);
    }
  };

  const handleHeightChange = (value: string) => {
    const h = parseFloat(value);
    if (isNaN(h) || h <= 0) return;
    if (lockAspect && img.trimHeight > 0) {
      const ratio = img.trimWidth / img.trimHeight;
      onUpdateTargetSize(img.id, parseFloat((h * ratio).toFixed(2)), parseFloat(h.toFixed(2)));
    } else {
      onUpdateTargetSize(img.id, currentWidthCm, h);
    }
  };

  return (
    <div className={`rounded-lg border px-3 py-2.5 shadow-sm transition-colors ${
      selected ? 'border-accent-400 bg-accent-50/40' : 'border-lt-border bg-white'
    }`}>
      {/* 第一行：复选框 + 缩略图 + 文件名 + 删除 */}
      <div className="flex items-start gap-2">
        <button
          onClick={(e) => onToggleSelect(img.id, e.shiftKey)}
          className="mt-0.5 flex-shrink-0 text-accent-500 hover:text-accent-600 transition-colors"
          title={selected ? '取消选择' : '选择 (Shift多选)'}
        >
          {selected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 text-lt-dim" />}
        </button>

        <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded border border-lt-border checkerboard">
          <img src={img.dataUrl} alt={img.name} className="h-full w-full object-contain" draggable={false} />
        </div>

        <div className="flex-1 min-w-0">
          <span className="text-[11px] font-medium text-lt-text break-all leading-tight">{img.name}</span>
          {hasCustomSize && (
            <span className="ml-1 inline-flex items-center rounded bg-accent-100 px-1 py-px text-[9px] font-medium text-accent-600 leading-none align-middle">
              自定义
            </span>
          )}
        </div>

        <button
          onClick={() => onRemove(img.id)}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-lt-dim transition-all hover:bg-red-50 hover:text-red-500"
          title="删除"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 第二行：尺寸输入（独占一行，不被挤压） */}
      <div className="mt-2 flex items-center gap-1.5">
        <input
          type="number" step="0.01" min="0.1" value={currentWidthCm}
          onChange={(e) => handleWidthChange(e.target.value)}
          placeholder="宽"
          className="flex-1 min-w-0 rounded-md border border-lt-border bg-white px-2 py-1 text-right text-xs
                     font-mono text-accent-600 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/20 transition-all"
        />
        <span className="text-xs text-lt-muted shrink-0">×</span>
        <input
          type="number" step="0.01" min="0.1" value={currentHeightCm}
          onChange={(e) => handleHeightChange(e.target.value)}
          placeholder="高"
          className="flex-1 min-w-0 rounded-md border border-lt-border bg-white px-2 py-1 text-right text-xs
                     font-mono text-accent-600 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/20 transition-all"
        />
        <span className="text-xs text-lt-muted shrink-0">cm</span>
      </div>

      {/* 第三行：数量 + 文字按钮（旋转 / 锁定 / 重置） */}
      <div className="mt-1.5 flex items-center gap-2">
        {/* 数量步进器 */}
        <div className="flex items-center rounded-md border border-lt-border bg-lt-card overflow-hidden">
          <button
            onClick={() => { if (img.quantity > 1) onUpdateQuantity(img.id, img.quantity - 1); }}
            disabled={img.quantity <= 1}
            className="flex h-6 w-6 items-center justify-center text-lt-sub transition-all hover:bg-accent-50 hover:text-accent-600 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <Minus className="h-3 w-3" />
          </button>
          <input
            type="number" min={1} max={99} value={img.quantity}
            onChange={(e) => { const val = parseInt(e.target.value, 10); if (!isNaN(val) && val >= 1 && val <= 99) onUpdateQuantity(img.id, val); }}
            className="w-9 border-x border-lt-border bg-white py-0 text-center text-xs font-bold text-accent-600 focus:outline-none"
          />
          <button
            onClick={() => { if (img.quantity < 99) onUpdateQuantity(img.id, img.quantity + 1); }}
            disabled={img.quantity >= 99}
            className="flex h-6 w-6 items-center justify-center text-lt-sub transition-all hover:bg-accent-50 hover:text-accent-600 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        <div className="flex-1" />

        {/* 文字按钮组 */}
        <button
          onClick={() => onRotate(img.id)}
          className={`rounded-md px-2 py-1 text-[11px] transition-all
                     ${img.rotation !== 0
                       ? 'text-accent-600 bg-accent-50 font-medium'
                       : 'text-lt-dim hover:bg-lt-hover hover:text-lt-sub'}`}
          title={`旋转 90° (当前 ${img.rotation}°)`}
        >
          旋转{img.rotation !== 0 ? ` ${img.rotation}°` : ''}
        </button>

        <button
          onClick={() => setLockAspect(!lockAspect)}
          className={`rounded-md px-2 py-1 text-[11px] transition-all
                     ${lockAspect
                       ? 'text-accent-600 bg-accent-50 font-medium'
                       : 'text-lt-dim hover:bg-lt-hover hover:text-lt-sub'}`}
          title={lockAspect ? '点击解锁比例' : '点击锁定比例'}
        >
          {lockAspect ? '锁定' : '解锁'}
        </button>

        {hasCustomSize && (
          <button
            onClick={() => onUpdateTargetSize(img.id, undefined, undefined)}
            className="rounded-md px-2 py-1 text-[11px] text-lt-dim hover:bg-lt-hover hover:text-lt-sub transition-all"
            title="恢复原始尺寸"
          >
            <RotateCcw className="h-3 w-3 inline -mt-px" />
          </button>
        )}
      </div>
    </div>
  );
}

export function ImageList({ images, onRemove, onUpdateQuantity, onBatchUpdateQuantity, onUpdateTargetSize, onRotate, dpi, totalQuantity }: ImageListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [batchQty, setBatchQty] = useState(2);

  useEffect(() => {
    setSelectedIds(prev => {
      const next = new Set<string>();
      prev.forEach(id => { if (images.find(img => img.id === id)) next.add(id); });
      return next;
    });
  }, [images]);

  const handleSelect = useCallback((id: string, shiftKey: boolean) => {
    setSelectedIds(prev => {
      if (shiftKey && lastClickedId) {
        const ids = images.map(img => img.id);
        const fromIdx = ids.indexOf(lastClickedId);
        const toIdx = ids.indexOf(id);
        if (fromIdx !== -1 && toIdx !== -1) {
          const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
          const next = new Set(prev);
          for (let i = lo; i <= hi; i++) next.add(ids[i]);
          return next;
        }
      }
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setLastClickedId(id);
  }, [lastClickedId, images]);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(images.map(img => img.id)));
  }, [images]);

  const selectNone = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBatchApply = useCallback(() => {
    if (selectedIds.size === 0) return;
    onBatchUpdateQuantity(Array.from(selectedIds), batchQty);
  }, [selectedIds, batchQty, onBatchUpdateQuantity]);

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center py-6 text-lt-muted">
        <ImageIcon className="mb-2 h-7 w-7 opacity-40" />
        <p className="text-xs">暂无图片，请上传</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 批量操作栏 */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-2 rounded-lg border border-accent-300 bg-accent-50 px-3 py-2 shadow-sm">
          <span className="text-xs font-medium text-accent-700">已选 {selectedIds.size} 项</span>
          <div className="h-4 w-px bg-accent-200" />
          <span className="text-[11px] text-accent-600">数量</span>
          <div className="flex items-center rounded-md border border-accent-300 bg-white overflow-hidden">
            <button onClick={() => setBatchQty(q => Math.max(1, q - 1))}
              className="flex h-6 w-6 items-center justify-center text-accent-600 hover:bg-accent-100">
              <Minus className="h-3 w-3" />
            </button>
            <input type="number" min={1} max={99} value={batchQty}
              onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 1) setBatchQty(Math.min(99, v)); }}
              className="w-9 border-x border-accent-300 bg-white py-0 text-center text-xs font-bold text-accent-600 focus:outline-none"
            />
            <button onClick={() => setBatchQty(q => Math.min(99, q + 1))}
              className="flex h-6 w-6 items-center justify-center text-accent-600 hover:bg-accent-100">
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <button onClick={handleBatchApply}
            className="flex items-center gap-1 rounded-md bg-accent-500 px-3 py-1 text-[11px] font-medium text-white hover:bg-accent-600 transition-colors">
            <Check className="h-3 w-3" /> 应用
          </button>
          <div className="flex-1" />
          <button onClick={selectNone} className="text-[11px] text-accent-500 hover:text-accent-700 transition-colors">
            取消全选
          </button>
        </div>
      )}

      {images.length >= 2 && selectedIds.size === 0 && (
        <div className="flex items-center justify-between">
          <button onClick={selectAll} className="flex items-center gap-1 text-[11px] text-lt-muted hover:text-accent-500 transition-colors">
            <CheckSquare className="h-3.5 w-3.5" /> 全选
          </button>
          <span className="text-[11px] text-lt-dim">Shift 可批量选中</span>
        </div>
      )}

      {images.map((img) => (
        <ImageCard
          key={img.id} img={img} dpi={dpi} selected={selectedIds.has(img.id)}
          onToggleSelect={handleSelect} onRemove={onRemove}
          onUpdateQuantity={onUpdateQuantity} onUpdateTargetSize={onUpdateTargetSize} onRotate={onRotate}
        />
      ))}
    </div>
  );
}
