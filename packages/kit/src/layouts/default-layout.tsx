import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { defaultLayoutContract } from '#layouts/default-layout.contract.ts';

import { Frame, useEnter } from '#layout-parts.ts';
import '#layouts/default-layout.css';

/**
 * The kit's `default` layout, on the foundation like every kit layout: an accent rule, then the
 * slide's own content in one column, centred in the safe area. Headings take the brand's display
 * (`#`), headline (`##`) and title (`###`) steps; paragraphs and lists are running text, the
 * paragraph right after a `#` heading set as a muted lead.
 */
function DefaultLayout({ slots }: LayoutProps<typeof defaultLayoutContract>): ReactNode {
  return (
    <Frame layout="default">
      <div className="kit-default-body kit-prose" data-text="body" {...useEnter(0)}>
        <div className="kit-default-rule" aria-hidden="true" />
        {slots.body}
      </div>
    </Frame>
  );
}

/**
 * The kit's `default` layout, registered over the engine's unstyled one.
 */
export const defaultLayout = defineLayout<typeof defaultLayoutContract>({
  name: 'default',
  component: DefaultLayout,
});
