import type { TransitionKind } from '#contract/transition.ts';

import { areShownNeighbours } from '#navigation/shown-slides.ts';

/**
 * What decides the transition each slide on the stage carries.
 */
export type StageTransitionInput = {
  /**
   * The zero-based index of the slide on screen.
   */
  current: number;

  /**
   * The slide the deck left on its last move between slides, `undefined` before the first.
   */
  previousSlide: number | undefined;

  /**
   * Per slide index, whether it is hidden; a move between slides with only hidden slides between
   * them counts as a move between neighbours. Missing means no slide is hidden.
   */
  hidden?: readonly boolean[];

  /**
   * A slide's own `transition:` frontmatter, `undefined` when it leaves the choice to the brand.
   */
  transitionOf: (index: number) => TransitionKind | undefined;
};

/**
 * The transition a slide on the deck's stage carries in `data-transition`, which the kit's motion
 * stylesheet reads; `undefined` leaves it to the brand's transition.
 *
 * A move between two neighbouring slides (the next shown slide, hidden ones skipped) plays the
 * transition of the later slide of the pair: going forward the transition onto the next slide,
 * going back the same one in reverse. That holds however the move was made (a key, a click, `goto`,
 * a link, the presenter window), so a slide's `transition:` describes its boundary with the slide
 * before it. A move to a slide further away cuts (`none`), since that slide was not mounted to move
 * from.
 *
 * A neighbour already carries the transition of the move that would bring it on screen, so it rests
 * where that transition starts (off to the side for `push`, transparent for `fade`) before the
 * move. The slide on screen keeps the transition of the move that brought it.
 *
 * @param index - The zero-based index of the slide on the stage.
 * @param input - The slide on screen, the slide before it and each slide's own transition.
 * @returns The transition kind, or `undefined` for the brand's.
 */
export function stageTransition(
  index: number,
  input: StageTransitionInput,
): TransitionKind | undefined {
  const { current, previousSlide, transitionOf, hidden = [] } = input;
  if (index !== current) {
    return transitionOf(Math.max(index, current));
  }

  if (previousSlide === undefined) {
    return undefined;
  }

  if (!areShownNeighbours(hidden, previousSlide, current)) {
    return 'none';
  }

  return transitionOf(Math.max(previousSlide, current));
}
