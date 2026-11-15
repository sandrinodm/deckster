import { oklabToRgb, oklchToOklab, rgbToOklab, type Oklch, type Rgba } from '#color/oklab.ts';

export type { Rgba } from '#color/oklab.ts';

/**
 * `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`.
 */
export const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * `oklch(L C H)` or `oklch(L C H / A)`; L and A may be percentages, H may end in `deg`. Each number
 * is digits with at most one decimal point and a bounded length (no sign, no exponent), so every
 * match reads as a finite number; {@link OKLCH_LIMITS} then bounds each channel.
 */
export const OKLCH_COLOR_PATTERN =
  /^oklch\(\s*(\d{1,3}(?:\.\d{1,12})?%?|\.\d{1,12}%?)\s+(\d{1,3}(?:\.\d{1,12})?|\.\d{1,12})\s+(\d{1,3}(?:\.\d{1,12})?|\.\d{1,12})(?:deg)?\s*(?:\/\s*(\d{1,3}(?:\.\d{1,12})?%?|\.\d{1,12}%?)\s*)?\)$/i;

/**
 * The largest value of each OKLCH channel this package reads: lightness and alpha as fractions,
 * chroma (sRGB colors stay under 0.33; wide-gamut ones are mapped in), hue in degrees.
 */
const OKLCH_LIMITS = {
  /**
   * Lightness, 0 to 1.
   */
  lightness: 1,

  /**
   * Chroma, 0 to 1.
   */
  chroma: 1,

  /**
   * Hue, 0 to 360 degrees.
   */
  hue: 360,

  /**
   * Alpha, 0 to 1.
   */
  alpha: 1,
} as const;

/**
 * Hex colors are base 16.
 */
const HEX_RADIX = 16;

/**
 * The largest value of an 8-bit channel.
 */
const CHANNEL_MAX = 255;

/**
 * Divides a percentage into a fraction.
 */
const PERCENT = 100;

/**
 * The lengths, `#` included, of the shorthand forms `#rgb` and `#rgba`.
 */
const SHORT_HEX_LENGTHS = new Set([4, 5]);

/**
 * How many hex digits `rrggbbaa` has, without the `#`; only then does the color carry alpha.
 */
const ALPHA_HEX_DIGITS = 8;

/**
 * The index of the alpha channel in a hex color's channels, after red, green and blue.
 */
const ALPHA_CHANNEL = 3;

/**
 * Parses a literal color: hex or `oklch()`. Out-of-gamut OKLCH colors are mapped into sRGB.
 *
 * @param text - The color as written in a brand.
 * @returns The color, or `undefined` when the text is not a literal color this module reads.
 */
export function parseColorLiteral(text: string): Rgba | undefined {
  const trimmed = text.trim();
  if (HEX_COLOR_PATTERN.test(trimmed)) {
    return parseHex(trimmed);
  }

  const channels = readOklch(trimmed);
  if (channels === undefined) {
    return undefined;
  }

  const lab = oklchToOklab({ l: channels.l, c: channels.c, h: channels.h });
  return oklabToRgb(lab, channels.alpha);
}

/**
 * Whether text is a hex color, or an `oklch()` color whose lightness and alpha are within 0 to 1
 * (or 0% to 100%), chroma within 0 to 1 and hue within 0 to 360 degrees. Out-of-gamut colors are
 * mapped into sRGB.
 *
 * @param text - The color as written.
 */
export function isColorLiteral(text: string): boolean {
  const trimmed = text.trim();
  if (HEX_COLOR_PATTERN.test(trimmed)) {
    return true;
  }

  return readOklch(trimmed) !== undefined;
}

/**
 * The channels of an `oklch()` color, each finite and within {@link OKLCH_LIMITS}.
 *
 * @param text - The color, trimmed.
 * @returns The channels, or `undefined` when the text is not such a color.
 */
function readOklch(text: string): (Oklch & { alpha: number }) | undefined {
  const oklch = OKLCH_COLOR_PATTERN.exec(text);
  if (oklch === null) {
    return undefined;
  }

  const [, lightness = '', chroma = '', hue = '', alpha] = oklch;
  const channels = {
    l: readFraction(lightness),
    c: Number(chroma),
    h: Number(hue),
    alpha: alpha === undefined ? 1 : readFraction(alpha),
  };
  const within =
    channels.l <= OKLCH_LIMITS.lightness &&
    channels.c <= OKLCH_LIMITS.chroma &&
    channels.h <= OKLCH_LIMITS.hue &&
    channels.alpha <= OKLCH_LIMITS.alpha;
  return within && Object.values(channels).every(Number.isFinite) ? channels : undefined;
}

/**
 * Reads a hex color produced by this package.
 *
 * @param hex - `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`.
 * @throws TypeError when the text is not hex; brand tokens are always hex, so this is a bug.
 */
export function fromHex(hex: string): Rgba {
  if (!HEX_COLOR_PATTERN.test(hex)) {
    throw new TypeError(`Expected a hex color, got "${hex}".`);
  }

  return parseHex(hex);
}

/**
 * Formats a color as lowercase `#rrggbb`, or `#rrggbbaa` when it is not opaque.
 *
 * @param color - An sRGB color; channels are clamped and rounded to 8 bits.
 * @throws TypeError when a channel is not finite, so `#NaNNaNNaN` can never be written.
 */
export function formatHex(color: Rgba): string {
  const channels = [color.r, color.g, color.b].map(toHexByte).join('');
  return color.alpha >= 1 ? `#${channels}` : `#${channels}${toHexByte(color.alpha)}`;
}

/**
 * Paints a possibly translucent color over an opaque one, as a browser would.
 *
 * @param top - The color on top.
 * @param bottom - The color underneath; its alpha is ignored.
 * @returns An opaque color.
 */
export function compositeOver(top: Rgba, bottom: Rgba): Rgba {
  /**
   * One channel of `top` over `bottom`, weighted by the top color's alpha.
   */
  const blend = (front: number, back: number): number => front * top.alpha + back * (1 - top.alpha);
  return {
    r: blend(top.r, bottom.r),
    g: blend(top.g, bottom.g),
    b: blend(top.b, bottom.b),
    alpha: 1,
  };
}

/**
 * Mixes two colors in OKLab, which keeps mixtures from turning muddy.
 *
 * @param from - The color at `amount` 0.
 * @param to - The color at `amount` 1.
 * @param amount - How far towards `to`, from 0 to 1.
 * @returns An opaque color.
 */
export function mixColors(from: Rgba, to: Rgba, amount: number): Rgba {
  const a = rgbToOklab(from);
  const b = rgbToOklab(to);
  /**
   * The value `amount` of the way from `x` to `y`.
   */
  const lerp = (x: number, y: number): number => x + (y - x) * amount;
  return oklabToRgb({ l: lerp(a.l, b.l), a: lerp(a.a, b.a), b: lerp(a.b, b.b) });
}

/**
 * Reads a hex color that already matched {@link HEX_COLOR_PATTERN}; shorthand forms have each digit
 * doubled first.
 *
 * @param hex - `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`.
 */
function parseHex(hex: string): Rgba {
  const digits = hex.slice(1);
  const full = SHORT_HEX_LENGTHS.has(hex.length)
    ? digits
        .split('')
        .map((digit) => digit + digit)
        .join('')
    : digits;
  /**
   * The channel at a position (0 is red, 3 alpha) as a fraction from 0 to 1.
   */
  const byte = (index: number): number =>
    Number.parseInt(full.slice(index * 2, index * 2 + 2), HEX_RADIX) / CHANNEL_MAX;
  return {
    r: byte(0),
    g: byte(1),
    b: byte(2),
    alpha: full.length === ALPHA_HEX_DIGITS ? byte(ALPHA_CHANNEL) : 1,
  };
}

/**
 * Reads an OKLCH lightness or alpha: a percentage such as `62%` becomes 0.62, a plain number is
 * kept as it is.
 *
 * @param text - The number as written, already matched by {@link OKLCH_COLOR_PATTERN}.
 */
function readFraction(text: string): number {
  return text.endsWith('%') ? Number(text.slice(0, -1)) / PERCENT : Number(text);
}

/**
 * One channel as two lowercase hex digits, clamped to 0..1 and rounded to 8 bits.
 *
 * @param channel - The channel as a fraction.
 */
function toHexByte(channel: number): string {
  if (!Number.isFinite(channel)) {
    throw new TypeError(`A color channel is ${channel}, not a finite number.`);
  }

  const byte = Math.round(Math.min(1, Math.max(0, channel)) * CHANNEL_MAX);
  return byte.toString(HEX_RADIX).padStart(2, '0');
}
