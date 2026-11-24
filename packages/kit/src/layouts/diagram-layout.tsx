import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { diagramLayoutContract } from '#layouts/diagram-layout.contract.ts';

import { Footnote, Frame, Region, SlideHeader, useEnter } from '#layout-parts.ts';
import '#layouts/diagram-layout.css';

/**
 * The `diagram` layout: the shared header, then a region from the title gap down to the footnote
 * that the diagram fills, across all twelve columns or in nine beside the aside. The region is a
 * size container, so the diagram lays itself out for the room it has.
 */
function DiagramLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof diagramLayoutContract>): ReactNode {
  const hasAside = slots.aside !== undefined;
  const bodyEnter = useEnter(1);
  const asideEnter = useEnter(2);
  return (
    <Frame layout="diagram" variant={{ 'data-aside': String(hasAside) }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />
      <div className="kit-diagram-layout kit-grid kit-body">
        <Region className="kit-diagram-main">
          <div className="kit-diagram-fill" {...bodyEnter}>
            {slots.body}
          </div>
        </Region>
        {hasAside ? (
          <aside className="kit-diagram-aside kit-prose" data-text="body" {...asideEnter}>
            {slots.aside}
          </aside>
        ) : null}
      </div>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The `diagram` layout's component.
 */
export const diagramLayout = defineLayout<typeof diagramLayoutContract>({
  name: 'diagram',
  component: DiagramLayout,
});
