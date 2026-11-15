import { contrastRatio, parseColorLiteral } from '@deckster/brand';

/**
 * The colors of a QR code.
 */
export type QrColors = {
  /**
   * The dark modules.
   */
  modules: string;

  /**
   * The light plate and quiet zone behind them.
   */
  plate: string;
};

/**
 * The colors used when a brand color cannot be read: black on white.
 */
const FALLBACK: QrColors = {
  /**
   * Black modules.
   */
  modules: '#000000',

  /**
   * A white plate.
   */
  plate: '#ffffff',
};

/**
 * Black, the reference for which of two colors is darker.
 */
const BLACK = {
  /**
   * No red.
   */
  r: 0,

  /**
   * No green.
   */
  g: 0,

  /**
   * No blue.
   */
  b: 0,

  /**
   * Fully opaque.
   */
  alpha: 1,
};

/**
 * Picks QR colors from two brand colors. Scanners read dark modules on a light plate, so the darker
 * color draws the modules whichever surface the QR sits on; a brand whose colors cannot be read
 * gives black on white.
 *
 * @param first - A brand color as `#rrggbb`, such as the surface's text color.
 * @param second - Another brand color, such as the surface's background.
 */
export function qrColors(first: string, second: string): QrColors {
  const a = parseColorLiteral(first);
  const b = parseColorLiteral(second);
  if (a === undefined || b === undefined) {
    return FALLBACK;
  }

  const isFirstDarker = contrastRatio(a, BLACK) < contrastRatio(b, BLACK);
  return isFirstDarker ? { modules: first, plate: second } : { modules: second, plate: first };
}
