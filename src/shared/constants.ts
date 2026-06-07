/**
 * Application-wide constants.
 * Centralises magic numbers that were previously scattered across modules.
 */

// ─── Image processing ──────────────────────────────────────────────
/** Maximum thumbnail dimension (px) — balances quality vs memory */
export const MAX_THUMB_SIZE = 200;

/** Maximum supported image dimension (px) — canvas API limit */
export const MAX_IMAGE_DIMENSION = 16384;

/** Maximum file size (MB) for import */
export const MAX_FILE_SIZE_MB = 200;

// ─── Layout engine ─────────────────────────────────────────────────
/** Maximum canvas height (px) — bounded to prevent runaway memory */
export const MAX_CANVAS_HEIGHT = 100_000;

/** Maximum number of layout items (images × quantity) — prevents O(n²) freeze */
export const MAX_LAYOUT_ITEMS = 2000;

// ─── Canvas UI ─────────────────────────────────────────────────────
/** Zoom step for Ctrl+scroll */
export const ZOOM_STEP = 0.1;

/** Minimum zoom level */
export const ZOOM_MIN = 0.1;

/** Maximum zoom level */
export const ZOOM_MAX = 2;

// ─── Toast ─────────────────────────────────────────────────────────
/** Auto-dismiss timeout for toast notifications (ms) */
export const TOAST_AUTO_DISMISS_MS = 4000;

/** Maximum simultaneous toast messages */
export const TOAST_MAX_COUNT = 5;
