import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { useRef, type CSSProperties, type ReactNode } from 'react';

import type { stepsLayoutContract } from '#layouts/steps-layout.contract.ts';

import { useFitLevel } from '#foundation/fit-level.ts';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { enterProps, useEnter } from '#motion/enter.ts';
import { Step } from '#motion/step.tsx';
import '#layouts/steps-layout.css';

/**
 * The entrance order of the first step; the header and context come before.
 */
const FIRST_STEP_ORDER = 2;

/**
 * The sizes a row of steps tries, largest first, until it fits its region: three steps start with
 * the text at the lead size, four at the body size and five at the small size; the last level is
 * the small size with compact steps (smaller markers and titles, less padding). The roomy levels
 * come before them (see {@link roomyLevels}).
 */
const STEP_LEVELS = [
  { text: 'lead', grow: 'none', compact: false },
  { text: 'body', grow: 'none', compact: false },
  { text: 'small', grow: 'none', compact: false },
  { text: 'small', grow: 'none', compact: true },
] as const;

/**
 * The number of steps that start at the first of {@link STEP_LEVELS}.
 */
const LEVELS_FROM = 3;

/**
 * How far a row of steps is grown past its usual size for the room it has: `large` (the largest
 * markers, the number at the headline size and every step on a panel), `roomy` (larger markers with
 * the number at the title size, a heavier line and every title at the full title size), `snug` (the
 * roomy markers' weight at a size between the roomy and the usual one, the titles at their usual
 * size), or `none`.
 */
type StepGrowth = 'large' | 'roomy' | 'snug' | 'none';

/**
 * One size of a row of steps.
 */
type StepLevel = {
  /**
   * The type step of the step text.
   */
  text: 'lead' | 'body' | 'small';

  /**
   * How far the row is grown past its usual size.
   */
  grow: StepGrowth;

  /**
   * Whether the steps are compact: smaller markers and titles, no panels.
   */
  compact: boolean;
};

/**
 * The type step one above a step's text step, for the larger roomy levels; the lead size stays,
 * since a larger step would be a heading.
 *
 * @param text - The text step of the ladder's first level.
 */
function stepUp(text: 'lead' | 'body' | 'small'): 'lead' | 'body' {
  return text === 'small' ? 'body' : 'lead';
}

/**
 * The share of the region a roomy row may take. A grown row that fills its region edge to edge
 * reads as crowded, so it keeps a margin above and below; the usual sizes after it may fill the
 * region, since nothing smaller comes after them but the compact steps.
 */
const ROOMY_FILL = 0.92;

/**
 * The roomy levels for a ladder, tried before it, so a row never falls from its largest size
 * straight back to its usual one: larger markers and text one type step above the ladder's first
 * level (at the largest markers, then the roomy ones), the same markers with the text at that
 * level's size, and last a snug row barely larger than the usual one, which almost any row that
 * fits the usual size takes too.
 *
 * @param levels - The ladder the row would take otherwise.
 */
function roomyLevels(levels: readonly StepLevel[]): StepLevel[] {
  const first = levels[0]?.text ?? 'small';
  const up = stepUp(first);
  const texts = up === first ? [up] : [up, first];
  return [
    ...texts.flatMap((text): StepLevel[] => [
      { text, grow: 'large', compact: false },
      { text, grow: 'roomy', compact: false },
    ]),
    { text: first, grow: 'snug', compact: false },
  ];
}

/**
 * Where a step stands against the current one: done, now, to come, or `plain` without a current
 * step.
 */
type StepState = 'past' | 'current' | 'next' | 'plain';

/**
 * The `steps` layout: the shared header and an optional line of context, then the steps in equal
 * columns, a little above the middle of the space down to the footnote. Each step is a numbered
 * marker joined to the one before it by a segment of the line, then the title and text on rows
 * shared across the steps, so every title starts level. Three or four steps take larger markers,
 * the full title size and text at the lead or body size when the row fits at it; five step down.
 * With `current`, the segments up to that step are drawn in the accent and its marker is filled;
 * with `reveal`, each step comes in on its own click with its segment, so the line never runs ahead
 * of the markers. Before these sizes the row tries its roomy levels ({@link roomyLevels}), for
 * content that would otherwise sit small on a thin line in the middle of the space: larger markers
 * with a larger number, a heavier line and the full title size, from the largest (a panel under
 * every step, the text a type step up) down to a snug row barely larger than the usual one, so a
 * row that misses one level by a little takes the next. A roomy level is taken only when the row
 * leaves a margin of the region over ({@link ROOMY_FILL}), and it is chosen for the whole content,
 * revealed or not, so it holds from the first step to the last.
 */
function StepsLayout({ frontmatter, slots }: LayoutProps<typeof stepsLayoutContract>): ReactNode {
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  const { steps, reveal, current } = frontmatter;
  const marked = current !== undefined && current <= steps.length ? current : undefined;
  const region = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const ladder = STEP_LEVELS.slice(Math.max(0, steps.length - LEVELS_FROM));
  const roomy = roomyLevels(ladder);
  const levels = [...roomy, ...ladder];
  // The key holds what changes the room as well as the steps, so a slide that loses its line of
  // context or its footnote while it is open tries the roomy levels again.
  const key = JSON.stringify([
    steps,
    frontmatter.title,
    slots.body === undefined,
    slots.footnote === undefined,
  ]);
  const { level } = useFitLevel(region, list, levels.length, key, {
    fill: (at) => (at < roomy.length ? ROOMY_FILL : 1),
    restartOnFontLoad: true,
  });
  const size: StepLevel = levels[level] ?? { text: 'small', grow: 'none', compact: true };
  const textType = `kit-type-${size.text}`;
  const markerType = markerTypeOf(size, steps.length);
  const style = {
    '--kit-step-count': steps.length,
    '--kit-step-reached': marked ?? 0,
  } as CSSProperties;
  return (
    <Frame
      layout="steps"
      variant={{
        'data-count': String(steps.length),
        'data-current': String(marked !== undefined),
        'data-level': String(level),
        'data-roomy': String(size.grow !== 'none'),
        'data-large': String(size.grow === 'large'),
        'data-snug': String(size.grow === 'snug'),
        'data-compact': String(size.compact),
      }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />
      {slots.body === undefined ? null : (
        <div className="kit-steps-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region ref={region} className="kit-steps-region" place="optical">
        <ol ref={list} className="kit-steps" style={style}>
          {steps.map((step, index) => {
            const item = (
              <li
                key={index}
                className="kit-process-step"
                data-first={index === 0}
                data-state={stateOf(index + 1, marked)}
                aria-current={index + 1 === marked ? 'step' : undefined}
                {...enterProps(FIRST_STEP_ORDER + index, isStatic)}>
                <span className={`kit-process-marker ${markerType} kit-numeric`}>{index + 1}</span>
                <h3 className="kit-process-title kit-heading kit-type-title" data-fit="scaled">
                  {smartPunctuation(step.title)}
                </h3>
                {step.text === undefined ? (
                  <span className="kit-process-no-text" />
                ) : (
                  <p className={`kit-process-text ${textType}`}>{smartPunctuation(step.text)}</p>
                )}
              </li>
            );
            return reveal ? (
              <Step key={index} at={index + 1}>
                {item}
              </Step>
            ) : (
              item
            );
          })}
        </ol>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The most steps whose markers hold the number at the headline size at the largest roomy levels.
 */
const HEADLINE_NUMBER_MOST_STEPS = 4;

/**
 * The type step of the number in a step's marker: the lead size usually, the title size at a roomy
 * level and the headline size at the largest markers, which five have no room for.
 *
 * @param size - The row's level.
 * @param count - How many steps the row has.
 */
function markerTypeOf(size: StepLevel, count: number): string {
  if (size.grow === 'large' && count <= HEADLINE_NUMBER_MOST_STEPS) {
    return 'kit-type-headline';
  }

  return size.grow === 'none' ? 'kit-type-lead' : 'kit-type-title';
}

/**
 * Where a step stands against the current one.
 *
 * @param number - The step's 1-based number.
 * @param current - The current step's number, if the slide marks one.
 */
function stateOf(number: number, current: number | undefined): StepState {
  if (current === undefined) {
    return 'plain';
  }

  if (number === current) {
    return 'current';
  }

  return number < current ? 'past' : 'next';
}

/**
 * The `steps` layout's component.
 */
export const stepsLayout = defineLayout<typeof stepsLayoutContract>({
  name: 'steps',
  component: StepsLayout,
});
