import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export type ExportFormat = 'PNG' | 'PSD' | 'TIF';

/** 推送给进度浮层的结构化阶段信息 */
export interface ExportProgressPayload {
  format: ExportFormat;
  phase: string;
  current: number;
  total: number;
}

type Listener = (payload: ExportProgressPayload | null) => void;

// Imperative single-subscriber store. Module-level state + one listener means
// callers (App / export pipeline) can update progress without triggering an App
// re-render — only this overlay re-renders. Mirrors the Toast (showToast) pattern,
// so per-cell progress updates never reconcile the whole image list.
let currentPayload: ExportProgressPayload | null = null;
let listener: Listener | null = null;

/** Update or clear the export progress overlay. Pass null to hide it. */
export function setExportProgress(payload: ExportProgressPayload | null): void {
  currentPayload = payload;
  listener?.(payload);
}

/**
 * 注册 / 清除导出取消回调。App runExport 开始时注册 `() => controller.abort()`，
 * 导出结束（正常或取消）时传 null 清除。overlay 的「取消导出」按钮点击时调用当前回调。
 * 模块级变量 + 闭包读取：每次点击读到最新 handler，无需触发组件重渲染。
 */
let exportCancelHandler: (() => void) | null = null;
export function setExportCancelHandler(handler: (() => void) | null): void {
  exportCancelHandler = handler;
}

/**
 * 各导出格式在每个阶段于总进度（0-1）中所占的区间与中文标签。
 * - prepare:  导出启动 → 首次渲染前（含系统保存对话框等待），无细分，流动动画
 * - render:   带 current/total，精确推进（最耗时阶段）
 * - compress/write/save: 单次整块计算无细分，进入区间起点后用流动动画表示「处理中」
 */
const PHASE_WEIGHTS: Record<ExportFormat, Record<string, { start: number; end: number; label: string }>> = {
  PNG: {
    prepare:  { start: 0.00, end: 0.00, label: '准备导出' },
    render:   { start: 0.00, end: 0.70, label: '渲染图像' },
    compress: { start: 0.70, end: 0.90, label: '压缩图像' },
    save:     { start: 0.90, end: 1.00, label: '保存文件' },
  },
  TIF: {
    prepare:  { start: 0.00, end: 0.00, label: '准备导出' },
    render:   { start: 0.00, end: 0.70, label: '渲染图像' },
    compress: { start: 0.70, end: 0.90, label: '编码图像' },
    save:     { start: 0.90, end: 1.00, label: '保存文件' },
  },
  PSD: {
    prepare:  { start: 0.00, end: 0.00, label: '准备导出' },
    render:   { start: 0.00, end: 0.60, label: '渲染图层' },
    write:    { start: 0.60, end: 0.90, label: '生成文件' },
    save:     { start: 0.90, end: 1.00, label: '保存文件' },
  },
};

/** 计算某阶段在总进度中的百分比（0-100） */
function computePercent(format: ExportFormat, phase: string, current: number, total: number): number {
  const range = PHASE_WEIGHTS[format]?.[phase];
  if (!range) return 0;
  if (total > 0) {
    return (range.start + (range.end - range.start) * (current / total)) * 100;
  }
  return range.start * 100;
}

/**
 * 导出进度浮层。
 *
 * 全屏半透明遮罩 + 居中卡片，渲染可视化进度条，让用户在导出大图 / 多图层
 * PSD 时清楚看到进度，避免「软件卡住」的错觉。组件常驻挂载，显示/隐藏与
 * 阶段全部由 setExportProgress 命令式驱动。
 *
 * aria-label 仅含格式 + 阶段（不含逐项计数），避免每个 cell 都触发屏幕阅读器播报。
 */
export function ExportProgressOverlay() {
  const [payload, setPayload] = useState<ExportProgressPayload | null>(currentPayload);

  useEffect(() => {
    listener = setPayload;
    return () => { listener = null; };
  }, []);

  if (!payload) return null;

  const { format, phase, current, total } = payload;
  const range = PHASE_WEIGHTS[format]?.[phase];
  const indeterminate = phase !== 'render';
  const percent = computePercent(format, phase, current, total);
  const phaseLabel = range?.label ?? phase;
  const detail = indeterminate ? undefined : `${current} / ${total}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[2px] pointer-events-none"
      role="status"
      aria-live="polite"
      aria-label={`正在导出 ${format}：${phaseLabel}`}
    >
      <div className="flex w-80 flex-col gap-3 rounded-2xl border border-lt-border bg-white p-5 shadow-2xl">
        {/* 标题 */}
        <div className="flex items-center gap-2.5">
          <Loader2 className="h-4 w-4 animate-spin text-accent-500" />
          <span className="text-sm font-semibold text-lt-text">正在导出 {format}</span>
        </div>

        {/* 进度条 */}
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-lt-hover">
          {indeterminate ? (
            <div className="progress-indeterminate absolute inset-y-0 w-1/3 rounded-full bg-accent-500" />
          ) : (
            <div
              className="h-full rounded-full bg-accent-500 transition-[width] duration-150 ease-out"
              style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
            />
          )}
        </div>

        {/* 阶段描述 + 百分比 */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-lt-sub">
            {phaseLabel}
            {detail ? <span className="text-lt-muted"> · {detail}</span> : null}
          </span>
          <span className="font-medium text-accent-600">
            {indeterminate ? '处理中…' : `${Math.round(percent)}%`}
          </span>
        </div>

        {/* 取消按钮：root 为 pointer-events-none 不挡画布，按钮单独开启交互 */}
        <button
          type="button"
          onClick={() => exportCancelHandler?.()}
          className="pointer-events-auto self-end rounded-md border border-lt-border px-3 py-1 text-xs text-lt-sub transition-colors hover:bg-lt-hover hover:text-lt-text"
        >
          取消导出
        </button>
      </div>
    </div>
  );
}
