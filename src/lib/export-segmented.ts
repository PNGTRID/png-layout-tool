/**
 * 超长画布分块多文件导出编排。
 *
 * WebView canvas 单边硬上限 32767px，印刷场景 300DPI 下可达 2000cm（236220px），
 * 整图导出会失败。本模块把画布按高度切成 ≤EXPORT_SEGMENT_MAX_PX 的多段，
 * 每段独立渲染并导出一个文件（base_part1/2/...），三种格式统一编排。
 *
 * 底层导出器零改动：
 * - PNG/TIF 传段 canvas（exportPNG/exportTIF 已接收 canvas 参数）
 * - PSD 传子 LayoutResult（canvasHeight=segH，cell.y 偏移到段局部坐标）
 */
import type { LayoutResult, LayoutCell, UploadedImage, LayoutParams } from '../shared/types';
import { EXPORT_SEGMENT_MAX_PX } from '../shared/constants';
import { exportPNG, renderStrip, cellOverlapsStrip } from './export-png';
import { exportTIF } from './export-tif';
import { exportPSD, throwIfExportAborted, type ExportProgressCallback } from './export-psd';
import { buildSegmentPaths, splitFilePath } from './path-utils';

export type SegmentedExportFormat = 'PNG' | 'PSD' | 'TIF';

/** 判定画布高度是否超过单段上限，需要垂直分块 */
export function needsVerticalSegmenting(canvasHeight: number): boolean {
  return canvasHeight > EXPORT_SEGMENT_MAX_PX;
}

/** 判定画布宽度是否超过单段上限（横向分块本次不支持） */
export function exceedsSegmentWidth(canvasWidth: number): boolean {
  return canvasWidth > EXPORT_SEGMENT_MAX_PX;
}

/**
 * 计算垂直分段后每段的起始 Y 坐标（画布绝对坐标）。
 * 段高 segH = min(EXPORT_SEGMENT_MAX_PX, totalHeight - segY)。
 */
export function computeSegmentStartYs(totalHeight: number): number[] {
  const segCount = Math.max(1, Math.ceil(totalHeight / EXPORT_SEGMENT_MAX_PX));
  return Array.from({ length: segCount }, (_, i) => i * EXPORT_SEGMENT_MAX_PX);
}

/**
 * 把整画布 layout 按 [segY, segY+segH) 切片，返回段局部的子 LayoutResult。
 *
 * - canvasWidth 不变；canvasHeight = segH
 * - cells = 与段重叠的 cell（cellOverlapsStrip 过滤）
 * - cell.y -= segY（段局部坐标，**可能为负**——图层延伸到段顶之上；
 *   PSD 图层 bounds 用有符号 i32 正确编码，合成预览 drawImage 自动裁剪）
 *
 * 横跨段边界的 cell 会同时出现在相邻两段，各显示段内可见部分，合成完整。
 */
export function sliceLayoutForSegment(layout: LayoutResult, segY: number, segH: number): LayoutResult {
  const cells: LayoutCell[] = [];
  for (const cell of layout.cells) {
    if (!cellOverlapsStrip(cell, segY, segH)) continue;
    cells.push({ ...cell, y: cell.y - segY });
  }
  return {
    canvasWidth: layout.canvasWidth,
    canvasHeight: segH,
    cells,
  };
}

/**
 * 渲染 layout 中 [segY, segY+segH) 这一段到一张全新 canvas。
 * 复用 renderStrip（含背景填充、translate 偏移、失败 cell 红色占位）。
 * 分块模式不画裁切线（横跨段边界会产生残线误导）。
 */
export async function renderSegment(
  layout: LayoutResult,
  images: UploadedImage[],
  backgroundColor: string | null,
  segY: number,
  segH: number,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  await renderStrip(canvas, layout, images, backgroundColor, segY, segH);
  return canvas;
}

/**
 * 分块多文件导出编排器（整图也走此入口，段数=1 时退化为单文件）。
 *
 * @param format 导出格式
 * @param layout 完整排版结果
 * @param images 图片列表
 * @param params 排版参数（含 dpi / backgroundColor）
 * @param basePath 用户选择的基础保存路径（多文件时自动加 _partN 后缀）
 * @param onProgress 进度回调（段级粒度：render i/segCount）
 * @returns 段数与输出目录
 * @throws 任一段失败抛出（已写入的段保留在磁盘，platformAPI 无删除能力无法回滚）
 */
export async function exportSegmented(
  format: SegmentedExportFormat,
  layout: LayoutResult,
  images: UploadedImage[],
  params: LayoutParams,
  basePath: string,
  onProgress?: ExportProgressCallback,
  abortSignal?: AbortSignal,
): Promise<{ segmentCount: number; outputDir: string }> {
  const segYs = computeSegmentStartYs(layout.canvasHeight);
  const segCount = segYs.length;

  // 横向超限且需分块时，段 canvas 宽=画布宽会撞 32767 上限——本次不支持横向分块
  if (segCount > 1 && exceedsSegmentWidth(layout.canvasWidth)) {
    throw new Error(
      `画布宽度 ${layout.canvasWidth}px 超过单段上限 ${EXPORT_SEGMENT_MAX_PX}px，横向分块暂不支持，请降低画布宽度或 DPI`,
    );
  }

  const segPaths = buildSegmentPaths(basePath, segCount);

  for (let i = 0; i < segCount; i++) {
    throwIfExportAborted(abortSignal); // 段间取消检查
    const segY = segYs[i];
    const segH = Math.min(EXPORT_SEGMENT_MAX_PX, layout.canvasHeight - segY);
    onProgress?.('render', i + 1, segCount); // 段级进度（第 i+1/segCount 段）

    try {
      if (format === 'PSD') {
        const subLayout = sliceLayoutForSegment(layout, segY, segH);
        await exportPSD(subLayout, images, params, segPaths[i], undefined, abortSignal);
      } else {
        const exporter = format === 'PNG' ? exportPNG : exportTIF;
        const segCanvas = await renderSegment(layout, images, params.backgroundColor, segY, segH);
        try {
          await exporter(segCanvas, segPaths[i], params.dpi, undefined, abortSignal);
        } finally {
          // 释放段 canvas 显存（连续 N 段累积会触发崩溃）
          segCanvas.width = 0;
          segCanvas.height = 0;
        }
      }
    } catch (err) {
      if (abortSignal?.aborted) throw err; // 用户取消：透传取消错误，不当段失败
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`第 ${i + 1}/${segCount} 段导出失败（前 ${i} 段已保存）：${reason}`, { cause: err });
    }
  }

  onProgress?.('done', 1, 1);
  return { segmentCount: segCount, outputDir: splitFilePath(basePath).dir };
}
