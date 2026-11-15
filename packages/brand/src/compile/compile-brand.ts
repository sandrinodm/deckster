import type { BrandTokens } from '#resolve/brand-tokens.ts';

import { brandCss } from '#compile/brand-css.ts';
import { fontFaceCss, type FontFaceRule } from '#compile/font-face.ts';
import { shikiTheme, type ShikiTheme } from '#compile/shiki-theme.ts';
import { tailwindTheme } from '#compile/tailwind-theme.ts';

/**
 * Everything the compiler produces for one brand.
 */
export type CompiledBrand = {
  /**
   * Custom properties scoped by `[data-brand]` and `[data-surface]`, plus surface paint.
   */
  css: string;

  /**
   * `@theme inline` and `@utility` blocks for a Tailwind v4 entry file.
   */
  tailwind: string;

  /**
   * `@font-face` rules; empty when no faces were passed.
   */
  fontFaces: string;

  /**
   * One Shiki theme per surface, keyed by surface name.
   */
  shikiThemes: Readonly<Record<string, ShikiTheme>>;
};

/**
 * Compiles resolved brand tokens to CSS, a Tailwind theme, `@font-face` rules and Shiki themes. It
 * does no validation; `resolveBrand` has already failed on any problem.
 *
 * @param tokens - Tokens from `resolveBrand`.
 * @param fontFaces - The faces to declare, from `loadBrand` in `@deckster/brand/node`.
 */
export function compileBrand(
  tokens: BrandTokens,
  fontFaces: readonly FontFaceRule[] = [],
): CompiledBrand {
  const shikiThemes = Object.fromEntries(
    Object.values(tokens.surfaces).map((surface) => [surface.name, shikiTheme(tokens, surface)]),
  );
  return {
    css: brandCss(tokens),
    tailwind: tailwindTheme(tokens),
    fontFaces: fontFaceCss(fontFaces),
    shikiThemes,
  };
}
