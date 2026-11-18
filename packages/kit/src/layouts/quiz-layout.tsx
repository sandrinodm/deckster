import { useBrand } from '@deckster/brand/runtime';
import { defineLayout, useStatic, useStepAt, type LayoutProps } from '@deckster/engine';
import { useRef, type ReactNode } from 'react';

import type { quizLayoutContract } from '#layouts/quiz-layout.contract.ts';

import { useFitLevel } from '#foundation/fit-level.ts';
import { KitMark } from '#foundation/marks.tsx';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { QUIZ_LETTERS, QUIZ_TILE_MAX_CHARS } from '#layouts/quiz-values.ts';
import { enterProps, useEnter } from '#motion/enter.ts';
import { Step } from '#motion/step.tsx';
import '#layouts/quiz-layout.css';

/**
 * Rows keep the body face as padding and type step down to fit the complete question.
 */
const QUIZ_LEVELS = [
  { text: 'lead', reason: 'body' },
  { text: 'lead', reason: 'body' },
  { text: 'lead', reason: 'small' },
  { text: 'lead', reason: 'small' },
] as const;

/**
 * Tiles keep the heading face, with two stretched levels before compact content-height levels.
 */
const QUIZ_TILE_LEVELS = [
  { text: 'title', reason: 'lead' },
  { text: 'lead', reason: 'body' },
  { text: 'lead', reason: 'body' },
  { text: 'body', reason: 'small' },
] as const;

/**
 * The quiz keeps every choice visible at step zero. With reveal enabled, the question step and
 * answer step are two stacked copies of each option. The correct option's opaque answer panel is a
 * separate Step so native PowerPoint animations can reveal its fill, text and tick together. The
 * other rows reveal muted overlays on that same step, keeping their initial text neutral. Both
 * states occupy the same box; the hidden explanation also keeps its space, and fitting measures the
 * complete content independently of the requested step or static mode. Tile text is end-aligned so
 * both stacked copies agree, even when options wrap differently.
 */
function QuizLayout({ frontmatter, slots }: LayoutProps<typeof quizLayoutContract>): ReactNode {
  const { options, answer, explanation, reveal } = frontmatter;
  const answered = useStepAt(reveal ? 1 : undefined) !== 'hidden';
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  const { surface } = useBrand();
  const lit = surface.name === 'accent' || surface.name === 'gradient' ? 'inverse' : 'accent';
  const tiles = options.every((option) => option.length <= QUIZ_TILE_MAX_CHARS);
  const levels = tiles ? QUIZ_TILE_LEVELS : QUIZ_LEVELS;
  const region = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const key = JSON.stringify([frontmatter, slots.body === undefined, slots.footnote === undefined]);
  const { level } = useFitLevel(region, content, levels.length, key, {
    restartOnFontLoad: true,
    height: quizHeight,
  });
  const size = levels[level] ?? { text: 'small', reason: 'small' };
  const reason =
    explanation === undefined ? null : (
      <p className={`kit-quiz-explanation kit-type-${size.reason}`}>
        <span className={`kit-quiz-letter kit-heading kit-type-${size.reason}`}>{answer}</span>
        <span>{smartPunctuation(explanation)}</span>
      </p>
    );
  return (
    <Frame
      layout="quiz"
      variant={{
        'data-count': String(options.length),
        'data-level': String(level),
        'data-form': tiles ? 'tiles' : 'rows',
      }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} maxLines={1} />
      {slots.body === undefined ? null : (
        <div className="kit-quiz-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region ref={region} className="kit-quiz-region" place="optical">
        <div ref={content} className={`kit-quiz kit-type-${size.text}`}>
          <ol className="kit-quiz-options" aria-label="Answer choices">
            {options.map((option, index) => {
              const letter = QUIZ_LETTERS[index] ?? '';
              const correct = letter === answer;
              const overlay = (
                <div
                  className={
                    correct ? 'kit-quiz-result kit-quiz-answer' : 'kit-quiz-result kit-quiz-receded'
                  }
                  data-flow={reveal ? undefined : 'static'}
                  {...(correct ? { 'data-surface': lit } : {})}>
                  <Choice letter={letter} text={option} type={size.text} correct={correct} />
                </div>
              );
              return (
                <li
                  key={letter}
                  className="kit-quiz-option"
                  data-correct={String(correct)}
                  {...enterProps(2 + index, isStatic)}>
                  {reveal ? (
                    <div className="kit-quiz-choice" aria-hidden={answered || undefined}>
                      <Choice letter={letter} text={option} type={size.text} correct={false} />
                    </div>
                  ) : null}
                  {reveal ? <Step at={1}>{overlay}</Step> : overlay}
                </li>
              );
            })}
          </ol>
          {reveal && reason !== null ? <Step at={1}>{reason}</Step> : reason}
        </div>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * A choice's content, shared by its neutral row and its answer overlay so the two align exactly.
 */
function Choice({
  letter,
  text,
  type,
  correct,
}: {
  /**
   * The choice's letter, A to D.
   */
  letter: string;
  /**
   * The choice as written.
   */
  text: string;
  /**
   * The type step shared by all choices.
   */
  type: string;
  /**
   * Whether this is the revealed answer, with a tick and an accessible label.
   */
  correct: boolean;
}): ReactNode {
  return (
    <>
      <span className={`kit-quiz-letter kit-heading kit-type-${type}`}>
        <span>{letter}</span>
      </span>
      <span className={`kit-quiz-text kit-type-${type}`}>{smartPunctuation(text)}</span>
      <span
        className="kit-quiz-mark"
        role={correct ? 'img' : undefined}
        aria-label={correct ? 'Correct answer' : undefined}
        aria-hidden={correct ? undefined : true}>
        {correct ? <KitMark kind="check" /> : null}
      </span>
    </>
  );
}

/**
 * Measures the full tile tracks and reserved explanation, even when stretched past the region.
 *
 * @param content - The question's grid, including hidden answer-step content.
 */
function quizHeight(content: HTMLElement): number {
  const options = content.querySelector<HTMLElement>('.kit-quiz-options');
  const choices = Array.from(content.querySelectorAll<HTMLElement>('.kit-quiz-option'));
  const reason = content.querySelector<HTMLElement>('.kit-quiz-explanation');
  const optionsHeight = Math.max(
    options?.offsetHeight ?? 0,
    ...choices.map((item) => item.offsetHeight),
  );
  const gap = Number.parseFloat(getComputedStyle(content).rowGap) || 0;
  return optionsHeight + (reason === null ? 0 : reason.offsetHeight + gap);
}

/**
 * The quiz layout's component.
 */
export const quizLayout = defineLayout<typeof quizLayoutContract>({
  name: 'quiz',
  component: QuizLayout,
});
