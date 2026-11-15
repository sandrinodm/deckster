import { useSlide } from '@deckster/engine';
import tokens, { backgroundUrls, logoUrls } from 'virtual:deck/brand';

import type { BrandTokens, SurfaceTokens } from '#resolve/brand-tokens.ts';
import type { Corner } from '#schema/primitives.ts';

import { ownValue } from '#resolve/own-value.ts';
import { DEFAULT_SURFACE } from '#schema/color-schema.ts';

/**
 * The deck's brand as seen from one surface.
 */
export type BrandView = {
  /**
   * Every token of the brand: palette, gradients, type, shape, spacing, motion, data.
   */
  brand: BrandTokens;

  /**
   * The surface's resolved roles, paint, scheme, and code and diagram themes.
   */
  surface: SurfaceTokens;

  /**
   * The logo variant for this surface, with its URL and placement. `shown` is whether anything
   * draws it: the brand shows its logo (`chrome.logo.show`) and has a file for the variant. A brand
   * that hides its logo, or has none (`logo.variants: {}`), draws no logo anywhere: not in the
   * chrome, not on the cover, not in exports, and no placeholder.
   */
  logo: {
    variant: string;
    url: string;
    aspect: number;
    height: number;
    corner: Corner;
    shown: boolean;
  };
};

/**
 * The deck's brand tokens for a surface, for code outside React or outside a slide, such as chart
 * helpers or chrome that tracks the slide on screen.
 *
 * @param surface - A surface name; defaults to `default`.
 * @throws RangeError naming the brand's surfaces when the surface does not exist.
 */
export function getBrand(surface: string = DEFAULT_SURFACE): BrandView {
  const resolved = ownValue(tokens.surfaces, surface);
  if (resolved === undefined) {
    const names = Object.keys(tokens.surfaces).join(', ');
    throw new RangeError(
      `The ${tokens.name} brand has no "${surface}" surface. Use one of: ${names}.`,
    );
  }

  const variant = ownValue(tokens.logo.variants, resolved.logo);
  const url = ownValue(logoUrls, resolved.logo) ?? '';
  return {
    brand: tokens,
    surface: resolved,
    logo: {
      variant: resolved.logo,
      url,
      aspect: variant?.aspect ?? 1,
      height: tokens.logo.placement.height,
      corner: tokens.logo.placement.corner,
      shown: tokens.chrome.logo.show && variant !== undefined && url !== '',
    },
  };
}

/**
 * The URL a background layer file is served at, by the path the brand writes, such as
 * `backgrounds/paper.jpg`.
 *
 * @param file - The layer's `file`.
 * @returns The URL, or `undefined` when the brand ships no such file.
 */
export function backgroundUrl(file: string): string | undefined {
  return ownValue(backgroundUrls, file);
}

/**
 * The deck's brand tokens for the surface of the slide this component renders on, for components
 * that need raw values rather than CSS classes: charts, diagrams, canvases and Shiki.
 *
 * @returns The brand, the slide's surface tokens and its logo.
 * @throws Error when called outside a slide; use {@link getBrand} there.
 */
export function useBrand(): BrandView {
  const { frontmatter } = useSlide();
  return getBrand(frontmatter.surface ?? DEFAULT_SURFACE);
}
