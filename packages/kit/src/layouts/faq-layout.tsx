import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { Fragment, useRef, type ReactNode } from 'react';

import type { faqLayoutContract } from '#layouts/faq-layout.contract.ts';

import {
  enterProps,
  Footnote,
  Frame,
  Region,
  SlideHeader,
  smartPunctuation,
  Step,
  useEnter,
  useFitLevel,
} from '#layout-parts.ts';
import '#layouts/faq-layout.css';

/**
 * The header and context enter before the first pair.
 */
const FIRST_PAIR_ORDER = 2;

/**
 * The smallest FAQ level, used when every larger level overflows its region.
 */
const COMPACT_FAQ_LEVEL = {
  /**
   * The question's type step before its compact scale is applied.
   */
  question: 'body',

  /**
   * The smallest answer type step, for the densest grids.
   */
  answer: 'caption',

  /**
   * Compact pairs take their natural height instead of stretching.
   */
  roomy: false,

  /**
   * Reduces padding and the question's scale at the final level.
   */
  compact: true,
} as const;

/**
 * Larger type and generous space are tried before the compact levels, for sparse FAQs.
 */
const FAQ_LEVELS = [
  { question: 'headline', answer: 'lead', roomy: true, compact: false },
  { question: 'title', answer: 'body', roomy: true, compact: false },
  { question: 'title', answer: 'body', roomy: false, compact: false },
  { question: 'lead', answer: 'small', roomy: false, compact: false },
  { question: 'lead', answer: 'small', roomy: false, compact: true },
  COMPACT_FAQ_LEVEL,
] as const;

/**
 * Measures complete rows from the pairs' layout geometry, including stretched rows whose content
 * may be taller than their grid. Entrance and reveal transforms do not affect offset heights.
 *
 * @param grid - The two-column grid of question-and-answer pairs.
 */
function questionsHeight(grid: HTMLElement): number {
  const pairs = Array.from(grid.querySelectorAll<HTMLElement>('.kit-faq-pair'));
  let height = 0;
  for (let index = 0; index < pairs.length; index += 2) {
    height += Math.max(pairs[index]?.offsetHeight ?? 0, pairs[index + 1]?.offsetHeight ?? 0);
  }

  const gap = Number.parseFloat(getComputedStyle(grid).rowGap) || 0;
  return height + Math.max(0, Math.ceil(pairs.length / 2) - 1) * gap;
}

/**
 * A pair stays together during reveals. The fit level is chosen using all pairs, including hidden
 * ones, so stepping through a slide does not move its text. Questions stay at the title step; two
 * pairs begin with lead answers, three or four with body answers, in a two-column grid.
 */
function FaqLayout({ frontmatter, slots }: LayoutProps<typeof faqLayoutContract>): ReactNode {
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  const { questions, reveal } = frontmatter;
  const region = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const levels = questions.length === 2 ? FAQ_LEVELS : FAQ_LEVELS.slice(1);
  const key = JSON.stringify([
    questions,
    frontmatter.title,
    slots.body === undefined,
    slots.footnote === undefined,
  ]);
  const { level } = useFitLevel(region, grid, levels.length, key, {
    height: questionsHeight,
    restartOnFontLoad: true,
  });
  const size = levels[level] ?? COMPACT_FAQ_LEVEL;
  return (
    <Frame
      layout="faq"
      variant={{
        'data-count': String(questions.length),
        'data-level': String(level),
        'data-roomy': String(size.roomy),
        'data-compact': String(size.compact),
      }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} maxLines={1} />
      {slots.body === undefined ? null : (
        <div className="kit-faq-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region ref={region} className="kit-faq-region" place="optical">
        <div ref={grid} className="kit-faq-grid">
          {questions.map((pair, index) => {
            const content = (
              <section className="kit-faq-pair" {...enterProps(FIRST_PAIR_ORDER + index, isStatic)}>
                <h3
                  className={`kit-faq-question kit-heading kit-type-${size.question}`}
                  data-fit="scaled">
                  {smartPunctuation(pair.q)}
                </h3>
                <p className={`kit-faq-answer kit-type-${size.answer}`}>
                  {smartPunctuation(pair.a)}
                </p>
              </section>
            );
            return reveal ? (
              <Step key={index} at={index + 1}>
                {content}
              </Step>
            ) : (
              <Fragment key={index}>{content}</Fragment>
            );
          })}
        </div>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The runtime component of the `faq` layout.
 */
export const faqLayout = defineLayout<typeof faqLayoutContract>({
  name: 'faq',
  component: FaqLayout,
});
