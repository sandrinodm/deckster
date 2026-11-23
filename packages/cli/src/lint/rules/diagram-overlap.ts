import type { SlideRule } from '#lint/types.ts';

import { diagramName, diagramsOn } from '#lint/rules/diagram-elements.ts';

/**
 * A diagram whose layout drew nodes or groups on top of each other (the kit lists the pairs in
 * `data-diagram-overlap`): an automatic layout with more ranks than fit, groups that cannot both
 * wrap their nodes, a group label under a node.
 */
export const diagramOverlapRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'diagram-overlap',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * What is shown changes with the step.
   */
  scope: 'step',

  /**
   * Boxes on top of each other hide what they say; it fails the deck.
   */
  severity: 'error',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description: 'A diagram draws nodes, groups or group labels on top of each other.',

  /**
   * Reports each diagram with overlapping parts, naming them.
   */
  check: ({ snapshot, slide }) =>
    diagramsOn(snapshot).flatMap((diagram) => {
      const overlaps = diagram.root.data['diagram-overlap'];
      if (overlaps === undefined || overlaps === '') {
        return [];
      }

      return [
        {
          message: `${diagramName(diagram)} draws ${overlaps} on top of each other.`,
          fix:
            `Give the nodes grid cells (col, row) a cell apart, use fewer rows or columns, or ` +
            `for an automatic layout set direction="right" (or split the diagram) ` +
            `in ${slide.file}.`,
          selector: diagram.root.selector,
          key: diagram.root.selector,
        },
      ];
    }),
};
