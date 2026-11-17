import type {
  DescribedEdge,
  DescribedNode,
  DescribedText,
  DiagramDescription,
} from '@deckster/kit/diagram-description';

/**
 * A described text.
 *
 * @param text - The text.
 * @param box - Where it is set.
 * @param overrides - Fields that differ.
 */
export function describedText(
  text: string,
  box: DescribedText['box'],
  overrides: Partial<DescribedText> = {},
): DescribedText {
  return {
    text,
    box,
    color: '#161920',
    fontFamily: 'Inter',
    fontSizePx: 24,
    fontWeight: 450,
    align: 'center',
    opacity: 1,
    ...overrides,
  };
}

/**
 * A card node with a centred title.
 *
 * @param id - The node id.
 * @param box - Its box.
 * @param overrides - Fields that differ.
 */
export function describedNode(
  id: string,
  box: DescribedNode['box'],
  overrides: Partial<DescribedNode> = {},
): DescribedNode {
  const { x, y, width, height } = box;
  return {
    id,
    kind: 'service',
    state: 'default',
    shape: 'roundRect',
    path: `M${x} ${y}H${x + width}V${y + height}H${x}Z`,
    box,
    radius: 12,
    paint: { fill: '#f4f5f8', stroke: '#d9dce4', strokeWidth: 2, dashed: false, opacity: 1 },
    texts: [
      describedText(id.toUpperCase(), {
        x: x + width / 2 - 50,
        y: y + height / 2 - 17,
        width: 100,
        height: 34,
      }),
    ],
    icon: null,
    group: null,
    ...overrides,
  };
}

/**
 * An edge between two nodes along a route.
 *
 * @param from - The start node.
 * @param to - The end node.
 * @param points - The route.
 * @param overrides - Fields that differ.
 */
export function describedEdge(
  from: string,
  to: string,
  points: DescribedEdge['points'],
  overrides: Partial<DescribedEdge> = {},
): DescribedEdge {
  return {
    id: `${from}->${to}`,
    from,
    to,
    route: 'orthogonal',
    points,
    path: points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' '),
    cornerRadius: 0,
    color: '#555c6a',
    width: 2,
    dashed: false,
    arrowStart: false,
    arrowEnd: true,
    tone: 'default',
    opacity: 1,
    label: null,
    ...overrides,
  };
}

/**
 * A flow diagram: an API card, a database on the right and a gateway hexagon below, with a straight
 * edge, a bent edge and an edge that leaves the API off the middle of its side.
 *
 * @param overrides - Fields that differ.
 */
export function describedDiagram(overrides: Partial<DiagramDescription> = {}): DiagramDescription {
  return {
    version: 1,
    kind: 'flow',
    id: 'flow-a',
    step: 0,
    box: { x: 100, y: 300, width: 1200, height: 600 },
    summary: '3 nodes and 3 connections.',
    groups: [],
    nodes: [
      describedNode('api', { x: 100, y: 300, width: 200, height: 100 }),
      describedNode('db', { x: 600, y: 300, width: 200, height: 100 }, { shape: 'can' }),
      describedNode('gate', { x: 600, y: 700, width: 200, height: 100 }, { shape: 'hexagon' }),
    ],
    edges: [
      describedEdge('api', 'db', [
        { x: 300, y: 350 },
        { x: 597, y: 350 },
      ]),
      describedEdge('api', 'gate', [
        { x: 200, y: 400 },
        { x: 200, y: 750 },
        { x: 597, y: 750 },
      ]),
      describedEdge('api', 'db', [
        { x: 260, y: 300 },
        { x: 260, y: 250 },
        { x: 700, y: 250 },
        { x: 700, y: 297 },
      ]),
    ],
    texts: [],
    packets: [],
    lines: [],
    ...overrides,
  };
}

/**
 * The flow diagram with cards: the API card raised (a hard shadow cast under the edges) with an
 * accent stripe on its left, the gateway hexagon with a stripe on top, and dot arrowheads.
 *
 * @param overrides - Fields that differ.
 */
export function describedCardDiagram(
  overrides: Partial<DiagramDescription> = {},
): DiagramDescription {
  const base = describedDiagram();
  return {
    ...base,
    nodes: base.nodes.map((node) => {
      switch (node.id) {
        case 'api':
          return {
            ...node,
            card: 'raised',
            shadow: {
              layers: [{ x: 8, y: 8, blur: 0, color: '#161920' }],
              fill: '#fcfcfd',
              opacity: 1,
            },
            accent: {
              side: 'left' as const,
              box: { x: 100, y: 300, width: 10, height: 100 },
              color: '#2d4ae0',
              opacity: 1,
            },
          };
        case 'gate':
          return {
            ...node,
            path: 'M620 700H780L800 750L780 800H620L600 750Z',
            card: 'stripe',
            accent: {
              side: 'top' as const,
              box: { x: 600, y: 700, width: 200, height: 8 },
              color: '#2d4ae0',
              opacity: 1,
            },
          };
        default:
          return node;
      }
    }),
    edges: base.edges.map((edge) => ({ ...edge, arrow: 'dot' as const })),
    ...overrides,
  };
}
