/**
 * PSD export orchestrator.
 * Uses psd-writer, cmyk, and shared image-cache modules.
 */

import type { LayoutResult, UploadedImage, LayoutParams } from '../shared/types';
import { MAX_PREVIEW_PIXELS } from '../shared/constants';
import { platformAPI } from '../shared/ipc';
import { drawRotatedImage } from './draw-rotated';
import { loadImage, clearImageCache } from './image-cache';
import { rgbaToCmyka } from './cmyk';
import { writeCmykPsd, CmykLayer } from './psd-writer';
import { getSrcCropRect } from './canvas-utils';
import { downloadBlob } from './download';

export type ExportProgressCallback = (phase: string, current: number, total: number) => void;

/** Maximum number of layer render failures before aborting the entire export */
const MAX_LAYER_FAILURES = 5;

/**
 * 检查 RGBA 数据中是否存在非不透明像素（alpha < 255）。
 * 步长 4 只遍历 alpha 通道 —— 替代 `.some((v,i)=>i%4===3&&v<255)`，后者对每个字节
 * 都执行回调（4× 冗余判断），大图层（如 3k×3k）需检查上千万次。返回值决定 PSD
 * 图层是否写入额外的 alpha 通道。
 */
function hasSemiTransparentPixel(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

/**
 * 检查取消信号，已取消则抛错（消息含「取消」，便于 friendlyErrorMessage 识别）。
 * 各导出路径在 render / strip / segment 循环顶部调用，实现中途取消 —— 抛错而非
 * 静默 return，让上层编排器（exportSegmented / App runExport）能区分取消与正常完成。
 */
export function throwIfExportAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('导出已取消');
}

export async function exportPSD(
  layout: LayoutResult,
  images: UploadedImage[],
  params: LayoutParams,
  filePath: string,
  onProgress?: ExportProgressCallback,
  abortSignal?: AbortSignal
): Promise<void> {
  // PSD 无流式实现 —— 单次全量编码（所有图层 CMYKA + composite 缓冲同时驻留）。
  // composite 已改为直接 CMYK 空间合成（psd-writer.compositeCmykaLayers），不再经 canvas /
  // RGBA 往返，故不受 MAX_PREVIEW_PIXELS 的 canvas 硬限制；但所有图层 CMYKA 仍同时驻留
  // 内存，超大画布峰值仍可能超出 WebView 限制而崩溃，故保留安全阈值并引导改用 PNG/TIF。
  const totalPixels = layout.canvasWidth * layout.canvasHeight;
  if (totalPixels > MAX_PREVIEW_PIXELS) {
    throw new Error(
      `PSD 导出画布过大（约 ${(totalPixels / 1e8).toFixed(1)} 亿像素）。PSD 为一次性全量编码，` +
      `峰值内存可能超出限制而崩溃，建议改用 PNG/TIF（支持流式）或降低画布尺寸。`,
    );
  }

  const totalCells = layout.cells.length;
  const layers: CmykLayer[] = [];

  // Clear image cache before PSD export to free memory from preview rendering
  clearImageCache();

  // Build image lookup map for O(1) access instead of O(n) find()
  const imageMap = new Map(images.map(img => [img.id, img]));
  const failedLayers: string[] = [];

  // Phase 1: Render each cell to CMYK layer (sequential to avoid memory spikes)
  for (let idx = 0; idx < layout.cells.length; idx++) {
    // Cancellation checkpoint
    throwIfExportAborted(abortSignal);

    onProgress?.('render', idx + 1, totalCells);

    const cell = layout.cells[idx];
    const imgData = imageMap.get(cell.imageId);
    if (!imgData) continue;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = cell.drawWidth;
      canvas.height = cell.drawHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      const { trimX, trimY, trimW, trimH } = getSrcCropRect(cell);
      const img = await loadImage(imgData.objectUrl);

      // Check abort after async operation
      throwIfExportAborted(abortSignal);

      drawRotatedImage(
        ctx, img,
        0, 0, cell.drawWidth, cell.drawHeight,
        trimX, trimY, trimW, trimH,
        imgData.rotation, cell.rotated
      );

      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const cmyka = rgbaToCmyka(rgba.data, canvas.width, canvas.height);
      const hasTransparency = hasSemiTransparentPixel(rgba.data);

      layers.push({
        name: imgData.name.replace(/\.[^.]+$/, ''),
        cmyka,
        width: canvas.width,
        height: canvas.height,
        left: cell.x,
        top: cell.y,
        hasTransparency,
      });

      // Release canvas + ImageData memory promptly
      canvas.width = 0;
      canvas.height = 0;
    } catch (err) {
      failedLayers.push(imgData.name);
      console.error(`[export-psd] Layer render failed: ${imgData.name}`, err);
      if (failedLayers.length >= MAX_LAYER_FAILURES) {
        throw new Error(`PSD 导出失败：超过 ${MAX_LAYER_FAILURES} 个图层渲染出错（${failedLayers.slice(0, 3).join(', ')}...）`, { cause: err });
      }
    }
  }

  // Final abort check before expensive binary write
  throwIfExportAborted(abortSignal);

  // Phase 2: Add background if needed
  let hasBackground = false;
  if (params.backgroundColor) {
    try {
      hasBackground = true;
      const bgCanvas = document.createElement('canvas');
      bgCanvas.width = layout.canvasWidth;
      bgCanvas.height = layout.canvasHeight;
      const bgCtx = bgCanvas.getContext('2d');
      if (!bgCtx) throw new Error('无法获取背景 2D 上下文');
      bgCtx.fillStyle = params.backgroundColor;
      bgCtx.fillRect(0, 0, layout.canvasWidth, layout.canvasHeight);

      const bgRgba = bgCtx.getImageData(0, 0, layout.canvasWidth, layout.canvasHeight);
      const bgCmyka = rgbaToCmyka(bgRgba.data, layout.canvasWidth, layout.canvasHeight);

      // 释放背景 canvas 显存（否则驻留至函数结束才回收）
      bgCanvas.width = 0;
      bgCanvas.height = 0;

      layers.unshift({
        name: 'Background',
        cmyka: bgCmyka,
        width: layout.canvasWidth,
        height: layout.canvasHeight,
        left: 0,
        top: 0,
        hasTransparency: false,
      });
    } catch (err) {
      console.error('[export-psd] 背景渲染失败', err);
      throw new Error('PSD 背景渲染失败：画布可能过大或内存不足，建议降低画布尺寸或改用 PNG/TIF', { cause: err });
    }
  }

  // Phase 3: Write PSD binary
  // writeCmykPsd 同步执行（RLE 压缩所有图层通道 + composite 通道），期间主线程阻塞、
  // 进度回调无法实时刷新 UI —— 用耗时/大小日志补足可观测性；真正的分阶段可见进度需
  // 把编码改为 async 分块（roadmap），同步回调即使触发也无法在阻塞期间重绘。
  onProgress?.('write', 0, 1);
  const tWrite = performance.now();
  const psdData = writeCmykPsd(layers, layout.canvasWidth, layout.canvasHeight, hasBackground, params.dpi);
  console.info(`[export-psd] PSD 编码完成: ${(psdData.length / 1024 / 1024).toFixed(1)}MB, ${Math.round(performance.now() - tWrite)}ms, ${layers.length} 图层`);

  // Phase 4: Save to disk
  onProgress?.('save', 0, 1);
  if (filePath !== '__browser_fallback__') {
    await platformAPI.writeFile(filePath, psdData);
  } else {
    const blob = new Blob([psdData.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    downloadBlob(blob, 'layout.psd');
  }

  onProgress?.('done', 1, 1);
}
