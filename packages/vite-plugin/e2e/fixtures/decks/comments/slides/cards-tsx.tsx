import type { SlideFrontmatterInput } from '@deckster/engine';
import type { ReactNode } from 'react';

import { Card } from './parts/card.tsx';

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
  title: 'Feedback in TSX',
} satisfies SlideFrontmatterInput;

/**
 * Fills the left slot.
 */
export function Left(): ReactNode {
  return <p>A paragraph in the left slot</p>;
}

/**
 * Fills the right slot with a component from the deck folder.
 */
export function Right(): ReactNode {
  return <Card title="Evidence">A card from the deck folder</Card>;
}

/**
 * Fills the body.
 */
export default function Body(): ReactNode {
  return <h2>Feedback in TSX</h2>;
}
