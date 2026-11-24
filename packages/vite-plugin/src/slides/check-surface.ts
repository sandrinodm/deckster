import type { BrandTokens, SpacingTokens } from '@deckster/brand';
import type { SlideFrontmatter } from '@deckster/engine/frontmatter';

import { Effect } from 'effect';

import { invalidFields, type DeckBuildError, type FileRef } from '#errors.ts';
import { suggest } from '#suggest.ts';

/**
 * The brand a slide is checked against: its name, the surfaces it defines, and (when resolved
 * tokens are available) its spacing grid and per-surface role hex colors for placed-element
 * checks.
 */
export type SlideBrand = {
  /**
   * The brand folder name, such as `nocturne`.
   */
  name: string;

  /**
   * The surfaces the brand defines, such as `default` and `inverse`.
   */
  surfaces: readonly string[];

  /**
   * The brand's spacing scale, margins and grid, used to validate placed elements.
   */
  spacing?: SpacingTokens;

  /**
   * Resolved role hex colors per surface name (`surface -> role -> hex`), used to check text
   * contrast on `<Shape fill="...">`.
   */
  surfaceColors?: Readonly<Record<string, Readonly<Record<string, string>>>>;
};

/**
 * Builds the {@link SlideBrand} summary a slide compile needs from resolved {@link BrandTokens}.
 *
 * @param tokens - The resolved brand tokens.
 */
export function slideBrandOf(tokens: BrandTokens): SlideBrand {
  const surfaceColors: Record<string, Readonly<Record<string, string>>> = {};
  for (const [surfaceName, surface] of Object.entries(tokens.surfaces)) {
    surfaceColors[surfaceName] = surface.roles;
  }

  return {
    name: tokens.name,
    surfaces: Object.keys(tokens.surfaces),
    spacing: tokens.spacing,
    surfaceColors,
  };
}

/**
 * Fills in the surface a layout asks for when the slide names none: the contract's `surface`, if
 * the deck's brand has it. A slide that names its own surface, a layout without a default, a brand
 * without that surface and an unknown brand leave the frontmatter unchanged.
 *
 * @param frontmatter - The slide's validated frontmatter.
 * @param layoutSurface - The `surface` of the layout's contract, if it sets one.
 * @param brand - The deck's brand, or `undefined` when it is not known.
 * @returns The frontmatter, with `surface` set when the layout's default applies.
 */
export function withLayoutSurface<Frontmatter extends SlideFrontmatter>(
  frontmatter: Frontmatter,
  layoutSurface: string | undefined,
  brand: SlideBrand | undefined,
): Frontmatter {
  const applies =
    frontmatter.surface === undefined &&
    layoutSurface !== undefined &&
    brand !== undefined &&
    brand.surfaces.includes(layoutSurface);
  return applies ? { ...frontmatter, surface: layoutSurface } : frontmatter;
}

/**
 * Checks that a slide's `surface:` names a surface of the deck's brand, so a typo or a surface
 * another brand has fails the build instead of rendering unstyled.
 *
 * @param frontmatter - The slide's validated frontmatter.
 * @param brand - The deck's brand, or `undefined` to skip the check.
 * @param ref - The slide file, for the error.
 * @throws DeckBuildError in the error channel, naming the surfaces the brand has, with a "did you
 *   mean" fix.
 */
export function checkSurface(
  frontmatter: SlideFrontmatter,
  brand: SlideBrand | undefined,
  ref: FileRef,
): Effect.Effect<void, DeckBuildError> {
  const { surface } = frontmatter;
  if (surface === undefined || brand === undefined || brand.surfaces.includes(surface)) {
    return Effect.void;
  }

  const closest = suggest(surface, brand.surfaces);
  const fix =
    closest === undefined
      ? `Use one of the ${brand.name} brand's surfaces: ${brand.surfaces.join(', ')}.`
      : `Use "${closest}".`;
  return invalidFields(ref, 'frontmatter', [
    { message: `surface: The ${brand.name} brand has no "${surface}" surface.`, fix },
  ]);
}
