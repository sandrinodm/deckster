import { defineLayout, type LayoutProps } from '@deckster/engine';
import { useRef, type ReactNode } from 'react';

import type { timelineLayoutContract } from '#layouts/timeline-layout.contract.ts';

import { Milestone } from '#diagrams/form-parts.tsx';
import { Timeline } from '#diagrams/lazy-diagrams.tsx';
import { useFitLevel } from '#foundation/fit-level.ts';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { useEnter } from '#motion/enter.ts';
import '#layouts/timeline-layout.css';

/**
 * How far a timeline is grown past its usual size for the room it has, largest first: `xl` (each
 * milestone's text on a panel, the dates at the headline size and larger dots), `panels` (the
 * panels with the sizes of `large`), `large` (the dates in the title's voice at the title size, the
 * title and detail a step or two up), `roomy` (a larger date over a larger dot on a heavier line,
 * the title and detail a step up), `snug` (the roomy date, dot and line over the usual title and
 * detail) and `none`, the usual size, which is the last.
 */
type TimelineGrowth = 'xl' | 'panels' | 'large' | 'roomy' | 'snug' | 'none';

/**
 * The levels the timeline tries, largest first. With the roomy ones between the largest and the
 * usual size, a timeline that misses one level by a little takes the next instead of falling back
 * to small text on a thin line.
 */
const TIMELINE_LEVELS: readonly TimelineGrowth[] = [
  'xl',
  'panels',
  'large',
  'roomy',
  'snug',
  'none',
];

/**
 * The share of the region a grown timeline may take. A timeline grown until it fills its region
 * edge to edge reads as crowded, so it keeps a margin above and below; the usual size, the last
 * level, may fill the region.
 */
const ROOMY_FILL = 0.88;

/**
 * The `timeline` layout: the shared header and an optional line of context, then the kit's
 * `<Timeline>` in the middle of the region down to the footnote, its milestones from the
 * frontmatter. Its usual size sets three or four milestones' titles at the lead size, a step up
 * from a timeline inside a diagram slide, because the timeline is the slide. Before that size it
 * tries the roomy ones ({@link TIMELINE_LEVELS}), for milestones that would otherwise sit small on
 * a thin line in the middle of an empty slide: at the largest each milestone's text stands on a
 * panel under a larger dot with the date at the headline size, then on panels at the large sizes,
 * then without panels with the date in the title's voice, then a larger date over a larger dot on a
 * heavier line with the title and detail a step up, and last that date, dot and line over the usual
 * text. A roomy level is taken only when the timeline leaves a margin of the region over
 * ({@link ROOMY_FILL}), and it is chosen for every milestone, revealed or not, so it holds from the
 * first step to the last.
 */
function TimelineLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof timelineLayoutContract>): ReactNode {
  const contextEnter = useEnter(1);
  const bodyEnter = useEnter(2);
  const { milestones, current, reveal } = frontmatter;
  const region = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  // The key holds what changes the room as well as the milestones, so a slide that loses its line
  // of context or its footnote while it is open tries the roomy levels again.
  const key = JSON.stringify([
    milestones,
    frontmatter.title,
    slots.body === undefined,
    slots.footnote === undefined,
  ]);
  const { level } = useFitLevel(region, fill, TIMELINE_LEVELS.length, key, {
    fill: () => ROOMY_FILL,
    restartOnFontLoad: true,
  });
  const grow = TIMELINE_LEVELS[level] ?? 'none';
  return (
    <Frame
      layout="timeline"
      variant={{
        'data-count': String(milestones.length),
        'data-level': String(level),
        'data-roomy': String(grow !== 'none'),
        'data-large': String(grow === 'xl' || grow === 'panels' || grow === 'large'),
        'data-panels': String(grow === 'xl' || grow === 'panels'),
        'data-xl': String(grow === 'xl'),
        'data-snug': String(grow === 'snug'),
      }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />
      {slots.body === undefined ? null : (
        <div className="kit-timeline-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region ref={region} className="kit-timeline-region">
        <div ref={fill} className="kit-timeline-fill" {...bodyEnter}>
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
