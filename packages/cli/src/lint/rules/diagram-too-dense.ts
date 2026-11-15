import { DIAGRAM_EDGE_BUDGET, DIAGRAM_NODE_BUDGET } from '@deckster/kit/diagram-catalog';

import type { SlideRule } from '#lint/types.ts';

import { diagramName, diagramsOn } from '#lint/rules/diagram-elements.ts';

/**
 * A diagram that shows more nodes or edges at one step than a slide can carry, or whose nodes had
 * to be packed tighter than the gutters allow (the kit marks it `data-diagram-cramped`).
 */
export const diagramTooDenseRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'diagram-too-dense',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * What is shown changes with the step.
   */
  scope: 'step',

  /**
   * A dense diagram still renders; it is a warning.
   */
  severity: 'warning',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description:
    `A diagram shows more than ${DIAGRAM_NODE_BUDGET} nodes or ${DIAGRAM_EDGE_BUDGET} edges ` +
    'at once, or its nodes are packed tighter than its gutters.',

  /**
   * Reports each diagram over budget or cramped.
   */
  check: ({ snapshot, slide }) =>
    diagramsOn(snapshot).flatMap((diagram) => {
      const nodes = Number(diagram.root.data['diagram-nodes'] ?? 0);
      const edges = Number(diagram.root.data['diagram-edges'] ?? 0);
      const cramped = diagram.root.data['diagram-cramped'] === 'true';
      if (nodes <= DIAGRAM_NODE_BUDGET && edges <= DIAGRAM_EDGE_BUDGET && !cramped) {
        return [];
      }

      const counts = `${nodes} nodes and ${edges} edges`;
      return [
        {
          message: cramped
            ? `${diagramName(diagram)} packs its ${counts} tighter than its gutters allow, ` +
              'so edges and labels crowd.'
            : `${diagramName(diagram)} shows ${counts} at once; ` +
              `a slide carries about ${DIAGRAM_NODE_BUDGET} nodes ` +
              `and ${DIAGRAM_EDGE_BUDGET} edges.`,
          fix:
            `Split the diagram over two slides, group the minor nodes into one, ` +
            'or reveal parts by ' +
            `step with \`at\` in ${slide.file}; for a cramped grid, use fewer columns or rows.`,
          selector: diagram.root.selector,
          key: diagram.root.selector,
        },
      ];
    }),
};
