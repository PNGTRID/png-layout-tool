/**
 * 流式单文件导出编排器。
 *
 * 与 exportSegmented（分块多文件）并列：超长画布用流式编码，分条渲染 + 流式写盘，
 * 输出单个文件（不持有整文件 Uint8Array，避免 GB 级爆内存）。
 *
 * 本编排器打开 WritableFileHandle → 调格式编码器 → finally close（即使编码失败也关闭
 * 句柄，已写入部分保留磁盘——platformAPI 无删除能力，无法回滚）。
 */
import type { LayoutResult, UploadedImage, LayoutParams } from '../shared/types';
import { platformAPI } from '../shared/ipc';
import { exportPngStream } from './png-stream-encoder';
import { exportTifStream } from './tif-stream-encoder';
import type { ExportProgressCallback } from './export-psd';

export type StreamedExportFormat = 'PNG' | 'PSD' | 'TIF';

/**
 * 流式单文件导出。打开 handle → 调格式编码器 → finally close。
 * 阶段 1 仅 TIF；PNG/PSD 抛"暂不支持"（roadmap）。
 *
 * @throws 编码失败或浏览器降级（openWritable 抛"流式导出仅在桌面端可用"）
 */
export async function exportStreamed(
  format: StreamedExportFormat,
  layout: LayoutResult,
  images: UploadedImage[],
  params: LayoutParams,
  filePath: string,
  onProgress?: ExportProgressCallback,
): Promise<void> {
  // openWritable 在编码 try 之外：失败（如非桌面端抛"流式导出仅在桌面端可用"）时
  // 文件根本未创建，直接透传原始错误，避免误提示"请删除残留文件"。
  const handle = await platformAPI.openWritable(filePath);

  try {
    if (format === 'TIF') {
      await exportTifStream(layout, images, params, handle, onProgress);
    } else if (format === 'PNG') {
      await exportPngStream(layout, images, params, handle, onProgress);
    } else {
      // PSD 流式为阶段 3 roadmap
      throw new Error(`${format} 流式导出暂不支持，请降低画布高度或改用 TIF`);
    }
  } catch (err) {
    // 编码失败：platformAPI 无删除能力，磁盘已残留不完整文件 —— 提示用户手动清理
    console.error('[export-streamed] 流式导出失败，磁盘可能残留不完整文件', filePath, err);
    throw new Error(`流式导出失败，已写入部分可能不完整，请手动删除该文件后重试：${filePath}`, { cause: err });
  } finally {
    try {
      await handle.close();
    } catch (err) {
      console.error('[export-streamed] 关闭文件句柄失败', err);
    }
  }
}
