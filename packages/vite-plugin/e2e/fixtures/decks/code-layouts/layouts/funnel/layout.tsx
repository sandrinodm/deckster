import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type contract from './contract.ts';

/**
 * The body as the stages of a funnel, under a label the tests look for.
 */
function Funnel({ slots, frontmatter }: LayoutProps<typeof contract>): ReactNode {
  return (
    <div data-layout="funnel" data-stage={frontmatter.stage ?? ''} style={{ padding: 96 }}>
      <p data-testid="funnel-label" className="opacity-[0.41]">
        Deck funnel
      </p>
      {slots.body}
    </div>
  );
}

export default defineLayout<typeof contract>({ name: 'funnel', component: Funnel });
