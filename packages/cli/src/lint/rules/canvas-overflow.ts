import type { ElementSnapshot, SlideRule, StepSnapshot } from '#lint/types.ts';

import { OVERFLOW_TOLERANCE_PX } from '#lint/limits.ts';
import { describeElement } from '#lint/rules/describe.ts';
import { decorativeElements } from '#lint/rules/elements.ts';

/**
 * The fix for every overflow: cut or split the content rather than shrinking the type.
 */
const FIX =
  'Cut the content, split it across two slides or move detail into speaker notes. ' +
  'Do not shrink the type to make it fit. If the element is decoration meant to bleed off the ' +
  'edge, mark it with `aria-hidden="true"` or `data-decorative`.';

/**
 * How far an element reaches past each canvas edge, in canvas pixels; negative when inside.
 */
type Sides = {
  /**
   * Past the left edge.
   */
  left: number;

  /**
   * Past the top edge.
   */
  top: number;

  /**
   * Past the right edge.
   */
  right: number;

  /**
   * Past the bottom edge.
   */
  bottom: number;
};

/**
 * Content that sticks out past the 1920x1080 canvas, where it is clipped on screen and in exports.
 * Only the outermost element of each overflowing branch is reported; decoration is skipped.
 */
export const canvasOverflowRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'canvas-overflow',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * What is visible changes with the step.
   */
  scope: 'step',

  /**
   * Overflowing the canvas fails the deck.
   */
  severity: 'error',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description: 'Content extends past the edge of the 1920x1080 canvas and is clipped.',

  /**
   * Reports the outermost element of each branch that reaches past the canvas.
   */
  check: ({ snapshot }) => {
    const decorative = decorativeElements(snapshot);
    const exceeding = new Set<number>();
    for (const element of snapshot.elements) {
      const isContent = !decorative.has(element.index);
      if (isContent && hasArea(element) && edgesOutside(element, snapshot).length > 0) {
        exceeding.add(element.index);
      }
    }

    return snapshot.elements
      .filter((element) => exceeding.has(element.index) && !hasExceedingParent(element, exceeding))
      .map((element) => ({
        message:
          `${describeElement(element)} extends past the canvas: ` +
          `${describeOverhang(element, snapshot)}.`,
        fix: FIX,
        selector: element.selector,
      }));
  },
};

/**
 * Whether the element has both width and height; empty boxes cannot overflow.
 *
 * @param element - A measured element.
 */
function hasArea(element: ElementSnapshot): boolean {
  return element.rect.width > 0 && element.rect.height > 0;
}

/**
 * Whether the element's nearest recorded ancestor already overflows, so only that one is reported.
 *
 * @param element - A measured element.
 * @param exceeding - Indexes of the elements that overflow.
 */
function hasExceedingParent(element: ElementSnapshot, exceeding: ReadonlySet<number>): boolean {
  return element.parent !== null && exceeding.has(element.parent);
}

/**
 * How far the element reaches past each canvas edge.
 *
 * @param element - A measured element.
 * @param snapshot - The slide, for the canvas size.
 */
function overhang(element: ElementSnapshot, snapshot: StepSnapshot): Sides {
  const { x, y, width, height } = element.rect;
  return {
    left: -x,
    top: -y,
    right: x + width - snapshot.canvas.width,
    bottom: y + height - snapshot.canvas.height,
  };
}

/**
 * The edges the element reaches past by more than the overflow tolerance.
 *
 * @param element - A measured element.
 * @param snapshot - The slide, for the canvas size.
 */
function edgesOutside(element: ElementSnapshot, snapshot: StepSnapshot): (keyof Sides)[] {
  const sides = overhang(element, snapshot);
  const names: (keyof Sides)[] = ['left', 'top', 'right', 'bottom'];
  return names.filter((name) => sides[name] > OVERFLOW_TOLERANCE_PX);
}

/**
 * The overflow in words, such as `40px past the right edge`.
 *
 * @param element - A measured element.
 * @param snapshot - The slide, for the canvas size.
 */
function describeOverhang(element: ElementSnapshot, snapshot: StepSnapshot): string {
  const sides = overhang(element, snapshot);
  return edgesOutside(element, snapshot)
    .map((name) => `${Math.round(sides[name])}px past the ${name} edge`)
    .join(', ');
}
