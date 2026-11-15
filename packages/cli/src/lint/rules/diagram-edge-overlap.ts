import type { SlideRule } from '#lint/types.ts';

import { diagramName, diagramsOn } from '#lint/rules/diagram-elements.ts';

/**
 * Edges that share no node but run along one line, so they read as one edge (the kit lists what its
 * router could not keep apart in `data-diagram-edge-overlap`).
 */
export const diagramEdgeOverlapRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'diagram-edge-overlap',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * What is shown changes with the step.
   */
  scope: 'step',

  /**
   * The edges are drawn, but a reader cannot follow them; a warning.
   */
  severity: 'warning',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description: 'Two diagram edges that share no node run along one line and read as one.',

  /**
   * Reports each diagram with edges on one line, naming them.
   */
  check: ({ snapshot, slide }) =>
    diagramsOn(snapshot).flatMap((diagram) => {
      const overlaps = diagram.root.data['diagram-edge-overlap'];
      if (overlaps === undefined || overlaps === '') {
        return [];
      }

      return [
        {
          message:
            `${diagramName(diagram)} runs ${overlaps} along one line, ` +
            'so they read as one edge.',
          fix:
            `Move one of their nodes to another row or column, pick other sides with ` +
            `fromSide/toSide, or split the diagram, in ${slide.file}.`,
          selector: diagram.root.selector,
          key: diagram.root.selector,
        },
      ];
    }),
};
