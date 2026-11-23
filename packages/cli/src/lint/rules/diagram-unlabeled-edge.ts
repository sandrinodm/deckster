import type { ElementSnapshot, SlideRule } from '#lint/types.ts';

import { diagramName, diagramsOn, partsOf } from '#lint/rules/diagram-elements.ts';

/**
 * An unlabeled diagram edge whose meaning is ambiguous: it joins the same two nodes as another
 * edge, or it leaves a node whose other edges are labeled, so a reader cannot tell what it carries.
 * Edges that read on their own (one arrow between two boxes) need no label.
 */
export const diagramUnlabeledEdgeRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'diagram-unlabeled-edge',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * Edges do not change their labels by step; checked once on the last step.
   */
  scope: 'slide',

  /**
   * A judgement call; it is a warning.
   */
  severity: 'warning',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description:
    'A diagram edge without a label is ambiguous: it doubles another edge, ' +
    'or its siblings are labeled.',

  /**
   * Reports each ambiguous unlabeled edge.
   */
  check: ({ snapshot, slide }) =>
    diagramsOn(snapshot).flatMap((diagram) => {
      const edges = partsOf(diagram, 'edge');
      return edges
        .filter((edge) => isAmbiguous(edge, edges))
        .map((edge) => ({
          message:
            `${diagramName(diagram)} has an unlabeled edge ` +
            `from "${edge.data['edge-from'] ?? '?'}" ` +
            `to "${edge.data['edge-to'] ?? '?'}" ` +
            'that a reader cannot tell apart from its neighbours.',
          fix:
            `Give the <Edge> a short \`label\` (what it carries: HTTPS, publish, rows) ` +
            `in ${slide.file}.`,
          selector: edge.selector,
          key: edge.data['edge'] ?? edge.selector,
        }));
    }),
};

/**
 * Whether an edge is unlabeled and ambiguous among the diagram's edges.
 *
 * @param edge - An edge.
 * @param edges - Every edge of its diagram.
 */
function isAmbiguous(edge: ElementSnapshot, edges: readonly ElementSnapshot[]): boolean {
  if (edge.data['edge-label'] !== undefined) {
    return false;
  }

  const from = edge.data['edge-from'];
  const to = edge.data['edge-to'];
  const others = edges.filter((other) => other !== edge);
  const doubled = others.some(
    (other) =>
      (other.data['edge-from'] === from && other.data['edge-to'] === to) ||
      (other.data['edge-from'] === to && other.data['edge-to'] === from),
  );
  const siblings = others.filter((other) => other.data['edge-from'] === from);
  const labeledSiblings = siblings.some((other) => other.data['edge-label'] !== undefined);
  return doubled || labeledSiblings;
}
