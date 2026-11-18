import { deckCommand } from '@deckster/engine/command';

import type { BrandFallback, DeckRule } from '#lint/types.ts';

/**
 * Slides that name a layout of another brand. The deck's brand lacks it, so the build renders the
 * slide with the kit layout that layout declares as its fallback. The slide looks different from
 * what the layout's brand would give it, and its source still names the other brand's layout.
 */
export const brandLayoutFallbackRule: DeckRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'brand-layout-fallback',

  /**
   * A deck rule.
   */
  kind: 'deck',

  /**
   * The slide still renders, on the fallback layout.
   */
  severity: 'warning',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description:
    "A slide names a layout that only another brand defines, so it renders with that layout's " +
    'kit fallback.',

  /**
   * Reports each such slide once, naming the brand that has the layout and the fallback used.
   */
  check: ({ deck }) =>
    deck.slides.flatMap((slide) =>
      slide.brandFallback === undefined
        ? []
        : [
            {
              slide: slide.id,
              message: describe(slide.brandFallback, slide.layout),
              fix:
                'Switch the deck back to that brand, or pick a layout from `' +
                deckCommand() +
                ` layouts ${deck.id}\` and set it in the slide's frontmatter.`,
              selector: null,
            },
          ],
    ),
};

/**
 * The finding's message: the layout, the brands that have it and the layout used instead.
 *
 * @param fallback - What the slide's source names and who defines it.
 * @param rendered - The layout the slide renders with.
 */
function describe(fallback: BrandFallback, rendered: string): string {
  const owners = fallback.brands.map(({ brand }) => `"${brand}"`).join(' and ');
  const noun = fallback.brands.length === 1 ? 'brand' : 'brands';
  return (
    `The slide names the layout "${fallback.sourceLayout}" of the ${owners} ${noun}, which this ` +
    `deck's brand does not have, so it renders with the ${rendered} layout.`
  );
}
