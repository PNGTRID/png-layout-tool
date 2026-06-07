/**
 * Draw an image with rotation support (0, 90, 180, 270 degrees).
 * Handles the canvas transform and swapped dimensions automatically.
 *
 * @param ctx - Canvas 2D context
 * @param img - Source image element
 * @param x - Destination X position
 * @param y - Destination Y position
 * @param drawWidth - Cell bounding box width
 * @param drawHeight - Cell bounding box height
 * @param srcTrimX - Source trim X offset
 * @param srcTrimY - Source trim Y offset
 * @param srcW - Source crop width
 * @param srcH - Source crop height
 * @param rotation - Final rotation angle (0, 90, 180, or 270)
 * @param autoRotated - Whether autoRotate additionally rotated 90° CW
 */
export function drawRotatedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | CanvasImageSource,
  x: number,
  y: number,
  drawWidth: number,
  drawHeight: number,
  srcTrimX: number,
  srcTrimY: number,
  srcW: number,
  srcH: number,
  rotation: 0 | 90 | 180 | 270,
  autoRotated: boolean
): void {
  // Compute total rotation: manual + auto
  const totalRotation = ((rotation + (autoRotated ? 90 : 0)) % 360) as 0 | 90 | 180 | 270;

  ctx.save();

  switch (totalRotation) {
    case 0:
      ctx.drawImage(img, srcTrimX, srcTrimY, srcW, srcH, x, y, drawWidth, drawHeight);
      break;

    case 90:
      ctx.translate(x + drawWidth, y);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, srcTrimX, srcTrimY, srcW, srcH, 0, 0, drawHeight, drawWidth);
      break;

    case 180:
      ctx.translate(x + drawWidth, y + drawHeight);
      ctx.rotate(Math.PI);
      ctx.drawImage(img, srcTrimX, srcTrimY, srcW, srcH, 0, 0, drawWidth, drawHeight);
      break;

    case 270:
      ctx.translate(x, y + drawHeight);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(img, srcTrimX, srcTrimY, srcW, srcH, 0, 0, drawHeight, drawWidth);
      break;
  }

  ctx.restore();
}
