import type { SlideFrontmatterInput } from '@deckster/engine';
import type { ReactNode } from 'react';

/**
 * Read by the build without running the slide, so it must stay a literal.
 */
export const frontmatter = {
  /**
   * The slide title.
   */
  title: 'Throws',

  /**
   * The brand surface.
   */
  surface: 'inverse',
} satisfies SlideFrontmatterInput;

/**
 * A slide that throws while rendering, so the engine shows its error instead.
 */
export default function Throws(): ReactNode {
  throw new Error('This slide is broken on purpose.');
}
