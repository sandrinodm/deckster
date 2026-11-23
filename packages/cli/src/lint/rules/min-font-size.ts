import type { ElementSnapshot, SlideRule } from '#lint/types.ts';

import { describeElement, round } from '#lint/rules/describe.ts';
import { visibleTextElements } from '#lint/rules/elements.ts';

/**
 * How far the rendered size may differ from the CSS size, in canvas pixels, before a message
 * explains the scaling.
 */
const SCALED_DIFFERENCE_PX = 0.5;

/**
 * Text that appears smaller than the brand package's minimum type size on the canvas. The size is
 * the one the text is drawn at: the font size times every transform, `scale` and `zoom` above it
 * and, in an SVG, the viewBox scaling.
 */
export const minFontSizeRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'min-font-size',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * What is visible changes with the step.
   */
  scope: 'step',

  /**
   * Text below the minimum size fails the deck.
   */
  severity: 'error',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description:
    'Text appears below the minimum type size (after transforms and SVG scaling) on the canvas.',

  /**
   * Reports every element whose own text appears below the minimum size.
   */
  check: ({ snapshot, brand }) => {
    const minimum = brand.typeScale.minimum;
    const smallest = brand.typeScale.smallest;
    return visibleTextElements(snapshot)
      .filter((element) => element.renderedFontSizePx < minimum)
      .map((element) => ({
        message:
          `${describeElement(element)} appears at ${describeSize(element)}; ` +
          `the minimum is ${minimum}px.`,
        fix:
          `Use a type step of at least ${minimum}px (the brand's smallest is ` +
          `\`type-${smallest.step}\`, ${smallest.size}px), remove the scaling that shrinks it, ` +
          'or shorten the text so larger type fits.',
        selector: element.selector,
      }));
  },
};

/**
 * The rendered size in words, with the CSS size and scale when they differ.
 *
 * @param element - A text element.
 */
function describeSize(element: ElementSnapshot): string {
  const rendered = `${round(element.renderedFontSizePx)}px`;
  if (Math.abs(element.renderedFontSizePx - element.fontSizePx) < SCALED_DIFFERENCE_PX) {
    return rendered;
  }

  const factor = element.renderedFontSizePx / element.fontSizePx;
  return `${rendered} (font-size ${round(element.fontSizePx)}px scaled by ${round(factor)})`;
}
