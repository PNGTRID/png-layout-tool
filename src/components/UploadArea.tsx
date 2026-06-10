import { useRef, useCallback } from 'react';
import { Upload, FolderOpen } from 'lucide-react';

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
        group relative flex items-center gap-3 rounded-xl px-4 py-3
        border-2 border-dashed transition-all duration-200 cursor-pointer
        ${isDragging
          ? 'border-accent-500 bg-accent-50'
          : 'border-lt-border bg-lt-card hover:border-accent-400 hover:bg-accent-50/40'
        }
      `}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".png,.psd,image/png,image/vnd.adobe.photoshop"
        className="hidden"
        onChange={handleChange}
        aria-label="上传图片文件"
      />

      {/* 图标 */}
      <div className={`
        flex h-9 w-9 shrink-0 items-center justify-center rounded-lg
        transition-colors duration-200
        ${isDragging
          ? 'bg-accent-500 text-white'
          : 'bg-accent-100 text-accent-600 group-hover:bg-accent-500 group-hover:text-white'
        }
      `}>
        <Upload className="h-4 w-4" />
      </div>

      {/* 文字 */}
      <div className="flex flex-col">
        <span className={`text-xs font-medium leading-tight ${isDragging ? 'text-accent-600' : 'text-lt-text'}`}>
          {isDragging ? '松开以上传' : '上传图片'}
        </span>
        <span className="text-[10px] text-lt-muted leading-tight mt-0.5">
          PNG / PSD · 支持多选和文件夹拖拽
        </span>
      </div>

      {/* 文件夹小图标 */}
      {!isDragging && (
        <FolderOpen className="ml-auto h-4 w-4 text-lt-dim group-hover:text-accent-400 transition-colors" />
      )}
    </div>
  );
}
