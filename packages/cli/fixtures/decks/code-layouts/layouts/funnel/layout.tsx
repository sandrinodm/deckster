import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type contract from './contract.ts';

/**
 * The body as the stages of a funnel.
 */
function Funnel({ slots, frontmatter }: LayoutProps<typeof contract>): ReactNode {
  return (
    <div className="funnel p-3xl type-body" data-stage={frontmatter.stage ?? ''}>
      {slots.body}
    </div>
  );
}

export default defineLayout<typeof contract>({ name: 'funnel', component: Funnel });
