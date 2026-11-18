import { findLayoutInBrands } from '@deckster/brand/node';
import { deckCommand } from '@deckster/engine/command';
import { KEBAB_CASE_PATTERN } from '@deckster/engine/names';
import { Effect, Predicate } from 'effect';

import type { LayoutCatalogIndex } from '#layouts/load-layout-catalog.ts';

import { invalidFields, type DeckBuildError, type FileRef } from '#errors.ts';

/**
 * Where a slide looks for the layouts of brands other than its own.
 */
export type BrandFallback = {
  /**
   * The absolute workspace root, the folder with `brands/`.
   */
  workspaceRoot: string;

  /**
   * The folder name of the brand the deck renders with, whose layouts are already in the catalog.
   */
  brand: string;
};

/**
 * Swaps a slide's `layout` for the kit layout a brand layout falls back to, when the layout is not
 * in the catalog but another brand in the workspace defines it. A deck that moves from one brand to
 * another then keeps rendering slides written for the first brand's layouts. The swap happens in
 * Node, so the built deck names only the kit layout, never another brand's layout or name.
 *
 * Frontmatter that names a layout the catalog has, names none, or names a layout no brand defines
 * is returned as it is, for the usual validation to report.
 *
 * @param data - The parsed frontmatter, not validated yet.
 * @param catalog - Every layout the deck can use.
 * @param fallback - The workspace and the deck's brand.
 * @param ref - The slide file, for the error.
 * @returns The frontmatter, with `layout` set to the fallback when the swap applies.
 * @throws DeckBuildError in the error channel when two brands define the layout with different
 *   fallbacks, naming both and asking to rename one.
 */
export const withBrandLayoutFallback = Effect.fn('withBrandLayoutFallback')(function* (
  data: unknown,
  catalog: LayoutCatalogIndex,
  fallback: BrandFallback | undefined,
  ref: FileRef,
): Effect.fn.Return<unknown, DeckBuildError> {
  const name = Predicate.isObject(data) ? data.layout : undefined;
  if (
    fallback === undefined ||
    !Predicate.isObject(data) ||
    typeof name !== 'string' ||
    !KEBAB_CASE_PATTERN.test(name) ||
    catalog.has(name)
  ) {
    return data;
  }

  const matches = yield* findLayoutInBrands(fallback.workspaceRoot, name, fallback.brand);
  const fallbacks = [...new Set(matches.map((match) => match.fallback))];
  const [first] = fallbacks;
  if (first === undefined) {
    return data;
  }

  if (fallbacks.length > 1) {
    const owners = matches.map((match) => `${match.brand} (falls back to ${match.fallback})`);
    return yield* invalidFields(ref, 'frontmatter', [
      {
        message:
          `layout: There is no "${name}" layout in the ${fallback.brand} brand, and more than ` +
          `one brand defines it with a different fallback: ${owners.join(', ')}.`,
        fix:
          `Rename "${name}" in one of those brands' layouts.ts, so the name means one layout, ` +
          'or switch the deck back to the brand it was written for.',
      },
    ]);
  }

  if (!catalog.has(first)) {
    const owners = matches.map((match) => match.brand).join(', ');
    return yield* invalidFields(ref, 'frontmatter', [
      {
        message:
          `layout: There is no "${name}" layout in the ${fallback.brand} brand. The ${owners} ` +
          `brand defines it with the fallback "${first}", which is not a layout either.`,
        fix:
          `Set the fallback of "${name}" in brands/${matches[0]?.brand}/layouts.ts to a layout ` +
          `from \`${deckCommand()} layouts\`, or switch the deck back to that brand.`,
      },
    ]);
  }

  return { ...data, layout: first };
});
