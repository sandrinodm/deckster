import type { SlideRule } from '#lint/types.ts';

import { describeElement, round } from '#lint/rules/describe.ts';
import { diagramName, diagramsOn } from '#lint/rules/diagram-elements.ts';

/**
 * How far below the caption size, in canvas pixels, diagram text must fall before it counts as
 * small: a half pixel absorbs rounding from the browser's layout.
 */
const ROUNDING_TOLERANCE_PX = 0.5;

/**
 * Text in a diagram drawn smaller than the brand's caption and label steps: readable up close, lost
 * from the back of the room. The kit's own diagram text never scales; this catches imported SVGs
 * scaled down by their viewBox and custom node content in small type.
 */
export const diagramSmallTextRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'diagram-small-text',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * What is shown changes with the step.
   */
  scope: 'step',

  /**
   * Below the brand minimum `min-font-size` fails the deck; this is the softer warning above it.
   */
  severity: 'warning',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description: "Text in a diagram appears smaller than the brand's caption and label steps.",

  /**
   * Reports the first diagram text element below the caption and label sizes, once per diagram.
   */
  check: ({ snapshot, brand, slide }) => {
    const { steps } = brand.typeScale;
    const caption = Math.min(steps.caption.size, steps.label.size);
    return diagramsOn(snapshot).flatMap((diagram) =>
      diagram.parts
        .filter(
          (element) =>
            element.text !== '' &&
            !element.decorative &&
            element.opacity > 0 &&
            element.renderedFontSizePx < caption - ROUNDING_TOLERANCE_PX,
        )
        .slice(0, 1)
        .map((element) => ({
          message:
            `${diagramName(diagram)} sets ${describeElement(element)} at ` +
            `${round(element.renderedFontSizePx)}px, ` +
            `under the brand's ${caption}px for diagram text.`,
          fix:
            `Make the diagram larger (an <Svg>'s text scales with it), cut its text, or set ` +
            `custom node content in a \`kit-type-caption\` step or larger, in ${slide.file}.`,
          selector: element.selector,
          key: diagram.root.selector,
        })),
    );
  },
};
