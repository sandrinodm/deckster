import type { SlideFrontmatterInput } from '@deckster/engine';
import type { ReactNode } from 'react';

/**
 * Read by the build without running the slide.
 */
export const frontmatter = {
  /**
   * The test layout with two required slots.
   */
  layout: 'columns',

  /**
   * The slide title.
   */
  title: 'Slots in TSX',
} satisfies SlideFrontmatterInput;

/**
 * Fills the left slot.
 */
export function Left(): ReactNode {
  return <p>Left from an export</p>;
}

/**
 * Fills the right slot.
 */
export function Right(): ReactNode {
  return <p>Right from an export</p>;
}

/**
 * Fills the body.
 */
export default function Body(): ReactNode {
  return <h2>Slots in TSX</h2>;
}
