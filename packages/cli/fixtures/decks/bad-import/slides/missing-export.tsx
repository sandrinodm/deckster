import type { SlideFrontmatterInput } from '@deckster/engine';
import type { ReactNode } from 'react';

// @ts-expect-error The helper exports `greeting`, not `farewell`: the mistake under test.
import { farewell } from './helper.ts';

/**
 * Read by the build without running the slide, so it must stay a literal.
 */
export const frontmatter = {
  /**
   * The slide title.
   */
  title: 'Missing export',
} satisfies SlideFrontmatterInput;

/**
 * A slide that imports a name its helper does not export.
 */
export default function MissingExport(): ReactNode {
  return <h1>{farewell}</h1>;
}
