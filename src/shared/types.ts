export interface UploadedImage {
  id: string;
  filePath: string;
  name: string;
  width: number;         // original full width
  height: number;        // original full height
  trimX: number;         // x offset of content (transparent border removed)
  trimY: number;         // y offset of content (transparent border removed)
  trimWidth: number;     // actual content width after trimming transparent borders
  trimHeight: number;    // actual content height after trimming transparent borders
  quantity: number;      // how many copies to place in layout (default 1)
  dataUrl: string;
  objectUrl: string;
}

export interface LayoutParams {
  gap: number;           // cm — uniform gap between images (both horizontal & vertical)
  canvasWidthCm: number; // 0 = auto
  canvasHeightCm: number; // 0 = auto
  dpi: number;
  autoRotate: boolean;   // auto rotate tall images 90° CW
  backgroundColor: string | null;
  alignMode: 'top' | 'center' | 'bottom';
}

export interface LayoutCell {
  imageId: string;
  x: number;
  y: number;
  drawWidth: number;
  drawHeight: number;
  srcWidth: number;
  srcHeight: number;
  srcTrimX: number;
  srcTrimY: number;
  rotated: boolean;   // true = rotated 90° CW for better packing
}

export interface LayoutResult {
  canvasWidth: number;
  canvasHeight: number;
  cells: LayoutCell[];
}
