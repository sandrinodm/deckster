import type { Box, ElementSnapshot, SlideRule, StepSnapshot } from '#lint/types.ts';

import { OVERFLOW_TOLERANCE_PX } from '#lint/limits.ts';
import { describeElement } from '#lint/rules/describe.ts';
import {
  ancestorsOf,
  CLIPPING_VALUES,
  decorativeElements,
  lineBoxes,
} from '#lint/rules/elements.ts';

/**
 * How far content reaches past each side of a container's padding box, in canvas pixels, and the
 * element that reaches furthest.
 */
type Excess = {
  /**
   * Past the top.
   */
  top: number;

  /**
   * Past the right.
   */
  right: number;

  /**
   * Past the bottom.
   */
  bottom: number;

  /**
   * Past the left.
   */
  left: number;

  /**
   * The element whose box reaches furthest out.
   */
  culprit: ElementSnapshot;
};

/**
 * Content larger than the box that holds it: clipped when the box hides overflow, spilling out when
 * it does not. Content is measured by its boxes and its lines of text at their line height, so a
 * font taller than tight leading is not overflow. Decoration (`aria-hidden`, `data-decorative`, and
 * absolutely positioned shapes with no text) is ignored, and so is SVG geometry, but not SVG text:
 * a chart label drawn past its plot is content outside its box. In a chain of overflowing boxes the
 * innermost is reported, and so is any box further out that overflows by more than everything
 * inside it, so a small spill inside does not hide a large one around it.
 */
export const containerOverflowRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'container-overflow',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * What is visible changes with the step.
   */
  scope: 'step',

  /**
   * Overflowing a container fails the deck.
   */
  severity: 'error',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description: 'Content is larger than its own container and is clipped or spills out of it.',

  /**
   * Reports the innermost element of each chain of overflowing boxes, and the boxes around it that
   * overflow by more.
   */
  check: ({ snapshot }) => {
    const decorative = decorativeElements(snapshot);
    const children = childLists(snapshot);
    const overflowing = new Map<number, Excess>();
    for (const element of snapshot.elements) {
      if (!isContainer(element) || decorative.has(element.index)) {
        continue;
      }

      const excess = measureExcess(element, contentOf(element, children, decorative));
      if (excess !== undefined && largest(excess) > OVERFLOW_TOLERANCE_PX) {
        overflowing.set(element.index, excess);
      }
    }

    const reported = reportedOverflows(overflowing, snapshot);
    return [...overflowing]
      .filter(([index]) => reported.has(index))
      .flatMap(([index, excess]) => {
        const element = snapshot.elements[index];
        if (element === undefined) {
          return [];
        }

        return [
          {
            message: `${describeElement(element)} holds ${describeExcess(element, excess)}.`,
            fix:
              'Shorten or remove content inside it, split the slide, or give the container ' +
              'room by simplifying the layout around it. Mark decoration that is meant to bleed ' +
              'out with `aria-hidden="true"` or `data-decorative`.',
            selector: element.selector,
          },
        ];
      });
  },
};

/**
 * The overflowing boxes worth reporting: those with no overflowing box inside them, and those that
 * overflow by more than every overflowing box inside them.
 *
 * @param overflowing - Every overflowing box, by element index, with its excess.
 * @param snapshot - The measured slide.
 * @returns The indexes to report.
 */
function reportedOverflows(
  overflowing: ReadonlyMap<number, Excess>,
  snapshot: StepSnapshot,
): ReadonlySet<number> {
  const worstInside = new Map<number, number>();
  for (const [index, excess] of overflowing) {
    const element = snapshot.elements[index];
    for (const ancestor of element === undefined ? [] : ancestorsOf(element, snapshot)) {
      if (overflowing.has(ancestor)) {
        worstInside.set(ancestor, Math.max(worstInside.get(ancestor) ?? 0, largest(excess)));
      }
    }
  }

  const reported = new Set<number>();
  for (const [index, excess] of overflowing) {
    const inside = worstInside.get(index);
    if (inside === undefined || largest(excess) > inside + OVERFLOW_TOLERANCE_PX) {
      reported.add(index);
    }
  }

  return reported;
}

/**
 * Whether the element is a box that holds content: laid out with a size, not inline, not inside an
 * SVG.
 *
 * @param element - A measured element.
 */
function isContainer(element: ElementSnapshot): boolean {
  const hasBox = element.clientWidth > 0 || element.clientHeight > 0;
  return hasBox && element.display !== 'inline' && !element.inSvg;
}

/**
 * The recorded children of every element, by index.
 *
 * @param snapshot - The measured slide.
 */
function childLists(snapshot: StepSnapshot): ElementSnapshot[][] {
  const children: ElementSnapshot[][] = snapshot.elements.map(() => []);
  for (const element of snapshot.elements) {
    if (element.parent !== null) {
      children[element.parent]?.push(element);
    }
  }

  return children;
}

/**
 * The boxes of everything a container holds, each with the element it belongs to: the container's
 * own lines of text, and its descendants' boxes (inline ones by their lines of text). Inside an SVG
 * only text counts, by its lines. Decoration is left out, and so is whatever sits inside a
 * descendant that clips, which gets checked on its own.
 *
 * @param container - The container.
 * @param children - The recorded children of every element.
 * @param decorative - The decorative elements.
 */
function contentOf(
  container: ElementSnapshot,
  children: readonly ElementSnapshot[][],
  decorative: ReadonlySet<number>,
): { box: Box; element: ElementSnapshot }[] {
  const content = lineBoxes(container).map((box) => ({ box, element: container }));
  const pending = [...(children[container.index] ?? [])];
  for (let next = pending.shift(); next !== undefined; next = pending.shift()) {
    const element = next;
    if (decorative.has(element.index)) {
      continue;
    }

    if (element.inSvg) {
      // An SVG's shapes are drawing, but its text is content: a label set past the box that holds
      // the drawing runs into the margins or under its neighbours just as HTML text would.
      content.push(...lineBoxes(element).map((box) => ({ box, element })));
      pending.push(...(children[element.index] ?? []));
      continue;
    }

    const boxes = element.display === 'inline' ? lineBoxes(element) : [element.rect];
    content.push(...boxes.map((box) => ({ box, element })));
    if (!clips(element)) {
      pending.push(...(children[element.index] ?? []));
    }
  }

  return content;
}

/**
 * Whether an element clips its content in either direction.
 *
 * @param element - A measured element.
 */
function clips(element: ElementSnapshot): boolean {
  return CLIPPING_VALUES.has(element.overflowX) || CLIPPING_VALUES.has(element.overflowY);
}

/**
 * How far the content reaches past each side of the container's padding box.
 *
 * @param container - The container.
 * @param content - The boxes it holds.
 * @returns The excess, or `undefined` when it holds nothing.
 */
function measureExcess(
  container: ElementSnapshot,
  content: readonly { box: Box; element: ElementSnapshot }[],
): Excess | undefined {
  const first = content[0];
  if (first === undefined) {
    return undefined;
  }

  const inner = container.innerRect;
  let excess: Excess = { top: 0, right: 0, bottom: 0, left: 0, culprit: first.element };
  let furthest = 0;
  for (const { box, element } of content) {
    const sides = {
      top: inner.y - box.y,
      right: box.x + box.width - (inner.x + inner.width),
      bottom: box.y + box.height - (inner.y + inner.height),
      left: inner.x - box.x,
    };
    const reach = Math.max(sides.top, sides.right, sides.bottom, sides.left);
    excess = {
      top: Math.max(excess.top, sides.top),
      right: Math.max(excess.right, sides.right),
      bottom: Math.max(excess.bottom, sides.bottom),
      left: Math.max(excess.left, sides.left),
      culprit: reach > furthest ? element : excess.culprit,
    };
    furthest = Math.max(furthest, reach);
  }

  return excess;
}

/**
 * The largest excess on any side.
 *
 * @param excess - The excess per side.
 */
function largest(excess: Excess): number {
  return Math.max(excess.top, excess.right, excess.bottom, excess.left);
}

/**
 * The excess in words, whether the box clips it or lets it spill out, and what reaches furthest.
 *
 * @param element - An overflowing element.
 * @param excess - Its excess per side.
 */
function describeExcess(element: ElementSnapshot, excess: Excess): string {
  const height = Math.max(0, excess.top) + Math.max(0, excess.bottom);
  const width = Math.max(0, excess.left) + Math.max(0, excess.right);
  const parts: string[] = [];
  if (Math.max(excess.top, excess.bottom) > OVERFLOW_TOLERANCE_PX) {
    parts.push(`${Math.round(height)}px more height than it has`);
  }

  if (Math.max(excess.left, excess.right) > OVERFLOW_TOLERANCE_PX) {
    parts.push(`${Math.round(width)}px more width than it has`);
  }

  const clipped = clips(element) ? 'clipped' : 'spills out of it';
  const culprit =
    excess.culprit.index === element.index ? 'its own text' : describeElement(excess.culprit);
  return `${parts.join(' and ')} (${clipped}); ${culprit} reaches furthest`;
}
