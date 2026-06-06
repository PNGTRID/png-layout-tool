import { useRef, useCallback } from 'react';
import { Upload } from 'lucide-react';

interface UploadAreaProps {
  onFilesSelected: (files: FileList | File[] | null) => void;
  isDragging: boolean;
}

export function UploadArea({ onFilesSelected, isDragging }: UploadAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onFilesSelected(e.target.files);
    e.target.value = '';
  }, [onFilesSelected]);

  return (
    <div
      className={`
        flex flex-col items-center justify-center
        rounded-xl border-2 border-dashed
        transition-all duration-200 cursor-pointer
        checkerboard
        ${isDragging
          ? 'border-accent-500 bg-accent-50 scale-[1.02]'
          : 'border-lt-border bg-white hover:border-accent-400 hover:bg-lt-hover'
        }
      `}
      style={{ minHeight: 120 }}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".png,.psd,image/png,image/vnd.adobe.photoshop"
        className="hidden"
        onChange={handleChange}
      />

      <div className={`
        flex h-16 w-16 items-center justify-center rounded-2xl
        transition-colors duration-200
        ${isDragging ? 'bg-accent-100' : 'bg-lt-hover'}
      `}>
        <Upload className={`h-8 w-8 transition-colors ${isDragging ? 'text-accent-500' : 'text-lt-muted'}`} />
      </div>

      <p className="mt-4 text-sm text-lt-sub">
        拖拽 PNG / PSD 图片到此处，或点击上传
      </p>
      <p className="mt-1 text-xs text-lt-muted">
        支持多选、文件夹拖拽，自动识别透明背景
      </p>
    </div>
  );
}
