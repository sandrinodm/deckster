import { DEFAULT_LAYOUT } from '@deckster/engine/frontmatter';
import { Predicate } from 'effect';
import { readFile } from 'node:fs/promises';

import { readSlideFrontmatter } from '#slides/read-slide-layout.ts';

/**
 * What {@link usedLayoutNames} reads of a layout catalog: each layout's fallback, by name. A
 * `LayoutCatalogIndex` is one.
 */
export type FallbackIndex = ReadonlyMap<string, { readonly fallback?: string | undefined }>;

/**
 * The layouts a deck's slides can render with: `default`, the layout each slide names and the
 * fallbacks those layouts render through. A production build registers only these code layouts, so
 * an unused one with a broken import does not fail the build.
 *
 * @param slides - The deck's slide files, by absolute path.
 * @param index - The deck's layout catalog, for the fallbacks.
 * @returns The layout names, or `undefined` when every layout must stay: a slide cannot be read,
 *   names its layout in a way only running it tells (a computed `frontmatter`), or names a layout
 *   the catalog lacks (which may render through another brand's layout and its fallback).
 */
export async function usedLayoutNames(
  slides: readonly { readonly file: string }[],
  index: FallbackIndex,
): Promise<ReadonlySet<string> | undefined> {
  // `default` always stays: frontmatter decoding fills it in wherever no layout is named.
  const used = new Set<string>();
  addWithFallbacks(used, DEFAULT_LAYOUT, index);
  for (const slide of slides) {
    const layout = await slideLayout(slide.file);
    // A layout the catalog lacks renders through another brand's layout, or fails the slide.
    if (layout === undefined || !index.has(layout)) {
      return undefined;
    }

    addWithFallbacks(used, layout, index);
  }

  return used;
}

/**
 * The layout one slide names, `default` when it names none, or `undefined` when that cannot be read
 * from its source.
 *
 * @param file - The slide's absolute path.
 */
async function slideLayout(file: string): Promise<string | undefined> {
  const text = await readFile(file, 'utf8').catch(() => undefined);
  const data = text === undefined ? undefined : readSlideFrontmatter(file, text);
  if (!Predicate.isObject(data)) {
    return undefined;
  }

  const layout = data.layout ?? DEFAULT_LAYOUT;
  return typeof layout === 'string' ? layout : undefined;
}

/**
 * Adds a layout and every fallback it renders through, stopping at one already added.
 *
 * @param used - The names found so far; changed in place.
 * @param name - A layout name.
 * @param index - The deck's layout catalog.
 */
function addWithFallbacks(used: Set<string>, name: string, index: FallbackIndex): void {
  let next: string | undefined = name;
  while (next !== undefined && !used.has(next)) {
    used.add(next);
    next = index.get(next)?.fallback;
  }
}
