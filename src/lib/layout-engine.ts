import { UploadedImage, LayoutParams, LayoutResult, LayoutCell } from '../shared/types';

/** 将 cm 转换为像素（基于 DPI） */
function cmToPx(cm: number, dpi: number): number {
  return Math.round(cm * dpi / 2.54);
}

// ─── MaxRects data structures ───────────────────────────────────────

interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Check if `outer` fully contains `inner` */
function containsRect(outer: FreeRect, inner: FreeRect): boolean {
  return outer.x <= inner.x && outer.y <= inner.y &&
         outer.x + outer.w >= inner.x + inner.w &&
         outer.y + outer.h >= inner.y + inner.h;
}

/**
 * Best Short Side Fit (BSSF) heuristic — the gold standard for
 * irregular rectangle packing.  Prefers free rectangles where the
 * item fits most tightly (smallest leftover on the shorter side).
 */
function findBestBSSF(
  freeRects: FreeRect[],
  itemW: number,
  itemH: number,
  canvasW: number
): { x: number; y: number; shortSide: number; longSide: number } | null {
  let best: { x: number; y: number; shortSide: number; longSide: number } | null = null;

  for (const fr of freeRects) {
    // Item must fit within canvas width
    if (fr.x + itemW > canvasW) continue;
    // Item must fit within this free rectangle
    if (itemW > fr.w || itemH > fr.h) continue;

    const leftW = fr.w - itemW;
    const leftH = fr.h - itemH;
    const shortSide = Math.min(leftW, leftH);
    const longSide = Math.max(leftW, leftH);

    if (!best ||
        shortSide < best.shortSide ||
        (shortSide === best.shortSide && longSide < best.longSide)) {
      best = { x: fr.x, y: fr.y, shortSide, longSide };
    }
  }

  return best;
}

/**
 * Place an item and split all overlapping free rectangles into
 * maximal non-overlapping parts (standard MaxRects split).
 */
function placeAndSplit(
  freeRects: FreeRect[],
  px: number,
  py: number,
  pw: number,
  ph: number
): void {
  const newFree: FreeRect[] = [];

  for (const fr of freeRects) {
    // No overlap → keep as-is
    if (px >= fr.x + fr.w || px + pw <= fr.x ||
        py >= fr.y + fr.h || py + ph <= fr.y) {
      newFree.push(fr);
      continue;
    }

    // Split into up to 4 maximal rectangles around the placed region
    if (px > fr.x) {                                       // Left remainder
      newFree.push({ x: fr.x, y: fr.y, w: px - fr.x, h: fr.h });
    }
    if (px + pw < fr.x + fr.w) {                           // Right remainder
      newFree.push({ x: px + pw, y: fr.y, w: fr.x + fr.w - px - pw, h: fr.h });
    }
    if (py > fr.y) {                                       // Top remainder
      newFree.push({ x: fr.x, y: fr.y, w: fr.w, h: py - fr.y });
    }
    if (py + ph < fr.y + fr.h) {                           // Bottom remainder
      newFree.push({ x: fr.x, y: py + ph, w: fr.w, h: fr.y + fr.h - py - ph });
    }
  }

  // Remove rectangles fully contained within another (redundant)
  freeRects.length = 0;
  for (let i = 0; i < newFree.length; i++) {
    let redundant = false;
    for (let j = 0; j < newFree.length; j++) {
      if (i !== j && containsRect(newFree[j], newFree[i])) {
        redundant = true;
        break;
      }
    }
    if (!redundant) freeRects.push(newFree[i]);
  }
}

// ─── Packing core ───────────────────────────────────────────────────

interface PackItem {
  img: UploadedImage;
  w: number;
  h: number;
}

/**
 * Run one MaxRects BSSF pass with the given item order.
 * Returns the placed cells.
 */
function packOneStrategy(
  items: PackItem[],
  canvasW: number,
  gapPx: number,
  autoRotate: boolean
): LayoutCell[] {
  const VERY_TALL = 1_000_000_000;
  const freeRects: FreeRect[] = [{ x: 0, y: 0, w: canvasW, h: VERY_TALL }];
  const cells: LayoutCell[] = [];

  for (const item of items) {
    // Original orientation
    let drawW = item.w;
    let drawH = item.h;
    if (drawW > canvasW) {
      const s = canvasW / drawW;
      drawW = canvasW;
      drawH = Math.round(item.h * s);
    }

    const origFit = findBestBSSF(freeRects, drawW, drawH, canvasW);
    let bestW = drawW, bestH = drawH, bestFit = origFit, bestRotated = false;

    // Rotated orientation (swap w ↔ h)
    if (autoRotate && item.w !== item.h) {
      let rotW = item.h;
      let rotH = item.w;
      if (rotW > canvasW) {
        const s = canvasW / rotW;
        rotW = canvasW;
        rotH = Math.round(item.w * s);
      }
      const rotFit = findBestBSSF(freeRects, rotW, rotH, canvasW);
      if (rotFit && (!bestFit ||
          rotFit.shortSide < bestFit.shortSide ||
          (rotFit.shortSide === bestFit.shortSide && rotFit.longSide < bestFit.longSide))) {
        bestW = rotW;
        bestH = rotH;
        bestFit = rotFit;
        bestRotated = true;
      }
    }

    if (!bestFit) continue;

    cells.push({
      imageId: item.img.id,
      x: Math.round(bestFit.x),
      y: Math.round(bestFit.y),
      drawWidth: bestW,
      drawHeight: bestH,
      srcWidth: item.img.width,
      srcHeight: item.img.height,
      srcTrimX: item.img.trimX,
      srcTrimY: item.img.trimY,
      rotated: bestRotated,
    });

    // Reserve item area + gap to the right & bottom
    placeAndSplit(freeRects, bestFit.x, bestFit.y, bestW + gapPx, bestH + gapPx);
  }

  return cells;
}

/**
 * Post-placement vertical compaction:
 * Try to slide each cell upward as far as possible without
 * overlapping previously-compacted cells.
 */
function compactCells(cells: LayoutCell[], gapPx: number): void {
  // Process from top to bottom
  cells.sort((a, b) => a.y - b.y || a.x - b.x);

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    let minY = 0;

    for (let j = 0; j < i; j++) {
      const other = cells[j];
      // Check horizontal overlap (with gap)
      if (cell.x < other.x + other.drawWidth + gapPx &&
          cell.x + cell.drawWidth + gapPx > other.x) {
        minY = Math.max(minY, other.y + other.drawHeight + gapPx);
      }
    }

    cell.y = minY;
  }
}

// ─── Public API ─────────────────────────────────────────────────────

export function calculateLayout(images: UploadedImage[], params: LayoutParams): LayoutResult {
  if (images.length === 0) {
    return { canvasWidth: 0, canvasHeight: 0, cells: [] };
  }

  const gapPx = cmToPx(params.gap, params.dpi);

  // 1. Expand images by quantity
  const expanded: UploadedImage[] = [];
  for (const img of images) {
    const count = img.quantity || 1;
    for (let n = 0; n < count; n++) expanded.push(img);
  }

  // 2. Determine canvas width
  let canvasWidthPx: number;
  if (params.canvasWidthCm > 0) {
    canvasWidthPx = cmToPx(params.canvasWidthCm, params.dpi);
  } else {
    canvasWidthPx = expanded.reduce((sum, img) => sum + img.trimWidth, 0) +
      gapPx * Math.max(expanded.length - 1, 0);
  }

  // 3. Prepare items
  const items: PackItem[] = expanded.map(img => ({
    img,
    w: img.trimWidth,
    h: img.trimHeight,
  }));

  // 4. Try multiple sorting strategies — pick the most compact result
  const strategies: { name: string; items: PackItem[] }[] = [
    { name: 'area',    items: [...items].sort((a, b) => (b.w * b.h) - (a.w * a.h)) },
    { name: 'maxSide', items: [...items].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h)) },
    { name: 'width',   items: [...items].sort((a, b) => b.w - a.w) },
    { name: 'height',  items: [...items].sort((a, b) => b.h - a.h) },
  ];

  let bestCells: LayoutCell[] = [];
  let bestHeight = Infinity;

  for (const strategy of strategies) {
    const cells = packOneStrategy(strategy.items, canvasWidthPx, gapPx, params.autoRotate);
    compactCells(cells, gapPx);

    const height = cells.length > 0
      ? Math.max(...cells.map(c => c.y + c.drawHeight))
      : 0;

    if (height < bestHeight) {
      bestHeight = height;
      bestCells = cells;
    }
  }

  // 5. Fixed canvas height → center vertically
  if (params.canvasHeightCm > 0) {
    const targetH = cmToPx(params.canvasHeightCm, params.dpi);
    if (bestHeight < targetH) {
      const offset = Math.round((targetH - bestHeight) / 2);
      bestCells.forEach(c => { c.y += offset; });
    }
    return { canvasWidth: canvasWidthPx, canvasHeight: targetH, cells: bestCells };
  }

  return { canvasWidth: canvasWidthPx, canvasHeight: Math.round(bestHeight), cells: bestCells };
}
