import type { Box, ElementSnapshot, SlideRule } from '#lint/types.ts';

import { diagramName, diagramsOn, partName, partsOf } from '#lint/rules/diagram-elements.ts';
import { overlapOf } from '#lint/rules/elements.ts';

/**
 * How far two boxes must overlap, in canvas pixels each way, to count.
 */
const OVERLAP_TOLERANCE_PX = 2;

/**
 * An edge label of a diagram that covers a node, a group label or another edge label, or that the
 * kit could not place clear of them (it marks such labels `data-label-overlap`).
 */
export const diagramLabelOverlapRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'diagram-label-overlap',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * What is shown changes with the step.
   */
  scope: 'step',

  /**
   * A covered node or label is hard to read; it is a warning, the text rules catch unreadable text.
   */
  severity: 'warning',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description: 'A diagram edge label covers a node, a group label or another edge label.',

  /**
   * Reports each edge label that overlaps something it should keep clear of.
   */
  check: ({ snapshot, slide }) =>
    diagramsOn(snapshot).flatMap((diagram) => {
      const labels = partsOf(diagram, 'edge-label').filter((label) => label.opacity > 0);
      const blockers = [...partsOf(diagram, 'node'), ...partsOf(diagram, 'group-label')];
      return labels.flatMap((label, index) => {
        const covered = [
          ...blockers.filter((other) => overlaps(label.rect, other.rect)),
          ...labels.slice(index + 1).filter((other) => overlaps(label.rect, other.rect)),
        ];
        const flagged = label.data['label-overlap'] === 'true';
        if (covered.length === 0 && !flagged) {
          return [];
        }

        const [firstCovered] = covered;
        const what =
          firstCovered === undefined
            ? crowding(label, blockers, labels, diagram.root)
            : `over ${partName(firstCovered)}`;
        return [
          {
            message: `${diagramName(diagram)} has ${partName(label)} ${what}.`,
            fix:
              `Shorten the label, widen the gap between the nodes it joins (move them a column ` +
              `apart), or drop the label where the edge is obvious, in ${slide.file}.`,
            selector: label.selector,
          },
        ];
      });
    }),
};

/**
 * What crowds a label the kit could not place clear: the diagram's edge when it runs past it, else
 * the nearest node or label.
 *
 * @param label - The label.
 * @param blockers - Nodes and group labels.
 * @param labels - Edge labels.
 * @param root - The diagram's root.
 */
function crowding(
  label: ElementSnapshot,
  blockers: readonly ElementSnapshot[],
  labels: readonly ElementSnapshot[],
  root: ElementSnapshot,
): string {
  const { rect } = label;
  const outside =
    rect.x < root.rect.x ||
    rect.y < root.rect.y ||
    rect.x + rect.width > root.rect.x + root.rect.width ||
    rect.y + rect.height > root.rect.y + root.rect.height;
  if (outside) {
    return 'running past the edge of the diagram';
  }

  const nearest = [...blockers, ...labels.filter((other) => other !== label)]
    .map((other) => ({ other, gap: gapBetween(rect, other.rect) }))
    .sort((a, b) => a.gap - b.gap)[0];
  return nearest === undefined
    ? 'with no free place beside its edge'
    : `squeezed against ${partName(nearest.other)}`;
}

/**
 * The gap between two boxes, 0 when they touch or overlap.
 *
 * @param a - A box.
 * @param b - Another.
 */
function gapBetween(a: Box, b: Box): number {
  const x = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), 0);
  const y = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height), 0);
  return Math.hypot(x, y);
}

/**
 * Whether two boxes overlap by more than the tolerance in both directions.
 *
 * @param a - A box.
 * @param b - Another box.
 */
function overlaps(a: Box, b: Box): boolean {
  const { width, height } = overlapOf(a, b);
  return width > OVERLAP_TOLERANCE_PX && height > OVERLAP_TOLERANCE_PX;
}
