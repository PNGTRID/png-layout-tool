/**
 * Application-wide constants.
 * Centralises magic numbers that were previously scattered across modules.
 */

import type { QuantityTemplate } from './types';

// ─── Image processing ──────────────────────────────────────────────
/** Maximum thumbnail dimension (px) — balances quality vs memory */
export const MAX_THUMB_SIZE = 200;

/**
 * Maximum supported image dimension (px) — canvas API hard limit.
 * Images beyond this are rejected (not downscaled) to preserve quality.
 */
export const MAX_IMAGE_DIMENSION = 16384;

/** Maximum file size (MB) for import */
export const MAX_FILE_SIZE_MB = 200;

/**
 * Maximum PSD file size (MB) — PSD parsing allocates ~5× memory, so the cap is
 * lower than for plain images. Centralised here so useImages (entry guard) and
 * psd-loader agree, avoiding "passes the entry check but rejected at parse" gaps.
 */
export const MAX_PSD_SIZE_MB = MAX_FILE_SIZE_MB * 0.5;

/**
 * Maximum canvas pixel budget for PREVIEW rendering only (width × height).
 * Does NOT affect export — export always uses full resolution for print quality.
 * ~100M pixels ≈ 400MB RGBA — keeps the UI responsive without crashing.
 */
export const MAX_PREVIEW_PIXELS = 100_000_000;

// ─── Image loader ──────────────────────────────────────────────────
/** Pixel count threshold for "small" images — direct scan (no coarse phase) */
export const TRIM_SMALL_IMAGE_PIXELS = 2048 * 2048;

/** Maximum dimension for coarse scan downscale in trim detection */
export const TRIM_COARSE_MAX_DIM = 1024;

/** Minimum valid DPI read from PNG pHYs chunk */
export const MIN_VALID_DPI = 72;

/** Maximum valid DPI read from PNG pHYs chunk */
export const MAX_VALID_DPI = 2400;

// ─── Image cache ───────────────────────────────────────────────────
/** Maximum cached image entries (LRU eviction) */
export const MAX_CACHE_SIZE = 200;

// ─── TIFF loading ──────────────────────────────────────────────────
/**
 * Target sample point count for invalid-alpha detection in TIFFs (see tif-loader).
 * Sampling ~100k points keeps the heuristic fast on large images while staying
 * representative. Stride = ⌊pixelCount / target⌋.
 */
export const TIF_ALPHA_SAMPLE_TARGET = 100_000;

// ─── Export pipeline ───────────────────────────────────────────────
/** Maximum height (px) per rendering strip for large canvas export */
export const STRIP_HEIGHT = 4096;

/**
 * Maximum canvas dimension (px) per export segment. Super-tall canvases
 * (e.g. 2000cm @ 300DPI = 236220px) far exceed the WebView canvas 32767px
 * single-side hard limit, so they are split vertically into multiple files,
 * each ≤ this size. Tuned close to (but below) the limit to minimise segment
 * count; lower to 28000/25000 if a specific GPU/WebView proves unstable.
 */
export const EXPORT_SEGMENT_MAX_PX = 30000;

// ─── CMYK conversion ───────────────────────────────────────────────
/**
 * GCR（Gray Component Replacement）因子：纯中性灰（c≈m≈y）转黑版 K 的比例。
 * 1.0 = 灰成分全部转 K（暗调稳定，接近教科书 max-K）。
 */
export const CMYK_GCR_NEUTRAL = 1.0;

/**
 * GCR 因子：彩色像素的灰成分转 K 比例。低于中性值以保留彩色饱和度，
 * 避免鲜艳色因过度黑版生成而发暗。
 */
export const CMYK_GCR_COLORFUL = 0.35;

/**
 * 总墨量上限（Total Area Coverage，C+M+Y+K，范围 0–4）。3.0 = 300%，
 * 超出时四通道等比缩放，防止印刷堆墨过多糊版。
 */
export const CMYK_TAC_LIMIT = 3.0;

// ─── Layout engine ─────────────────────────────────────────────────
/** Maximum canvas height (px) — bounded to prevent runaway memory */
export const MAX_CANVAS_HEIGHT = 100_000;

/**
 * Maximum passes for the post-pack overlap verification (verifyNoOverlap).
 * Each pass fixes detected overlaps; 10 is far more than needed in practice
 * and acts as a safety bound against pathological inputs.
 */
export const OVERLAP_VERIFY_MAX_PASSES = 10;

/** Maximum number of layout items (images × quantity) — prevents O(n²) freeze */
export const MAX_LAYOUT_ITEMS = 2000;

// ─── Layout defaults ───────────────────────────────────────────────
/** Default gap between images (cm) */
export const DEFAULT_GAP_CM = 2;
/** Default canvas width (cm); 0 = auto-fit to content */
export const DEFAULT_CANVAS_WIDTH_CM = 57;
/** Default canvas height (cm); 0 = auto-fit to content */
export const DEFAULT_CANVAS_HEIGHT_CM = 0;
/** Default output resolution (DPI) */
export const DEFAULT_DPI = 300;

/**
 * Item count above which the smart-layout candidate-width search is narrowed.
 * Smart layout tries up to 4 candidate widths × 6 sort strategies = 24 pack runs;
 * beyond this threshold only the 2 most useful candidates are tried to keep the
 * UI responsive (each run is O(n·k) compact + O(n²) overlap verification).
 */
export const SMART_LAYOUT_LARGE_THRESHOLD = 500;

// ─── Canvas UI ─────────────────────────────────────────────────────
/** Zoom step for Ctrl+scroll */
export const ZOOM_STEP = 0.1;

/** Minimum zoom level */
export const ZOOM_MIN = 0.1;

/** Maximum zoom level */
export const ZOOM_MAX = 2;

/** Canvas container horizontal padding (px) */
export const CANVAS_PAD_X = 32;

/** Canvas container vertical padding (px) */
export const CANVAS_PAD_Y = 50;

/** Ruler label minimum font size (px) */
export const RULER_MIN_FONT_SIZE = 14;

/** Ruler label font size divisor (fontSize = max(MIN, canvasWidth / DIVISOR)) */
export const RULER_FONT_DIVISOR = 120;

/** Ruler dot minimum radius (px) */
export const RULER_DOT_MIN_RADIUS = 3;

/** Ruler dot radius divisor (radius = max(MIN, canvasWidth / DIVISOR)) */
export const RULER_DOT_DIVISOR = 600;

/** Selection dash minimum segment length (px) */
export const SELECTION_DASH_MIN = 4;

/** Selection dash divisor (dashLen = max(MIN, canvasWidth / DIVISOR)) */
export const SELECTION_DASH_DIVISOR = 300;

// ─── Canvas rendering colors ───────────────────────────────────────
/** Canvas error fill color (red-500) */
export const COLOR_ERROR_FILL = '#ff4444';

/** Canvas hover highlight stroke (blue-500, 40% opacity) */
export const COLOR_HOVER_STROKE = 'rgba(59, 130, 246, 0.4)';

/** Canvas selection stroke (blue-500) */
export const COLOR_SELECTION_STROKE = '#3b82f6';

/** Gap ruler line and label background (red-500) */
export const COLOR_GAP_RULER = '#ef4444';

/** Gap ruler text color (white) */
export const COLOR_GAP_RULER_TEXT = '#ffffff';

// ─── Crop marks & bleed ─────────────────────────────────────────────
/** Crop mark line length in cm */
export const CROP_MARK_LENGTH_CM = 0.5;

/** Crop mark line offset from content edge in cm */
export const CROP_MARK_OFFSET_CM = 0.3;

/** Crop mark line stroke width in px */
export const CROP_MARK_STROKE_WIDTH = 1;

/** Maximum bleed size (cm) */
export const MAX_BLEED_CM = 1;

/** Default bleed size (cm) */
export const DEFAULT_BLEED_CM = 0;

// ─── Toast ─────────────────────────────────────────────────────────
/** Auto-dismiss timeout for toast notifications (ms) */
export const TOAST_AUTO_DISMISS_MS = 4000;

/** Maximum simultaneous toast messages */
export const TOAST_MAX_COUNT = 5;

// ─── Quantity recognition ──────────────────────────────────────────
/**
 * Maximum quantity per image item — clamps both manual entry (stepper/input)
 * and auto-recognition from filenames. Total layout cells are separately
 * bounded by MAX_LAYOUT_ITEMS.
 */
export const MAX_QUANTITY_PER_IMAGE = 999;

/** Default filename-quantity template — matches common naming like 宽七-22个.png */
export const DEFAULT_QUANTITY_TEMPLATE: QuantityTemplate = {
  enabled: true,
  suffixes: '个,张,份,pcs,PSC',
  numberPosition: 'before',
};
