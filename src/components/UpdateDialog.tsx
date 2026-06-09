import { Download, X, AlertCircle, Loader2 } from 'lucide-react';

interface UpdateDialogProps {
  version: string;
  notes?: string;
  downloading: boolean;
  downloadProgress: number;
  installing: boolean;
  error: string | null;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function UpdateDialog({
  version,
  notes,
  downloading,
  downloadProgress,
  installing,
  error,
  onConfirm,
  onDismiss,
}: UpdateDialogProps) {
  const canClose = !downloading && !installing;
  const isActive = downloading || installing;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative w-[420px] rounded-2xl bg-white p-6 shadow-2xl border border-lt-border">
        {/* Close button */}
        {canClose && (
          <button
            onClick={onDismiss}
            className="absolute top-4 right-4 text-lt-muted hover:text-lt-text transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Title */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-500">
            <Download className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-lt-text">
              发现新版本
            </h3>
            <p className="text-xs text-lt-muted">v{version}</p>
          </div>
        </div>

        {/* Release notes */}
        {notes && (
          <div className="mb-4 max-h-32 overflow-y-auto rounded-lg bg-gray-50 p-3 text-xs text-lt-sub whitespace-pre-wrap">
            {notes}
          </div>
        )}

        {/* Download progress */}
        {isActive && (
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-lt-sub flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                {installing ? '正在安装...' : '正在下载更新...'}
              </span>
              <span className="text-lt-muted">{downloadProgress}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-accent-500 transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>更新失败：{error}</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 mt-5">
          {canClose && (
            <button
              onClick={onDismiss}
              className="rounded-lg px-4 py-2 text-xs text-lt-sub hover:bg-gray-50 transition-colors"
            >
              稍后再说
            </button>
          )}
          {canClose && (
            <button
              onClick={onConfirm}
              className="flex items-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-accent-700 transition-all"
            >
              <Download className="h-3.5 w-3.5" />
              立即更新
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
