import { deckCommand } from '@deckster/engine/command';

import type { DeckRule, SlideContext } from '#lint/types.ts';

import { REPEATED_LAYOUT_RUN } from '#lint/limits.ts';

/**
 * Runs of slides that look the same: {@link REPEATED_LAYOUT_RUN} or more in a row with the same
 * layout on the same surface. A change of surface is enough to break a run. Hidden slides are
 * skipped, so the runs are the slides as a talk shows them one after another.
 */
export const layoutRepetitionRule: DeckRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'layout-repetition',

  /**
   * A deck rule.
   */
  kind: 'deck',

  /**
   * Monotony does not break the deck.
   */
  severity: 'warning',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description:
    `${REPEATED_LAYOUT_RUN} or more slides in a row ` +
    'use the same layout on the same surface, counting shown slides only.',

  /**
   * Reports each run once, at the slide that makes it long enough.
   */
  check: ({ deck }) =>
    runsOf(deck.slides.filter((slide) => !slide.hidden))
      .filter((run) => run.length >= REPEATED_LAYOUT_RUN)
      .map((run) => {
        const [first] = run;
        const third = run[REPEATED_LAYOUT_RUN - 1];
        return {
          slide: third?.id ?? null,
          message:
            `${run.length} slides in a row use the ${first?.layout ?? ''} layout on the ` +
            `${first?.surface ?? ''} surface: ${run.map((slide) => slide.id).join(', ')}.`,
          fix:
            'Vary the rhythm: give one of them another layout (`' +
            deckCommand() +
            ' layouts`), another ' +
            'surface, or merge slides that make the same point.',
          selector: null,
        };
      }),
};

/**
 * The deck's slides grouped into runs of the same layout and surface, in order.
 *
 * @param slides - The slides.
 */
function runsOf(slides: readonly SlideContext[]): SlideContext[][] {
  const runs: SlideContext[][] = [];
  for (const slide of slides) {
    const run = runs.at(-1);
    const previous = run?.at(-1);
    if (
      run !== undefined &&
      previous?.layout === slide.layout &&
      previous.surface === slide.surface
    ) {
      run.push(slide);
    } else {
      runs.push([slide]);
    }
  }

  return runs;
}
