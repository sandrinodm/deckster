import type { BrandTokens, SurfaceTokens } from '@deckster/brand';

import { DEFAULT_SURFACE, typeScaleFacts } from '@deckster/brand';

import type { BrandContext, BrandValues } from '#lint/types.ts';

import { COLOR_CHANNEL_TOLERANCE, TOKEN_SIZE_TOLERANCE_PX } from '#lint/limits.ts';

/**
 * Matches a hex color, capturing the six digits of its RGB part.
 */
const HEX_RGB_PATTERN = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i;

/**
 * Hex colors are base 16.
 */
const HEX_RADIX = 16;

/**
 * Each 8-bit color channel is written as two hex digits.
 */
const HEX_DIGITS_PER_CHANNEL = 2;

/**
 * Matches each hex color inside a CSS value, such as a shadow.
 */
const HEX_IN_CSS_PATTERN = /#[0-9a-f]{6}(?:[0-9a-f]{2})?\b/gi;

/**
 * The brand resolved for one surface. An unknown surface falls back to the default one (the build
 * rejects unknown surfaces, so this only happens for hand-built input).
 *
 * @param name - The brand folder name.
 * @param tokens - The brand's resolved tokens.
 * @param surfaceName - The slide's surface.
 */
export function brandContext(name: string, tokens: BrandTokens, surfaceName: string): BrandContext {
  const surface =
    (Object.hasOwn(tokens.surfaces, surfaceName) ? tokens.surfaces[surfaceName] : undefined) ??
    defaultSurface(tokens);
  return {
    name,
    tokens,
    typeScale: typeScaleFacts(tokens.typography.scale),
    surface,
    allowed: brandValues(tokens, surface),
  };
}

/**
 * The 8-bit RGB channels of a hex color, alpha ignored.
 *
 * @param hex - `#rrggbb` or `#rrggbbaa`.
 * @returns The channels, or `undefined` for anything else.
 */
export function rgbChannels(hex: string): [number, number, number] | undefined {
  const digits = HEX_RGB_PATTERN.exec(hex)?.[1];
  if (digits === undefined) {
    return undefined;
  }

  /**
   * One channel of the hex color.
   *
   * @param index - 0 for red, 1 for green, 2 for blue.
   */
  const channel = (index: number) => {
    const start = index * HEX_DIGITS_PER_CHANNEL;
    return Number.parseInt(digits.slice(start, start + HEX_DIGITS_PER_CHANNEL), HEX_RADIX);
  };
  return [channel(0), channel(1), channel(2)];
}

/**
 * Whether a color is one of the brand's, allowing for rounding.
 *
 * @param hex - The color, `#rrggbb` or `#rrggbbaa`; alpha is ignored, so `text-fg/60` is `fg`.
 * @param colors - The brand's colors.
 */
export function isBrandColor(hex: string, colors: readonly string[]): boolean {
  const own = rgbChannels(hex);
  if (own === undefined) {
    return true;
  }

  return colors.some((color) => {
    const token = rgbChannels(color);
    return (
      token !== undefined &&
      own.every(
        (channel, index) => Math.abs(channel - (token[index] ?? 0)) <= COLOR_CHANNEL_TOLERANCE,
      )
    );
  });
}

/**
 * Whether a length is one of the brand's tokens, allowing for rounding.
 *
 * @param value - A length in canvas pixels.
 * @param tokens - The token lengths.
 */
export function isTokenSize(value: number, tokens: readonly number[]): boolean {
  return tokens.some((token) => Math.abs(token - value) <= TOKEN_SIZE_TOLERANCE_PX);
}

/**
 * The brand's default surface; every brand has one.
 *
 * @param tokens - The brand's resolved tokens.
 */
function defaultSurface(tokens: BrandTokens): SurfaceTokens {
  const surface = tokens.surfaces[DEFAULT_SURFACE] ?? Object.values(tokens.surfaces)[0];
  if (surface === undefined) {
    throw new Error(`Brand "${tokens.name}" has no surfaces.`);
  }

  return surface;
}

/**
 * The values a brand allows on one surface.
 *
 * @param tokens - The brand's resolved tokens.
 * @param surface - The surface.
 */
function brandValues(tokens: BrandTokens, surface: SurfaceTokens): BrandValues {
  const { data } = surface;
  const surfaceColors = [
    ...Object.values(surface.roles),
    ...Object.values(surface.text),
    ...surface.backdrop,
    ...Object.values(surface.code),
    ...Object.values(surface.diagram),
    ...Object.values(surface.charts),
    ...data.categorical,
    ...data.sequential,
    ...data.diverging,
    data.context,
    data.plate,
    ...Object.values(surface.shadow).flatMap((shadow) => shadow.layers.map((layer) => layer.color)),
    ...(surface.background.match(HEX_IN_CSS_PATTERN) ?? []),
    ...surface.layers.flatMap((layer) =>
      layer.type === 'image' && layer.tint !== undefined ? [layer.tint.color] : [],
    ),
  ];
  const brandColors = [
    ...Object.values(tokens.palette).flatMap((steps) => Object.values(steps)),
    ...Object.values(tokens.gradients).flatMap((gradient) => gradient.colors),
  ];
  const { scale, margin, grid } = tokens.spacing;
  return {
    colors: [...new Set([...surfaceColors, ...brandColors].map((color) => color.toLowerCase()))],
    families: [...new Set(Object.values(tokens.typography.families).map(({ family }) => family))],
    fontSizes: typeScaleFacts(tokens.typography.scale).sizes,
    spacing: [...new Set([...Object.values(scale), margin.x, margin.y, grid.gutter])].sort(
      (a, b) => a - b,
    ),
  };
}
