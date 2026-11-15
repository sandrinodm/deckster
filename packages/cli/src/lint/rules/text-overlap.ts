import type { ElementSnapshot, RuleViolation, SlideRule } from '#lint/types.ts';

import { MIN_OVERLAP_WIDTH_EM } from '#lint/limits.ts';
import { describeElement } from '#lint/rules/describe.ts';
import { glyphBands, overlapOf, visibleTextElements } from '#lint/rules/elements.ts';

/**
 * Two blocks of text drawn over each other: lines of different elements whose glyphs cover each
 * other, as when an absolutely positioned label lands on a paragraph or a negative margin pulls a
 * heading into the text above it.
 */
export const textOverlapRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'text-overlap',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * What is visible changes with the step.
   */
  scope: 'step',

  /**
   * Overlapping text cannot be read and fails the deck.
   */
  severity: 'error',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description: 'Two pieces of text are drawn over each other.',

  /**
   * Reports each pair of text elements whose lines overlap.
   */
  check: ({ snapshot }) => {
    const texts = visibleTextElements(snapshot);
    const violations: RuleViolation[] = [];
    const reported = new Set<string>();
    for (const [position, first] of texts.entries()) {
      for (const second of texts.slice(position + 1)) {
        const owners = [blockOf(first, snapshot.elements), blockOf(second, snapshot.elements)];
        const [one, other] = owners;
        const key = owners.map((owner) => owner.selector).join('|');
        if (one === other || reported.has(key) || !linesOverlap(first, second)) {
          continue;
        }

        reported.add(key);
        violations.push({
          message:
            `${describeOwner(one ?? first)} and ${describeOwner(other ?? second)} ` +
            'are drawn over each other.',
          fix:
            'Move one of them, give the layout room for both, or cut one. Check absolute ' +
            'positions, negative margins and line heights below 1.',
          selector: (other ?? second).selector,
          key,
        });
      }
    }

    return violations;
  },
};

/**
 * The attribute a block of many text runs (a code block, a terminal) carries, so its tokens count
 * as one piece of text: one overflowing block is one finding, not one per token.
 */
const TEXT_BLOCK_ATTRIBUTE = 'text-block';

/**
 * The outermost block a text element belongs to, or the element itself.
 *
 * @param element - A text element.
 * @param elements - Every element of the snapshot, by index.
 */
function blockOf(element: ElementSnapshot, elements: readonly ElementSnapshot[]): ElementSnapshot {
  let owner = element;
  let current: ElementSnapshot | undefined = element;
  while (current !== undefined) {
    if (current.data[TEXT_BLOCK_ATTRIBUTE] !== undefined) {
      owner = current;
    }

    current = current.parent === null ? undefined : elements[current.parent];
  }

  return owner;
}

/**
 * Names a piece of text, or a block of it, in a message.
 *
 * @param owner - A text element, or the block it belongs to.
 */
function describeOwner(owner: ElementSnapshot): string {
  return owner.data[TEXT_BLOCK_ATTRIBUTE] === undefined
    ? describeElement(owner)
    : `The code block \`${owner.selector}\``;
}

/**
 * Whether the glyphs of any line of one element touch those of a line of the other, over at least a
 * glyph's width.
 *
 * @param first - A text element.
 * @param second - Another text element.
 */
function linesOverlap(first: ElementSnapshot, second: ElementSnapshot): boolean {
  const minWidth =
    Math.min(first.renderedFontSizePx, second.renderedFontSizePx) * MIN_OVERLAP_WIDTH_EM;
  const secondBands = glyphBands(second);
  return glyphBands(first).some((a) =>
    secondBands.some((b) => {
      const overlap = overlapOf(a, b);
      return overlap.height > 0 && overlap.width >= minWidth;
    }),
  );
}
