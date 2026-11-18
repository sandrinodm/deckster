import { deckCommand } from '@deckster/engine/command';

import type { DeckRule } from '#lint/types.ts';

import { count } from '#lint/format-report.ts';
import { FEW_BUILDS_MIN_EVIDENCE_SLIDES, FEW_BUILDS_MIN_SHARE } from '#lint/limits.ts';

/**
 * The layouts whose one figure is the slide's evidence and can be staged with `at` on its parts.
 */
const EVIDENCE_LAYOUTS = new Set(['chart', 'diagram', 'code']);

/**
 * A deck that shows its evidence all at once: of its chart, diagram and code slides (at least
 * {@link FEW_BUILDS_MIN_EVIDENCE_SLIDES} of them), fewer than {@link FEW_BUILDS_MIN_SHARE} build in
 * steps. A slide builds when it has more than one step, whatever does the building. Hidden slides
 * are not counted: they are not part of the talk.
 */
export const fewBuildsRule: DeckRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'few-builds',

  /**
   * A deck rule.
   */
  kind: 'deck',

  /**
   * Slides shown whole still work; they are harder to follow.
   */
  severity: 'warning',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description:
    `Fewer than ${FEW_BUILDS_MIN_SHARE * 100}% of a deck's chart, diagram and code slides ` +
    `(${FEW_BUILDS_MIN_EVIDENCE_SLIDES} or more) build in steps; hidden slides are left out.`,

  /**
   * Reports the deck once, naming the evidence slides that show everything on arrival.
   */
  check: ({ deck }) => {
    const evidence = deck.slides.filter(
      (slide) => !slide.hidden && EVIDENCE_LAYOUTS.has(slide.layout),
    );
    const unstaged = evidence.filter((slide) => slide.stepCount <= 1);
    const staged = evidence.length - unstaged.length;
    if (
      evidence.length < FEW_BUILDS_MIN_EVIDENCE_SLIDES ||
      staged >= evidence.length * FEW_BUILDS_MIN_SHARE
    ) {
      return [];
    }

    return [
      {
        slide: null,
        message:
          `${staged} of ${count(evidence.length, 'chart, diagram and code slide')} build in ` +
          `steps; these show everything at once: ${unstaged.map((slide) => slide.id).join(', ')}.`,
        fix:
          'Stage the figures the notes walk through, in the order the notes explain them: ' +
          '`reveal` or `at` on a chart and its highlight and annotations, `at` on diagram nodes ' +
          'and edges or a <Journey>, step ranges on a code fence (```ts {2-4|7}), and a [click] ' +
          `cue in the notes for each step. Check the order with \`${deckCommand()} shot ` +
          '<deck> <slide> --steps`.',
        selector: null,
      },
    ];
  },
};
