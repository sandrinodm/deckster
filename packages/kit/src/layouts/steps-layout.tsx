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
 * the small size with compact steps (smaller markers and titles, less padding).
 */
const STEP_LEVELS = [
  { text: 'lead', compact: false },
  { text: 'body', compact: false },
  { text: 'small', compact: false },
  { text: 'small', compact: true },
] as const;

/**
 * The number of steps that start at the first of {@link STEP_LEVELS}.
 */
const LEVELS_FROM = 3;

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
 * of the markers.
 */
function StepsLayout({ frontmatter, slots }: LayoutProps<typeof stepsLayoutContract>): ReactNode {
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  const { steps, reveal, current } = frontmatter;
  const marked = current !== undefined && current <= steps.length ? current : undefined;
  const region = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const levels = STEP_LEVELS.slice(Math.max(0, steps.length - LEVELS_FROM));
  const { level } = useFitLevel(region, list, levels.length, JSON.stringify(steps));
  const size = levels[level] ?? { text: 'small', compact: true };
  const textType = `kit-type-${size.text}`;
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
                <span className="kit-process-marker kit-type-lead kit-numeric">{index + 1}</span>
                <h3 className="kit-process-title kit-heading kit-type-title" data-fit="scaled">
                  {smartPunctuation(step.title)}
                </h3>
                {step.text === undefined ? (
                  <span />
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
