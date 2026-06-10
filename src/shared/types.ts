/**
 * Represents a user-uploaded image with trimming and placement metadata.
 * Contains original dimensions, transparent-border-trimmed bounds, and rendering options.
 */
export interface UploadedImage {
  /** Unique identifier for this image instance */
  id: string;
  /** Original file path (Tauri) or file name (browser) */
  filePath: string;
  /** Display name (file name) */
  name: string;
  /** Original full width in pixels */
  width: number;
  /** Original full height in pixels */
  height: number;
  /** X offset of content after trimming transparent borders */
  trimX: number;
  /** Y offset of content after trimming transparent borders */
  trimY: number;
  /** Actual content width after trimming transparent borders */
  trimWidth: number;
  /** Actual content height after trimming transparent borders */
  trimHeight: number;
  /** Number of copies to place in layout (default 1) */
  quantity: number;
  /** Manual rotation angle applied by user */
  rotation: 0 | 90 | 180 | 270;
  /** User-specified output width (cm), undefined = use natural size */
  targetWidthCm?: number;
  /** User-specified output height (cm), undefined = use natural size */
  targetHeightCm?: number;
  /** Data URL for thumbnail display */
  dataUrl: string;
  /** Object URL for full-resolution image loading (must be revoked on cleanup) */
  objectUrl: string;
}

/**
 * Parameters controlling the layout algorithm.
 * All dimensional inputs are in cm; the engine converts to pixels based on DPI.
 */
export interface LayoutParams {
  /** Uniform gap between images in cm */
  gap: number;
  /** Canvas width in cm (0 = auto-fit to content) */
  canvasWidthCm: number;
  /** Canvas height in cm (0 = auto-fit to content) */
  canvasHeightCm: number;
  /** Output resolution in dots per inch */
  dpi: number;
  /** Whether to auto-rotate tall images 90° CW for better packing */
  autoRotate: boolean;
  /** Background color (null = transparent) */
  backgroundColor: string | null;
  /** Vertical alignment mode within each row */
  alignMode: 'top' | 'center' | 'bottom';
}

/**
 * A single cell placed in the layout by the packing algorithm.
 * Each copy of an image gets a unique cellId.
 */
export interface LayoutCell {
  /** Unique per-cell identifier (different copies of same image get different ids) */
  cellId: string;
  /** Reference to the source UploadedImage id */
  imageId: string;
  /** X position in pixels */
  x: number;
  /** Y position in pixels */
  y: number;
  /** Draw width in pixels (may differ from src if rotated or scaled) */
  drawWidth: number;
  /** Draw height in pixels */
  drawHeight: number;
  /** Source image original width */
  srcWidth: number;
  /** Source image original height */
  srcHeight: number;
  /** Source image trim X offset */
  srcTrimX: number;
  /** Source image trim Y offset */
  srcTrimY: number;
  /** Source image content width after trimming */
  srcTrimWidth: number;
  /** Source image content height after trimming */
  srcTrimHeight: number;
  /** True if this cell was auto-rotated 90° CW for better packing */
  rotated: boolean;
}

/**
 * Result of the layout algorithm — canvas dimensions and placed cells.
 */
export interface LayoutResult {
  /** Total canvas width in pixels */
  canvasWidth: number;
  /** Total canvas height in pixels */
  canvasHeight: number;
  /** All placed layout cells */
  cells: LayoutCell[];
}
