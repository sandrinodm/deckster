import type { ReactNode } from 'react';

import { Notes, Step, useStep, type SlideFrontmatterInput } from '@deckster/engine';

/**
 * Read by the build without running the slide, so it must stay a literal.
 */
export const frontmatter = {
  title: 'A TSX slide',
  surface: 'accent',
  budget: '45s',
} satisfies SlideFrontmatterInput;

/**
 * A TSX slide that reads the step directly and reveals one more line on step 1.
 */
export default function LiveCounter(): ReactNode {
  const step = useStep();
  return (
    <div>
      <h2>A TSX slide</h2>
      <p data-testid="live-step">This slide is on step {step}.</p>
      <Step at={1}>
        <p>TSX slides use the same steps as MDX slides.</p>
      </Step>
      <Notes>TSX is the escape hatch for slides that need real code.</Notes>
    </div>
  );
}
