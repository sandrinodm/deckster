/**
 * English Metric Units per inch: PowerPoint's unit of length.
 */
export const EMU_PER_INCH = 914_400;

/**
 * The slide width in inches: PowerPoint's 16:9 widescreen size, 13.333 by 7.5 inches.
 */
export const SLIDE_WIDTH_INCHES = 13.333_333;

/**
 * The canvas width in canvas pixels; every deck renders at 1920x1080.
 */
export const CANVAS_WIDTH_PX = 1920;

/**
 * The canvas height in canvas pixels.
 */
export const CANVAS_HEIGHT_PX = 1080;

/**
 * EMU per canvas pixel. A 1920-pixel canvas on a 13.333-inch slide makes one pixel 1/144 inch, so
 * this is exactly 6350.
 */
export const EMU_PER_PX = EMU_PER_INCH / 144;

/**
 * The slide size in EMU: 12,192,000 by 6,858,000.
 */
export const SLIDE_SIZE_EMU = {
  /**
   * The width in EMU.
   */
  width: CANVAS_WIDTH_PX * EMU_PER_PX,

  /**
   * The height in EMU.
   */
  height: CANVAS_HEIGHT_PX * EMU_PER_PX,
} as const;

/**
 * Points per canvas pixel: a pixel is 1/144 inch and a point 1/72 inch.
 */
export const PT_PER_PX = 0.5;

/**
 * DrawingML font sizes and spacing store a point as one hundred integer units.
 */
const HUNDREDTHS_PER_POINT = 100;

/**
 * PowerPoint's largest font size, in hundredths of a point (4000 pt).
 */
const MAX_FONT_SIZE_HUNDREDTHS = 400_000;

/**
 * PowerPoint's smallest font size, in hundredths of a point (1 pt).
 */
const MIN_FONT_SIZE_HUNDREDTHS = 100;

/**
 * DrawingML angles are in 60,000ths of a degree.
 */
const ANGLE_UNITS_PER_DEGREE = 60_000;

/**
 * DrawingML percentages are in 1,000ths of a percent.
 */
const PERCENT_UNITS = 100_000;

/**
 * CSS gradients start at "to top", which is 90 degrees in DrawingML's counting.
 */
const CSS_TOP_DEGREES = 90;

/**
 * One full turn in degrees.
 */
const FULL_TURN_DEGREES = 360;

/**
 * Canvas pixels to EMU, rounded to a whole EMU.
 *
 * @param px - A length in canvas pixels; negative values stay negative.
 */
export function pxToEmu(px: number): number {
  return Math.round(px * EMU_PER_PX);
}

/**
 * EMU to canvas pixels.
 *
 * @param emu - A length in EMU.
 */
export function emuToPx(emu: number): number {
  return emu / EMU_PER_PX;
}

/**
 * A font size in canvas pixels as DrawingML's `sz`: hundredths of a point, clamped to the 1 to 4000
 * point range PowerPoint accepts.
 *
 * @param px - The font size in canvas pixels.
 */
export function fontSizeHundredths(px: number): number {
  const value = Math.round(px * PT_PER_PX * HUNDREDTHS_PER_POINT);
  return Math.min(MAX_FONT_SIZE_HUNDREDTHS, Math.max(MIN_FONT_SIZE_HUNDREDTHS, value));
}

/**
 * A length in canvas pixels as hundredths of a point, for letter spacing (`spc`) and exact line
 * spacing (`spcPts`).
 *
 * @param px - The length in canvas pixels.
 */
export function pointsHundredths(px: number): number {
  return Math.round(px * PT_PER_PX * HUNDREDTHS_PER_POINT);
}

/**
 * The font-independent line PowerPoint and LibreOffice set DrawingML text on, as multiples of the
 * font size: an ascent of one em and a descent of a fifth, whatever the font's own metrics say.
 * LibreOffice turns this on for every PPTX shape (`FontIndependentLineSpacing`, so editeng's
 * `ImplCalculateFontIndependentLineSpacing` makes a single line 1.2 em), and PowerPoint's single
 * spacing is the same 1.2 em. A percentage (`spcPct`) is a share of that single line, and an exact
 * spacing (`spcPts`) L puts the baseline L minus the descent below the line's top.
 */
export const FONT_INDEPENDENT_LINE = {
  /**
   * The ascent, in em.
   */
  ascent: 1,

  /**
   * The descent, in em.
   */
  descent: 0.2,
} as const;

/**
 * A CSS line height (a multiple of the font size) as DrawingML's `spcPct` value: the share of the
 * 1.2 em single line that gives the same pitch, in 1,000ths of a percent. CSS 1.2 is 100%, and CSS
 * 1.04 is about 86.7%, not 104% (which renders at 1.25 em).
 *
 * @param lineHeight - The CSS line height, such as `1.04`.
 */
export function lineSpacingPercent(lineHeight: number): number {
  const single = FONT_INDEPENDENT_LINE.ascent + FONT_INDEPENDENT_LINE.descent;
  return Math.round((lineHeight / single) * PERCENT_UNITS);
}

/**
 * Where a line set with exact spacing has its baseline, below the line's top, in canvas pixels: the
 * spacing minus the font-independent descent of its largest text.
 *
 * @param spacing - The exact line spacing in canvas pixels.
 * @param fontSize - The largest font size on the line in canvas pixels.
 */
export function exactSpacingBaseline(spacing: number, fontSize: number): number {
  return spacing - fontSize * FONT_INDEPENDENT_LINE.descent;
}

/**
 * A CSS gradient angle as a DrawingML linear angle. CSS measures from "to top" clockwise; DrawingML
 * measures from "to the right" clockwise, in 60,000ths of a degree.
 *
 * @param cssDegrees - The CSS angle in degrees; any value, wrapped into 0 to 360.
 */
export function cssAngleToDrawing(cssDegrees: number): number {
  const turned = cssDegrees - CSS_TOP_DEGREES;
  const degrees = ((turned % FULL_TURN_DEGREES) + FULL_TURN_DEGREES) % FULL_TURN_DEGREES;
  return Math.round(degrees * ANGLE_UNITS_PER_DEGREE);
}

/**
 * Degrees as DrawingML angle units.
 *
 * @param degrees - An angle in degrees.
 */
export function degreesToDrawing(degrees: number): number {
  return Math.round(degrees * ANGLE_UNITS_PER_DEGREE);
}

/**
 * A fraction from 0 to 1 as DrawingML percentage units (100,000 is 100%).
 *
 * @param fraction - The fraction; clamped to 0 to 1.
 */
export function fractionToDrawing(fraction: number): number {
  return Math.round(Math.min(1, Math.max(0, fraction)) * PERCENT_UNITS);
}

/**
 * The largest of some numbers, like `Math.max(...values)` without passing them as arguments, which
 * throws a `RangeError` for a few hundred thousand values.
 *
 * @param values - The numbers.
 * @param floor - A number that counts among them; none by default, so no values give `-Infinity`.
 */
export function maxOf(values: Iterable<number>, floor = Number.NEGATIVE_INFINITY): number {
  let largest = floor;
  for (const value of values) {
    if (value > largest || Number.isNaN(value)) {
      largest = value;
    }
  }

  return largest;
}

/**
 * The smallest of some numbers, like `Math.min(...values)` without passing them as arguments.
 *
 * @param values - The numbers.
 * @param ceiling - A number that counts among them; none by default, so no values give `Infinity`.
 */
export function minOf(values: Iterable<number>, ceiling = Number.POSITIVE_INFINITY): number {
  let smallest = ceiling;
  for (const value of values) {
    if (value < smallest || Number.isNaN(value)) {
      smallest = value;
    }
  }

  return smallest;
}
