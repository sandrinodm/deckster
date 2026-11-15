import type { SlideRule } from '#lint/types.ts';

import { diagramName, diagramsOn } from '#lint/rules/diagram-elements.ts';

/**
 * A node's badge that sits on an edge or its arrowhead because no corner of the node was free (the
 * kit moves a badge to a free corner first and lists the ones it could not clear in
 * `data-diagram-badge-overlap`). A warning, not an error like `diagram-overlap`: the badge and the
 * edge are both drawn and readable, the line is only hidden behind the pill.
 */
export const diagramBadgeOverlapRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'diagram-badge-overlap',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * What is shown changes with the step.
   */
  scope: 'step',

  /**
   * The badge hides a stretch of an edge or its arrowhead, which the reader can still follow; a
   * warning.
   */
  severity: 'warning',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description: 'A diagram badge sits on an edge or its arrowhead.',

  /**
   * Reports each diagram with a badge on an edge, naming both.
   */
  check: ({ snapshot, slide }) =>
    diagramsOn(snapshot).flatMap((diagram) => {
      const overlaps = diagram.root.data['diagram-badge-overlap'];
      if (overlaps === undefined || overlaps === '') {
        return [];
      }

      return [
        {
          message: `${diagramName(diagram)} draws ${overlaps}, hiding part of the line or its arrowhead.`,
          fix:
            `Move the edge to another side of the node with fromSide/toSide, drop or shorten the ` +
            `badge, or give the node more room, in ${slide.file}.`,
          selector: diagram.root.selector,
          key: diagram.root.selector,
        },
      ];
    }),
};
