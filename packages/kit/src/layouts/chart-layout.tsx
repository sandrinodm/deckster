import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { chartLayoutContract } from '#layouts/chart-layout.contract.ts';

import { Footnote, Frame, Region, SlideHeader, useEnter } from '#layout-parts.ts';
import '#layouts/chart-layout.css';

/**
 * The `chart` layout: the shared header, then a region from the title gap down to the footnote that
 * the chart fills, across all twelve columns or in eight beside the aside. The region is a size
 * container, so the chart lays itself out for the room it has.
 */
function ChartLayout({ frontmatter, slots }: LayoutProps<typeof chartLayoutContract>): ReactNode {
  const hasAside = slots.aside !== undefined;
  const bodyEnter = useEnter(1);
  const asideEnter = useEnter(2);
  return (
    <Frame layout="chart" variant={{ 'data-aside': String(hasAside) }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />
      <div className="kit-chart-layout kit-grid kit-body">
        <Region className="kit-chart-main">
          <div className="kit-chart-fill" {...bodyEnter}>
            {slots.body}
          </div>
        </Region>
        {hasAside ? (
          <aside className="kit-chart-aside kit-prose" data-text="body" {...asideEnter}>
            {slots.aside}
          </aside>
        ) : null}
      </div>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The `chart` layout's component.
 */
export const chartLayout = defineLayout<typeof chartLayoutContract>({
  name: 'chart',
  component: ChartLayout,
});
