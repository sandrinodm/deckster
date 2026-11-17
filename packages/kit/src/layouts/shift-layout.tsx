import { defineLayout, type LayoutProps } from '@deckster/engine';
import { useRef, type ReactNode } from 'react';

import type { ShiftStateEntry, shiftLayoutContract } from '#layouts/shift-layout.contract.ts';

import { useFitLevel } from '#foundation/fit-level.ts';
import { Footnote, Frame, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { StatValue } from '#foundation/stat-figure.tsx';
import { useEnter } from '#motion/enter.ts';
import { Step } from '#motion/step.tsx';
import '#layouts/shift-layout.css';

/**
 * The entrance order of the old state; the header comes first, the new state and its panel after.
 */
const FROM_ORDER = 1;

/**
 * The entrance order of the new state, its panel and the arrow.
 */
const TO_ORDER = 2;

/**
 * The sizes the slide tries, largest first, until it fits between the top and bottom lines: as set;
 * with the old state's text and both figures smaller and less room above the panel; then with the
 * new state's heading set at the title size too.
 */
const SHIFT_LEVELS = [
  { compact: false, toHeading: 'headline' },
  { compact: true, toHeading: 'headline' },
  { compact: true, toHeading: 'title' },
] as const;

/**
 * The `shift` layout: the shared header across the top, the old state under it in the left five
 * columns and the new state in the right six, on an accent panel that starts on the seam (the
 * middle of the gutter after the fifth column), a gap below the header, and runs to the right and
 * bottom edges of the slide. The two states share two rows of one grid through a subgrid: the lede
 * (label, figure and heading, standing on the row's foot) and the text, so the headings end level
 * and the texts start level, and the arrow on the seam stands on the headings' last line. The old
 * state is set smaller and muted; the new one larger, in the accent surface's own roles. With
 * `reveal`, the panel, the arrow and the new state come in on step 1. A slide whose text does not
 * fit sets the old state's text and both figures a step smaller and closes the gap above the panel,
 * then sets the new heading smaller too.
 */
function ShiftLayout({ frontmatter, slots }: LayoutProps<typeof shiftLayoutContract>): ReactNode {
  const { from, to, reveal } = frontmatter;
  const contextEnter = useEnter(0);
  const toEnter = useEnter(TO_ORDER);
  const hasValue = from.value !== undefined || to.value !== undefined;
  const grid = useRef<HTMLDivElement>(null);
  const { level } = useFitLevel(grid, grid, SHIFT_LEVELS.length, JSON.stringify([from, to]), {
    overflow: true,
  });
  const size = SHIFT_LEVELS[level] ?? { compact: true, toHeading: 'title' };
  const panel = (
    <div className="kit-shift-panel" data-surface="accent" aria-hidden="true" data-decorative="" />
  );
  const arrival = (
    <>
      <span className="kit-shift-arrow" aria-hidden="true" data-decorative="" {...toEnter}>
        <svg className="kit-shift-arrow-icon" viewBox="0 0 24 24" focusable="false">
          <path d="M4 12h15M13 6l6 6-6 6" />
        </svg>
      </span>
      <State state={to} side="to" compact={size.compact} heading={size.toHeading} />
    </>
  );
  return (
    <Frame
      layout="shift"
      variant={{ 'data-value': String(hasValue), 'data-level': String(level) }}
      bleed={reveal ? <Step at={1}>{panel}</Step> : panel}>
      <div ref={grid} className="kit-shift">
        <div className="kit-shift-head">
          <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />
          {slots.body === undefined ? null : (
            <div className="kit-shift-context kit-prose kit-body" {...contextEnter}>
              {slots.body}
            </div>
          )}
        </div>
        <State state={from} side="from" compact={size.compact} heading="title" />
        {reveal ? <Step at={1}>{arrival}</Step> : arrival}
        <Footnote>{slots.footnote}</Footnote>
      </div>
    </Frame>
  );
}

/**
 * Props of {@link State}.
 */
type StateProps = {
  /**
   * The state from the frontmatter.
   */
  state: ShiftStateEntry;

  /**
   * Which state it is: the old one on the slide's surface, or the new one on the accent panel.
   */
  side: 'from' | 'to';

  /**
   * Whether the slide is at a smaller level, where the old state's text is set at the small size.
   */
  compact: boolean;

  /**
   * The type step of the state's heading.
   */
  heading: 'headline' | 'title';
};

/**
 * One state on its two rows of the grid: the lede (the label, the figure and the heading, each left
 * out when the state has none) and the text, which keeps its row when empty.
 */
function State({ state, side, compact, heading }: StateProps): ReactNode {
  const enter = useEnter(side === 'from' ? FROM_ORDER : TO_ORDER);
  const surface = side === 'to' ? { 'data-surface': 'accent' } : {};
  const textType = side === 'from' && compact ? 'kit-type-small' : 'kit-type-body';
  return (
    <section className="kit-shift-state" data-side={side} {...surface} {...enter}>
      <div className="kit-shift-lede">
        {state.label === undefined ? null : (
          <p className="kit-shift-label kit-type-label">{smartPunctuation(state.label)}</p>
        )}
        {state.value === undefined ? null : (
          <div className="kit-shift-figure" data-fit="scaled">
            <StatValue value={state.value} className="kit-shift-value" />
          </div>
        )}
        <h3 className={`kit-shift-title kit-heading kit-type-${heading}`}>
          {smartPunctuation(state.title)}
        </h3>
      </div>
      <p className={`kit-shift-text ${textType}`}>
        {state.text === undefined ? null : smartPunctuation(state.text)}
      </p>
    </section>
  );
}

/**
 * The `shift` layout's component. The accent panel covers the right edge, so the chrome moves off
 * it.
 */
export const shiftLayout = defineLayout<typeof shiftLayoutContract>({
  name: 'shift',
  component: ShiftLayout,
  bleed: () => ['right'],
});
