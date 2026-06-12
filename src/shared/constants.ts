/**
 * Application-wide constants.
 * Centralises magic numbers that were previously scattered across modules.
 */

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

// ─── Export pipeline ───────────────────────────────────────────────
/** Maximum height (px) per rendering strip for large canvas export */
export const STRIP_HEIGHT = 4096;

// ─── Layout engine ─────────────────────────────────────────────────
/** Maximum canvas height (px) — bounded to prevent runaway memory */
export const MAX_CANVAS_HEIGHT = 100_000;

/** Maximum number of layout items (images × quantity) — prevents O(n²) freeze */
export const MAX_LAYOUT_ITEMS = 2000;

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
