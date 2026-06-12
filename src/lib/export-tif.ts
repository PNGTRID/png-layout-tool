/**
 * TIFF export pipeline.
 * Encodes a rendered canvas into an RGBA TIFF (transparency preserved) via UTIF.
 *
 * MEMORY NOTE: getImageData reads the whole canvas into JS memory, so for canvases
 * near the 100M-pixel preview budget the peak footprint is roughly 2× the canvas
 * backing store. Prefer PNG/PSD for extremely large exports.
 */
import UTIF from 'utif';
import type { ExportProgressCallback } from './export-psd';
import { platformAPI } from '../shared/ipc';
import { downloadBlob } from './download';

/**
 * Export a rendered canvas to a TIFF file (RGBA, transparency preserved).
 * DPI is embedded via TIFF resolution tags when the metadata shape is accepted.
 */
export async function exportTIF(
  canvas: HTMLCanvasElement,
  filePath: string,
  dpi: number,
  onProgress?: ExportProgressCallback,
): Promise<void> {
  onProgress?.('compress', 0, 1);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d context');

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);

  // Embed DPI as TIFF resolution tags: ResolutionUnit=inch, X/YResolution RATIONAL.
  // NOTE: UTIF writes every RATIONAL value as val*10000/10000 (see UTIF._writeIFD),
  // and uses the array LENGTH as the tag's count. TIFF requires XResolution/
  // YResolution to have count=1, so we pass a single-element array — UTIF stores it
  // as the rational dpi*10000/10000, which decodes back to exactly `dpi`.
  const metadata = {
    't296': [2],          // ResolutionUnit: 2 = inch
    't282': [dpi],        // XResolution RATIONAL (count=1)
    't283': [dpi],        // YResolution RATIONAL (count=1)
  };

  let buffer: ArrayBuffer;
  try {
    buffer = UTIF.encodeImage(imageData.data.buffer, width, height, metadata);
  } catch (err) {
    // Fallback: retry without metadata if the rational tag shape is rejected
    console.warn('[export-tif] DPI metadata rejected, exporting without resolution tags', err);
    buffer = UTIF.encodeImage(imageData.data.buffer, width, height);
  }

  onProgress?.('save', 0, 1);
  const bytes = new Uint8Array(buffer);
  if (filePath !== '__browser_fallback__') {
    await platformAPI.writeFile(filePath, bytes);
  } else {
    downloadBlob(new Blob([bytes], { type: 'image/tiff' }), 'layout.tif');
  }

  onProgress?.('done', 1, 1);
}
