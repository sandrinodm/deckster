import type { SlideFrontmatterInput } from '@deckster/engine';
import type { ReactNode } from 'react';

/**
 * Read by the build without running the slide: the layout belongs to another brand, so the build
 * rewrites it to the kit layout it falls back to.
 */
export const frontmatter = {
  /**
   * The hero layout of the `fx-other` brand.
   */
  layout: 'fx-hero',

  /**
   * The slide title.
   */
  title: 'A TSX slide on another brand',
} satisfies SlideFrontmatterInput;

/**
 * Fills the subtitle.
 */
export default function OtherLayoutTsx(): ReactNode {
  return <p>The plan in one line.</p>;
}
