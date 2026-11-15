/**
 * Width of the logical slide canvas, in canvas pixels.
 */
export const CANVAS_WIDTH = 1920;

/**
 * Height of the logical slide canvas, in canvas pixels.
 */
export const CANVAS_HEIGHT = 1080;

/**
 * A width and height in CSS pixels.
 */
export type Size = {
  /**
   * Width in CSS pixels; negative values count as 0.
   */
  width: number;

  /**
   * Height in CSS pixels; negative values count as 0.
   */
  height: number;
};

/**
 * How to place the canvas in a viewport: a uniform scale and the letterbox offsets.
 */
export type CanvasFit = {
  /**
   * CSS pixels per canvas pixel; 0 when the viewport has no area.
   */
  scale: number;

  /**
   * Left offset of the scaled canvas in CSS pixels.
   */
  offsetX: number;

  /**
   * Top offset of the scaled canvas in CSS pixels.
   */
  offsetY: number;
};

/**
 * Scales the canvas to the largest size that fits the viewport without cropping, centred, with
 * letterbox or pillarbox bars on the remaining sides.
 *
 * @param viewport - The space available, in CSS pixels.
 * @param canvas - The logical canvas size; defaults to 1920x1080.
 * @returns The fit; a viewport with no area gives scale 0 rather than a negative or NaN scale.
 */
export function fitCanvas(
  viewport: Size,
  canvas: Size = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
): CanvasFit {
  const width = Math.max(0, viewport.width);
  const height = Math.max(0, viewport.height);
  const scale = Math.min(width / canvas.width, height / canvas.height);
  return {
    scale,
    offsetX: (width - canvas.width * scale) / 2,
    offsetY: (height - canvas.height * scale) / 2,
  };
}
