import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { demoLayoutContract } from '#layouts/demo-layout.contract.ts';

import { Footnote, Frame, SlideHeader } from '#foundation/slide-parts.tsx';
import { useEnter } from '#motion/enter.ts';

/**
 * The `demo` layout: the shared header on one line, then the demo region filling everything down to
 * the footnote, in eight columns beside notes in the last four, or in all twelve without notes.
 */
function DemoLayout({ frontmatter, slots }: LayoutProps<typeof demoLayoutContract>): ReactNode {
  const hasAside = slots.aside !== undefined;
  const bodyEnter = useEnter(1);
  const asideEnter = useEnter(2);
  return (
    <Frame layout="demo" variant={{ 'data-aside': String(hasAside) }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} maxLines={1} />
      <div className="kit-demo kit-grid kit-body">
        <div className="kit-demo-app" {...bodyEnter}>
          {slots.body}
        </div>
        {hasAside ? (
          <aside className="kit-demo-aside kit-prose" {...asideEnter}>
            {slots.aside}
          </aside>
        ) : null}
      </div>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The `demo` layout's component.
 */
export const demoLayout = defineLayout<typeof demoLayoutContract>({
  name: 'demo',
  component: DemoLayout,
});
