import type { ReactNode } from 'react';

import { Notes, type SlideFrontmatterInput } from '@deckster/engine';
import { AppFrame } from '@deckster/kit';

/**
 * Read by the build without running the slide.
 */
export const frontmatter = {
  /**
   * The layout for a live region.
   */
  layout: 'demo',

  /**
   * The slide title.
   */
  title: 'An app the deck does not have',
} satisfies SlideFrontmatterInput;

/**
 * The app's name, computed so the build cannot see it: only the rendered frame can tell.
 */
const APP = ['not', 'there'].join('-');

/**
 * A frame for an app that is not in the deck's apps folder.
 */
export default function MissingApp(): ReactNode {
  return (
    <>
      <AppFrame app={APP} poster={() => <p>Missing</p>} alt="Nothing" chrome="window" />
      <Notes>The frame must say the app is missing, not load the deck inside itself.</Notes>
    </>
  );
}
