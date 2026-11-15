import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';
import { useRef } from 'react';

import type { contentLayoutContract } from '#layouts/content-layout.contract.ts';

import { useDensity, type TextStep } from '#foundation/density.ts';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { LAYOUT_LIMITS } from '#layouts/layout-limits.ts';
import { useEnter } from '#motion/enter.ts';
import '#layouts/content-layout.css';

/**
 * The type steps the body tries, smallest first: sparse text is set at the lead or title step.
 */
const BODY_STEPS: readonly TextStep[] = ['body', 'lead', 'title'];

/**
 * The `content` layout: the shared header, then the body in a region that takes the height down to
 * the footnote, set in an eight-column measure (all twelve with `width: full`), or beside the aside
 * in the last four columns. Sparse text steps up to a larger type step and sits optically centred
 * in the region; dense text starts on the line under the title.
 */
function ContentLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof contentLayoutContract>): ReactNode {
  const hasAside = slots.aside !== undefined;
  const bodyEnter = useEnter(1);
  const asideEnter = useEnter(2);
  const region = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const prose = useRef<HTMLDivElement>(null);
  useDensity({
    region,
    content,
    prose,
    steps: BODY_STEPS,
    maxLines: LAYOUT_LIMITS.contentBodyLines,
  });
  return (
    <Frame
      layout="content"
      variant={{ 'data-aside': String(hasAside), 'data-width': frontmatter.width }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />
      <Region ref={region} className="kit-body" place="optical">
        <div ref={content} className="kit-content kit-grid">
          <div ref={prose} className="kit-content-main kit-prose" {...bodyEnter}>
            {slots.body}
          </div>
          {hasAside ? (
            <aside className="kit-content-aside kit-prose" data-text="body" {...asideEnter}>
              {slots.aside}
            </aside>
          ) : null}
        </div>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The `content` layout's component.
 */
export const contentLayout = defineLayout<typeof contentLayoutContract>({
  name: 'content',
  component: ContentLayout,
});
