import type { ElementSnapshot, SlideRule } from '#lint/types.ts';

import { describeElement } from '#lint/rules/describe.ts';
import { decorativeElements } from '#lint/rules/elements.ts';

/**
 * The `data-*` attribute (without its prefix) the kit's charts set on a label they had to cut
 * short, holding the whole text.
 */
const TRUNCATED_ATTRIBUTE = 'truncated';

/**
 * The `data-*` attribute (without its prefix) `FittedText` sets on a fitted text container.
 */
const FIT_ATTRIBUTE = 'fit';

/**
 * The value of `data-fit` when `FittedText` stepped down to its smallest size and still overflowed.
 */
const FIT_OVERFLOW_VALUE = 'overflow';

/**
 * The fix for every cut text: less text or more room, never a silent cut.
 */
const FIX =
  'Shorten the text, or give it more room: a wider column (another `ratio`, no aside, another ' +
  'layout), fewer categories, or a shorter label. If the cut text is decoration, mark it with ' +
  '`aria-hidden="true"` or `data-decorative`.';

/**
 * Text the reader sees only part of: cut with an ellipsis by CSS (`text-overflow: ellipsis`, a
 * `line-clamp`), cut by a kit chart that ran out of room for a label (`data-truncated`), or clipped
 * by `FittedText` after stepping down to its smallest size (`data-fit="overflow"`). Clipping by a
 * box that hides its overflow is `container-overflow`'s; this rule catches the cuts that leave no
 * overflow behind. Decoration is skipped.
 */
export const textTruncatedRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'text-truncated',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * What is visible changes with the step.
   */
  scope: 'step',

  /**
   * Text the audience cannot read in full fails the deck, like overflow.
   */
  severity: 'error',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description: 'Text is cut short with an ellipsis or a line clamp, so part of it is not shown.',

  /**
   * Reports every element whose text is cut short.
   */
  check: ({ snapshot }) => {
    const decorative = decorativeElements(snapshot);
    return snapshot.elements.flatMap((element) => {
      const message = decorative.has(element.index) ? undefined : describeCut(element);
      return message === undefined ? [] : [{ message, fix: FIX, selector: element.selector }];
    });
  },
};

/**
 * What is cut and how, or `undefined` when the element's text is whole.
 *
 * @param element - A measured element.
 */
function describeCut(element: ElementSnapshot): string | undefined {
  const whole = element.data[TRUNCATED_ATTRIBUTE];
  if (whole !== undefined) {
    return `"${whole}" did not fit its room and is shown cut short with an ellipsis.`;
  }

  switch (element.truncation) {
    case 'ellipsis': {
      return (
        `${describeElement(element)} is cut short with an ellipsis: it needs ` +
        `${element.scrollWidth}px and its box is ${element.clientWidth}px wide.`
      );
    }

    case 'clamp': {
      return (
        `${describeElement(element)} is cut to its line clamp: it needs ` +
        `${element.scrollHeight}px and its box shows ${element.clientHeight}px.`
      );
    }

    case null: {
      break;
    }
  }

  if (element.data[FIT_ATTRIBUTE] === FIT_OVERFLOW_VALUE) {
    return (
      `${describeElement(element)} did not fit its box even after stepping down to the ` +
      'smallest size and is clipped.'
    );
  }

  return undefined;
}
