import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { useRef, type ReactNode } from 'react';

import type { statsLayoutContract } from '#layouts/stats-layout.contract.ts';

import {
  enterProps,
  Footnote,
  Frame,
  SlideHeader,
  smartPunctuation,
  StatDelta,
  StatValue,
  useEnter,
  useFitGroupWidth,
} from '#layout-parts.ts';
import '#layouts/stats-layout.css';

/**
 * Selects the stat values the row fits to their columns together.
 */
const VALUE_SELECTOR = '.kit-stat-value';

/**
 * The entrance order of the first stat; the header and context come before it.
 */
const FIRST_STAT_ORDER = 2;

/**
 * The `stats` layout: the shared header and an optional line of context at the top, and the numbers
 * in one row of equal columns standing on the stats line: the bottom line less room for a two-line
 * footnote, kept whether or not the slide has one, so the row sits at the same height on every
 * stats slide. Each stat stands under an equal rule (the accent rule marks the stat set to
 * `highlight`), its figure, label and delta on rows shared across the row, so deltas line up
 * whatever the labels' lengths. The figures share one size, stepped down together until the widest
 * fits its column.
 */
function StatsLayout({ frontmatter, slots }: LayoutProps<typeof statsLayoutContract>): ReactNode {
  const rowRef = useRef<HTMLDivElement>(null);
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  useFitGroupWidth(rowRef, VALUE_SELECTOR);
  const { stats } = frontmatter;
  return (
    <Frame layout="stats" variant={{ 'data-count': String(stats.length) }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />
      {slots.body === undefined ? null : (
        <div className="kit-stats-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <div ref={rowRef} className="kit-stats kit-grid">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="kit-stat"
            data-highlight={stat.highlight === true}
            {...enterProps(FIRST_STAT_ORDER + index, isStatic)}>
            <StatValue value={stat.value} />
            <p className="kit-stat-label kit-type-body">{smartPunctuation(stat.label)}</p>
            <StatDelta stat={stat} />
          </div>
        ))}
      </div>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The `stats` layout's component.
 */
export const statsLayout = defineLayout<typeof statsLayoutContract>({
  name: 'stats',
  component: StatsLayout,
});
