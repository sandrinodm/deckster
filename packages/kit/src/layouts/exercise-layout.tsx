import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { useRef, type ReactNode } from 'react';

import type { exerciseLayoutContract } from '#layouts/exercise-layout.contract.ts';

import { useFitLevel } from '#foundation/fit-level.ts';
import { useFitGroupWidth } from '#foundation/fit-text.ts';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { StatValue } from '#foundation/stat-figure.tsx';
import {
  EXERCISE_GROUPS_LABEL,
  EXERCISE_OUTPUT_LABEL,
  EXERCISE_TIME_LABEL,
} from '#layouts/exercise-layout.contract.ts';
import { enterProps, MAX_ENTER_ORDER, useEnter } from '#motion/enter.ts';
import '#layouts/exercise-layout.css';

/**
 * The entrance order of the first instruction, after the header and context.
 */
const FIRST_INSTRUCTION_ORDER = 2;

/**
 * The fit ladder scales sparse instructions up, stretches their rows, then fits dense briefs down
 * to caption.
 */
const EXERCISE_LEVELS = [
  { text: 'title', grow: 'roomy', compact: false },
  { text: 'lead', grow: 'roomy', compact: false },
  { text: 'body', grow: 'snug', compact: false },
  { text: 'body', grow: 'none', compact: false },
  { text: 'small', grow: 'none', compact: false },
  { text: 'small', grow: 'none', compact: true },
  { text: 'caption', grow: 'none', compact: true },
] as const;

/**
 * A workshop brief whose duration and deliverable remain visible with every instruction.
 */
function ExerciseLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof exerciseLayoutContract>): ReactNode {
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  const region = useRef<HTMLDivElement>(null);
  const brief = useRef<HTMLDivElement>(null);
  const key = JSON.stringify([frontmatter, slots.body === undefined, slots.footnote === undefined]);
  useFitGroupWidth(brief, '.kit-exercise-duration');
  const { level } = useFitLevel(region, brief, EXERCISE_LEVELS.length, key, {
    height: exerciseHeight,
    restartOnFontLoad: true,
  });
  const size = EXERCISE_LEVELS[level] ?? { text: 'caption', grow: 'none', compact: true };
  const outputOrder = Math.min(
    FIRST_INSTRUCTION_ORDER + frontmatter.instructions.length,
    MAX_ENTER_ORDER,
  );
  return (
    <Frame
      layout="exercise"
      variant={{
        'data-count': String(frontmatter.instructions.length),
        'data-level': String(level),
        'data-grow': size.grow,
        'data-compact': String(size.compact),
      }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} maxLines={1} />
      {slots.body === undefined ? null : (
        <div className="kit-exercise-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region ref={region} className="kit-exercise-region" place="optical">
        <div ref={brief} className="kit-exercise">
          <section className="kit-exercise-time" {...enterProps(1, isStatic)}>
            <h3 className="kit-exercise-label kit-type-label">{EXERCISE_TIME_LABEL}</h3>
            <StatValue
              value={frontmatter.duration}
              countUp={false}
              className="kit-exercise-duration"
            />
          </section>
          <ol className="kit-exercise-instructions">
            {frontmatter.instructions.map((instruction, index) => (
              <li
                key={index}
                className="kit-exercise-instruction"
                {...enterProps(FIRST_INSTRUCTION_ORDER + index, isStatic)}>
                <span
                  className={`kit-exercise-number kit-type-${size.text} kit-numeric`}
                  aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <p className={`kit-exercise-text kit-type-${size.text}`}>
                  {smartPunctuation(instruction)}
                </p>
              </li>
            ))}
          </ol>
          {frontmatter.groups === undefined ? null : (
            <section className="kit-exercise-groups" {...enterProps(outputOrder, isStatic)}>
              <h3 className="kit-exercise-label kit-type-label">{EXERCISE_GROUPS_LABEL}</h3>
              <p className={`kit-exercise-value kit-heading kit-type-${size.text}`}>
                {smartPunctuation(frontmatter.groups)}
              </p>
            </section>
          )}
          <section className="kit-exercise-output" {...enterProps(outputOrder, isStatic)}>
            <h3 className="kit-exercise-label kit-type-label">{EXERCISE_OUTPUT_LABEL}</h3>
            <p className={`kit-exercise-value kit-heading kit-type-${size.text}`}>
              {smartPunctuation(frontmatter.output)}
            </p>
          </section>
        </div>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * Measures both grid rows and their gap, including tracks that exceed a centred grid's box.
 */
function exerciseHeight(brief: HTMLElement): number {
  const time = brief.querySelector<HTMLElement>('.kit-exercise-time');
  const instructions = brief.querySelector<HTMLElement>('.kit-exercise-instructions');
  const groups = brief.querySelector<HTMLElement>('.kit-exercise-groups');
  const output = brief.querySelector<HTMLElement>('.kit-exercise-output');
  const gap = Number.parseFloat(getComputedStyle(brief).rowGap);
  return (
    Math.max(time?.offsetHeight ?? 0, instructions?.offsetHeight ?? 0) +
    gap +
    Math.max(groups?.offsetHeight ?? 0, output?.offsetHeight ?? 0)
  );
}

/**
 * The exercise layout component; all content is visible throughout the audience's work.
 */
export const exerciseLayout = defineLayout<typeof exerciseLayoutContract>({
  name: 'exercise',
  component: ExerciseLayout,
});
