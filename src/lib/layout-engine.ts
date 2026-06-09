import { UploadedImage, LayoutParams, LayoutResult, LayoutCell } from '../shared/types';
import { MAX_CANVAS_HEIGHT, MAX_LAYOUT_ITEMS } from '../shared/constants';

/** 将 cm 转换为像素（基于 DPI） */
export function cmToPx(cm: number, dpi: number): number {
  return Math.round(cm * dpi / 2.54);
}

/** 将像素转换为 cm */
export function pxToCmValue(px: number, dpi: number): number {
  return px * 2.54 / dpi;
}

/** 获取图片的有效排版尺寸（考虑用户自定义 cm 尺寸和旋转） */
function getEffectiveDimensions(
  img: UploadedImage,
  dpi: number
): { w: number; h: number } {
  let baseW: number;
  let baseH: number;

  if (img.targetWidthCm !== undefined && img.targetHeightCm !== undefined) {
    baseW = cmToPx(img.targetWidthCm, dpi);
    baseH = cmToPx(img.targetHeightCm, dpi);
  } else {
    baseW = img.trimWidth;
    baseH = img.trimHeight;
  }

  // Rotation 90 or 270 swaps width and height
  if (img.rotation === 90 || img.rotation === 270) {
    return { w: baseH, h: baseW };
  }
  return { w: baseW, h: baseH };
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
 * Best Short Side Fit (BSSF) heuristic with area awareness.
 * Prefers free rectangles where the item fits most tightly
 * (smallest leftover on the shorter side), with area utilization
 * as a tiebreaker to prefer placements that waste less space.
 */
function findBestBSSF(
  freeRects: FreeRect[],
  itemW: number,
  itemH: number,
  canvasW: number
): { x: number; y: number; shortSide: number; longSide: number; areaFit: number } | null {
  let best: { x: number; y: number; shortSide: number; longSide: number; areaFit: number } | null = null;

  for (const fr of freeRects) {
    // Item must fit within canvas width
    if (fr.x + itemW > canvasW) continue;
    // Item must fit within this free rectangle
    if (itemW > fr.w || itemH > fr.h) continue;

    const leftW = fr.w - itemW;
    const leftH = fr.h - itemH;
    const shortSide = Math.min(leftW, leftH);
    const longSide = Math.max(leftW, leftH);
    // Area fit: ratio of item area to free rect area (higher = less wasted space)
    const areaFit = (itemW * itemH) / (fr.w * fr.h);

    if (!best ||
        shortSide < best.shortSide ||
        (shortSide === best.shortSide && longSide < best.longSide) ||
        (shortSide === best.shortSide && longSide === best.longSide && areaFit > best.areaFit)) {
      best = { x: fr.x, y: fr.y, shortSide, longSide, areaFit };
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
  copyIndex: number;  // which copy of this image (0-based)
  w: number;
  h: number;
}

/** Simple monotonic counter for unique cellId generation */
interface IdCounter { value: number; }

/**
 * Score a fit for a given orientation — lower is better.
 * Combines BSSF tightness with area-efficiency to prefer placements
 * that waste less space.
 *
 * Uses the areaFit ratio (0–1) already computed by findBestBSSF.
 */
function scoreFit(
  fit: { shortSide: number; longSide: number; areaFit: number } | null
): number {
  if (!fit) return Infinity;
  // BSSF component: tighter fit = lower score
  const tightness = fit.shortSide * 2 + fit.longSide;
  // Weighted combination: 70% tightness, 30% area efficiency
  // areaFit is already 0–1 (higher = better fill), so invert for scoring
  return tightness * (1.3 - 0.3 * fit.areaFit);
}

/**
 * Run one MaxRects BSSF pass with the given item order.
 * When autoRotate is enabled, evaluates both orientations and picks
 * the one that scores better on combined tightness + area utilization.
 * Returns the placed cells.
 */
function packOneStrategy(
  items: PackItem[],
  canvasW: number,
  gapPx: number,
  autoRotate: boolean,
  idCounter: IdCounter
): LayoutCell[] {
  const freeRects: FreeRect[] = [{ x: 0, y: 0, w: canvasW, h: MAX_CANVAS_HEIGHT }];
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
    let bestScore = scoreFit(origFit);

    // Rotated orientation (swap w ↔ h) — skip if user already set manual rotation
    if (autoRotate && item.w !== item.h && item.img.rotation === 0) {
      let rotW = item.h;
      let rotH = item.w;
      if (rotW > canvasW) {
        const s = canvasW / rotW;
        rotW = canvasW;
        rotH = Math.round(item.w * s);
      }
      const rotFit = findBestBSSF(freeRects, rotW, rotH, canvasW);
      if (rotFit) {
        const rotScore = scoreFit(rotFit);
        if (rotScore < bestScore) {
          bestW = rotW;
          bestH = rotH;
          bestFit = rotFit;
          bestRotated = true;
          bestScore = rotScore;
        }
      }
    }

    if (!bestFit) continue;

    cells.push({
      cellId: `cell-${idCounter.value++}`,
      imageId: item.img.id,
      x: Math.round(bestFit.x),
      y: Math.round(bestFit.y),
      drawWidth: bestW,
      drawHeight: bestH,
      srcWidth: item.img.width,
      srcHeight: item.img.height,
      srcTrimX: item.img.trimX,
      srcTrimY: item.img.trimY,
      srcTrimWidth: item.img.trimWidth,
      srcTrimHeight: item.img.trimHeight,
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
 *
 * Optimized with sweep-line approach:
 * 1. Sort cells by Y (top to bottom)
 * 2. Maintain a set of "active" cells that could overlap vertically
 * 3. For each cell, only check active cells for horizontal overlap
 * This reduces from O(n²) to ~O(n · k) where k is the average
 * number of vertically overlapping cells (typically much < n).
 */
function compactCells(cells: LayoutCell[], gapPx: number): void {
  if (cells.length <= 1) return;

  // Sort by original Y then X for stable processing
  cells.sort((a, b) => a.y - b.y || a.x - b.x);

  // Use an array as a sliding window of active cells.
  // Since cells are processed top-to-bottom, once a cell's bottom + gap
  // is above the current cell's candidate Y, it can never block any
  // subsequent cell → safe to remove from the active set.
  const active: LayoutCell[] = [];

  for (const cell of cells) {
    let candidateY = 0;

    // Check all active cells for horizontal overlap
    let writeIdx = 0;
    for (let i = 0; i < active.length; i++) {
      const other = active[i];
      const otherBottom = other.y + other.drawHeight;

      // If this active cell's bottom is at or above candidate Y (with gap),
      // it might still block. Keep it. Otherwise it's too far above to
      // matter for any future cell (since we process top-to-bottom).
      if (otherBottom + gapPx > candidateY) {
        // Check horizontal overlap
        const cellRight = cell.x + cell.drawWidth;
        const otherRight = other.x + other.drawWidth;
        if (cell.x < otherRight + gapPx && other.x < cellRight + gapPx) {
          const blockedY = otherBottom + gapPx;
          if (blockedY > candidateY) {
            candidateY = blockedY;
          }
        }
        // Keep this active cell (it's still relevant)
        active[writeIdx++] = other;
      }
      // else: this active cell is too far above to matter → drop it
    }
    active.length = writeIdx;

    cell.y = candidateY;
    active.push(cell);
  }
}

// ─── Public API ─────────────────────────────────────────────────────

export interface LayoutWarning {
  type: 'overflow' | 'unplaced';
  message: string;
}

export interface LayoutResultWithWarnings extends LayoutResult {
  warnings: LayoutWarning[];
}

export function calculateLayout(images: UploadedImage[], params: LayoutParams): LayoutResultWithWarnings {
  if (images.length === 0) {
    return { canvasWidth: 0, canvasHeight: 0, cells: [], warnings: [] };
  }

  const t0 = performance.now();
  const warnings: LayoutWarning[] = [];

  const gapPx = cmToPx(params.gap, params.dpi);

  // 1. Expand images by quantity — each copy gets its own index
  const expanded: { img: UploadedImage; copyIndex: number }[] = [];
  for (const img of images) {
    const count = img.quantity || 1;
    for (let n = 0; n < count; n++) {
      if (expanded.length >= MAX_LAYOUT_ITEMS) break;
      expanded.push({ img, copyIndex: n });
    }
    if (expanded.length >= MAX_LAYOUT_ITEMS) break;
  }

  if (expanded.length >= MAX_LAYOUT_ITEMS) {
    const totalRequested = images.reduce((sum, img) => sum + (img.quantity || 1), 0);
    warnings.push({
      type: 'unplaced',
      message: `图片数量过多（${totalRequested}），已截断为前 ${MAX_LAYOUT_ITEMS} 张`,
    });
  }

  // 2. Determine canvas width
  let canvasWidthPx: number;
  if (params.canvasWidthCm > 0) {
    canvasWidthPx = cmToPx(params.canvasWidthCm, params.dpi);
  } else {
    canvasWidthPx = expanded.reduce((sum, { img }) => sum + img.trimWidth, 0) +
      gapPx * Math.max(expanded.length - 1, 0);
  }

  // 3. Prepare items — use target dimensions if set
  const items: PackItem[] = expanded.map(({ img, copyIndex }) => {
    const { w, h } = getEffectiveDimensions(img, params.dpi);
    return { img, copyIndex, w, h };
  });

  // Create local ID counter (avoids module-level mutable state)
  const idCounter: IdCounter = { value: 0 };

  // 4. Try multiple sorting strategies — pick the most compact result
  const strategies: { name: string; items: PackItem[] }[] = [
    { name: 'area',      items: [...items].sort((a, b) => (b.w * b.h) - (a.w * a.h)) },
    { name: 'maxSide',   items: [...items].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h)) },
    { name: 'width',     items: [...items].sort((a, b) => b.w - a.w) },
    { name: 'height',    items: [...items].sort((a, b) => b.h - a.h) },
    { name: 'perimeter', items: [...items].sort((a, b) => (b.w + b.h) - (a.w + a.h)) },
    { name: 'aspect',    items: [...items].sort((a, b) => {
      const ratioA = Math.max(a.w, a.h) / Math.max(1, Math.min(a.w, a.h));
      const ratioB = Math.max(b.w, b.h) / Math.max(1, Math.min(b.w, b.h));
      return ratioB - ratioA;  // most elongated first — benefits most from rotation
    })},
  ];

  let bestCells: LayoutCell[] = [];
  let bestHeight = Infinity;
  let bestStrategy = '';

  for (const strategy of strategies) {
    // Reset counter for each strategy to get comparable ids
    idCounter.value = 0;
    const cells = packOneStrategy(strategy.items, canvasWidthPx, gapPx, params.autoRotate, idCounter);
    compactCells(cells, gapPx);

    // Use reduce to avoid Math.max(...array) stack overflow on large arrays
    const height = cells.reduce((max, c) => Math.max(max, c.y + c.drawHeight), 0);

    if (height < bestHeight) {
      bestHeight = height;
      bestCells = cells;
      bestStrategy = strategy.name;
    }
  }

  // Check for unplaced items
  if (bestCells.length < items.length) {
    warnings.push({
      type: 'unplaced',
      message: `${items.length - bestCells.length}/${items.length} 张图片无法放入画布`,
    });
  }

  // 5. Fixed canvas height → center vertically, check overflow
  if (params.canvasHeightCm > 0) {
    const targetH = cmToPx(params.canvasHeightCm, params.dpi);
    if (bestHeight > targetH) {
      warnings.push({
        type: 'overflow',
        message: `内容高度 (${pxToCmValue(bestHeight, params.dpi).toFixed(1)} cm) 超出画布高度 (${params.canvasHeightCm} cm)`,
      });
    } else if (bestHeight < targetH) {
      const offset = Math.round((targetH - bestHeight) / 2);
      bestCells.forEach(c => { c.y += offset; });
    }
    const elapsed = (performance.now() - t0).toFixed(1);
    console.info(`[layout] strategy=${bestStrategy}, ${bestCells.length} cells, ${elapsed}ms, warnings=${warnings.length}`);
    return { canvasWidth: canvasWidthPx, canvasHeight: targetH, cells: bestCells, warnings };
  }

  const elapsed = (performance.now() - t0).toFixed(1);
  console.info(`[layout] strategy=${bestStrategy}, ${bestCells.length} cells, ${elapsed}ms, warnings=${warnings.length}`);
  return { canvasWidth: canvasWidthPx, canvasHeight: Math.round(bestHeight), cells: bestCells, warnings };
}
