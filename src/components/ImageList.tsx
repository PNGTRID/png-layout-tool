import { X, ImageIcon, Minus, Plus, Copy } from 'lucide-react';
import { UploadedImage } from '../shared/types';

interface ImageListProps {
  images: UploadedImage[];
  onRemove: (id: string) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  totalQuantity: number;
}

export function ImageList({ images, onRemove, onUpdateQuantity, totalQuantity }: ImageListProps) {
  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center py-6 text-lt-muted">
        <ImageIcon className="mb-2 h-7 w-7 opacity-40" />
        <p className="text-xs">暂无图片，请上传</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {images.map((img) => (
        <div
          key={img.id}
          className="flex items-center gap-2.5 rounded-lg border border-lt-border bg-white px-3 py-2 shadow-sm"
        >
          {/* Thumbnail */}
          <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded border border-lt-border checkerboard">
            <img
              src={img.dataUrl}
              alt={img.name}
              className="h-full w-full object-contain"
              draggable={false}
            />
          </div>

          {/* File name + size */}
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xs font-medium text-lt-text" title={img.name}>
              {img.name}
            </span>
            <span className="text-[10px] text-lt-dim">
              {img.width}×{img.height}
            </span>
          </div>

          {/* Quantity: ×N label + stepper */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Copy className="h-3 w-3 text-lt-dim" />
            <div className="flex items-center rounded-md border border-lt-border bg-lt-card overflow-hidden">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (img.quantity > 1) onUpdateQuantity(img.id, img.quantity - 1);
                }}
                disabled={img.quantity <= 1}
                className="flex h-6 w-6 items-center justify-center text-lt-sub transition-all
                           hover:bg-accent-50 hover:text-accent-600 disabled:opacity-20 disabled:cursor-not-allowed"
              >
                <Minus className="h-3 w-3" />
              </button>
              <input
                type="number"
                min={1}
                max={99}
                value={img.quantity}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) onUpdateQuantity(img.id, val);
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-9 border-x border-lt-border bg-white py-0 text-center text-xs
                           font-bold text-accent-600 focus:outline-none"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (img.quantity < 99) onUpdateQuantity(img.id, img.quantity + 1);
                }}
                disabled={img.quantity >= 99}
                className="flex h-6 w-6 items-center justify-center text-lt-sub transition-all
                           hover:bg-accent-50 hover:text-accent-600 disabled:opacity-20 disabled:cursor-not-allowed"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Remove */}
          <button
            onClick={() => onRemove(img.id)}
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-lt-dim
                       transition-all hover:bg-red-50 hover:text-red-500"
            title="删除"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
