import type { DiagramDescription } from '@deckster/kit/diagram-description';

import { isDrawableDiagram } from '#diagram/decode-diagram.ts';
import { connectorGeometry, simplifyRoute } from '#diagram/diagram-routes.ts';
import { touchesBox } from '#diagram/diagram-sites.ts';

/**
 * What the dry run says about a described diagram.
 */
export type DiagramPlanNote = {
  /**
   * `native` when every part is drawn as the page draws it, `simplified` when some part looks
   * different.
   */
  outcome: 'native' | 'simplified';

  /**
   * What is drawn and what differs, as a short phrase.
   */
  why: string;
};

/**
 * Describes how a diagram is exported: its shapes, its connectors (glued where they end on a node,
 * bent with adjust values, or freeform where no connector preset draws the route), and what looks
 * different from the page: freeform lines cannot be glued, and bent connectors have square corners
 * where the page rounds them.
 *
 * @param diagram - The description.
 */
export function diagramPlanNote(diagram: DiagramDescription): DiagramPlanNote {
  if (!isDrawableDiagram(diagram)) {
    return {
      outcome: 'native',
      why:
        `${diagram.kind} diagram drawn from its page elements; ` +
        'its description has no shapes or connectors',
    };
  }

  const { connectors, glued, squared, freeform } = tallyConnectors(diagram);
  const parts = [
    `${diagram.nodes.length} shapes`,
    `${connectors} connectors (${glued} glued at both ends)`,
    ...(diagram.groups.length > 0 ? [`${diagram.groups.length} groups`] : []),
  ];
  const differences = [
    ...(freeform.length > 0
      ? [`${freeform.length} curved or complex route(s) drawn as freeform lines, not glued`]
      : []),
    ...(squared > 0 ? [`${squared} bent connector(s) with square corners`] : []),
  ];
  return {
    outcome: differences.length > 0 ? 'simplified' : 'native',
    why: [parts.join(', '), ...differences].join('; '),
  };
}

/**
 * What the connectors of a drawable diagram come to: how many there are, how many are glued to a
 * node at both ends, the ids of the freeform ones and how many bent ones have square corners.
 */
type ConnectorTally = {
  /**
   * The connectors that have a preset geometry.
   */
  connectors: number;

  /**
   * Those whose both ends sit on a node.
   */
  glued: number;

  /**
   * Those bent with a rounded corner radius the preset draws square.
   */
  squared: number;

  /**
   * The ids of the curved or complex routes no preset draws.
   */
  freeform: string[];
};

/**
 * Counts the connectors of a diagram by how each one exports.
 *
 * @param diagram - The description.
 */
function tallyConnectors(diagram: DiagramDescription): ConnectorTally {
  const nodes = new Map(diagram.nodes.map((node) => [node.id, node]));
  const tally: ConnectorTally = { connectors: 0, glued: 0, squared: 0, freeform: [] };
  for (const edge of diagram.edges) {
    const geometry = edge.route === 'curved' ? null : connectorGeometry(edge.points);
    if (geometry === null) {
      tally.freeform.push(edge.id);
      continue;
    }

    tally.connectors += 1;
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    const start = edge.points[0];
    const end = edge.points.at(-1);
    const startsOnNode = from !== undefined && start !== undefined && touchesBox(from.box, start);
    const endsOnNode = to !== undefined && end !== undefined && touchesBox(to.box, end);
    if (startsOnNode && endsOnNode) {
      tally.glued += 1;
    }

    if (edge.cornerRadius > 0 && simplifyRoute(edge.points).length > 2) {
      tally.squared += 1;
    }
  }

  return tally;
}
