import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { timelineLayoutContract } from '#layouts/timeline-layout.contract.ts';

import { Milestone } from '#diagrams/form-parts.tsx';
import { Timeline } from '#diagrams/lazy-diagrams.tsx';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { useEnter } from '#motion/enter.ts';
import '#layouts/timeline-layout.css';

/**
 * The `timeline` layout: the shared header and an optional line of context, then the kit's
 * `<Timeline>` filling the region down to the footnote, its milestones from the frontmatter. Up to
 * four milestones set their titles at the body size and their details at the small size, a step up
 * from a timeline inside a diagram slide, because the timeline is the slide; the date takes a third
 * of the height above the line and the text two thirds below it.
 */
function TimelineLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof timelineLayoutContract>): ReactNode {
  const contextEnter = useEnter(1);
  const bodyEnter = useEnter(2);
  const { milestones, current, reveal } = frontmatter;
  return (
    <Frame layout="timeline" variant={{ 'data-count': String(milestones.length) }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />
      {slots.body === undefined ? null : (
        <div className="kit-timeline-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region className="kit-timeline-region">
        <div className="kit-timeline-fill" {...bodyEnter}>
          <Timeline title={frontmatter.title ?? frontmatter.eyebrow ?? 'Timeline'}>
            {milestones.map((milestone, index) => (
              <Milestone
                key={index}
                date={milestone.date}
                title={milestone.title}
                {...(reveal ? { at: index + 1 } : {})}
                {...(current === index + 1 ? { current: true } : {})}
                {...(milestone.state === undefined ? {} : { state: milestone.state })}>
                {milestone.detail}
              </Milestone>
            ))}
          </Timeline>
        </div>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The `timeline` layout's component.
 */
export const timelineLayout = defineLayout<typeof timelineLayoutContract>({
  name: 'timeline',
  component: TimelineLayout,
});
