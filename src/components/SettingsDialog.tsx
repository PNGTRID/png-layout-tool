import { useState } from 'react';
import { X, Settings as SettingsIcon } from 'lucide-react';
import type { AppSettings } from '../shared/app-settings';
import type { QuantityTemplate } from '../shared/types';
import { parseQuantityFromName } from '../lib/quantity-parser';

interface SettingsDialogProps {
  initial: AppSettings;
  onSave: (settings: AppSettings) => void;
  onClose: () => void;
}

/**
 * Settings dialog — configures filename-quantity recognition.
 * Edits a local draft so the live preview reflects unsaved changes; only Save commits.
 */
export function SettingsDialog({ initial, onSave, onClose }: SettingsDialogProps) {
  const [draft, setDraft] = useState<AppSettings>(initial);
  const [previewName, setPreviewName] = useState('宽七-22个.png');

  const updateTemplate = (patch: Partial<QuantityTemplate>) =>
    setDraft(prev => ({ ...prev, quantityTemplate: { ...prev.quantityTemplate, ...patch } }));

  const previewQty = parseQuantityFromName(previewName, draft.quantityTemplate);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
    >
      <div className="relative w-[440px] rounded-2xl bg-white p-6 shadow-2xl border border-lt-border">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-lt-muted hover:text-lt-text transition-colors"
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-500">
            <SettingsIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 id="settings-dialog-title" className="text-base font-semibold text-lt-text">设置</h3>
            <p className="text-xs text-lt-muted">文件名数量识别规则</p>
          </div>
        </div>

        {/* Enable toggle */}
        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-lt-border bg-white px-3 py-2.5 shadow-sm transition-all hover:bg-lt-hover mb-4">
          <input
            type="checkbox"
            checked={draft.quantityTemplate.enabled}
            onChange={(e) => updateTemplate({ enabled: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-lt-border text-accent-500 focus:ring-accent-500"
          />
          <span className="text-xs text-lt-sub">启用数量识别（上传时按文件名自动设置份数）</span>
        </label>

        {/* Suffixes */}
        <div className="space-y-1.5 mb-4">
          <label className="block text-xs font-medium text-lt-sub">量词（逗号分隔）</label>
          <input
            type="text"
            value={draft.quantityTemplate.suffixes}
            onChange={(e) => updateTemplate({ suffixes: e.target.value })}
            placeholder="个,张,份,pcs"
            className="w-full rounded-md border border-lt-border bg-white px-2.5 py-1.5 text-xs
                       text-lt-text placeholder-lt-dim shadow-sm
                       focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/20 transition-all"
          />
          <span className="block text-[10px] text-lt-dim">数字后跟这些词即视为数量，如「22个」「5pcs」</span>
        </div>

        {/* Number position */}
        <div className="space-y-1.5 mb-4">
          <label className="block text-xs font-medium text-lt-sub">数字位置</label>
          <div className="flex gap-2">
            <button
              onClick={() => updateTemplate({ numberPosition: 'before' })}
              className={`flex-1 rounded-md border px-3 py-1.5 text-xs transition-all ${
                draft.quantityTemplate.numberPosition === 'before'
                  ? 'border-accent-500 bg-accent-50 text-accent-600 font-medium'
                  : 'border-lt-border bg-white text-lt-sub hover:bg-lt-hover'
              }`}
            >
              数字在前（22个）
            </button>
            <button
              onClick={() => updateTemplate({ numberPosition: 'after' })}
              className={`flex-1 rounded-md border px-3 py-1.5 text-xs transition-all ${
                draft.quantityTemplate.numberPosition === 'after'
                  ? 'border-accent-500 bg-accent-50 text-accent-600 font-medium'
                  : 'border-lt-border bg-white text-lt-sub hover:bg-lt-hover'
              }`}
            >
              数字在后（pcs22）
            </button>
          </div>
        </div>

        {/* Live preview */}
        <div className="rounded-lg bg-gray-50 p-3 mb-5">
          <span className="block text-[10px] text-lt-muted mb-1.5">预览测试</span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={previewName}
              onChange={(e) => setPreviewName(e.target.value)}
              placeholder="输入示例文件名"
              className="flex-1 min-w-0 rounded-md border border-lt-border bg-white px-2 py-1 text-xs
                         text-lt-text placeholder-lt-dim shadow-sm focus:border-accent-500 focus:outline-none
                         focus:ring-1 focus:ring-accent-500/20 transition-all"
            />
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] text-lt-muted">数量</span>
              <span className={`min-w-[28px] rounded px-1.5 py-0.5 text-center text-xs font-bold ${
                previewQty !== null ? 'bg-accent-100 text-accent-600' : 'bg-gray-200 text-lt-dim'
              }`}>
                {previewQty ?? '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs text-lt-sub hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => onSave(draft)}
            className="flex items-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-accent-700 transition-all"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
