import {
  DIAGRAM_EDGE_BUDGET,
  DIAGRAM_GRID_LIMITS,
  DIAGRAM_HARD_LIMITS,
  DIAGRAM_NODE_BUDGET,
  LABEL_MAX_CHARS,
  LABEL_MAX_LINES,
  MIN_BREAK_CHARS,
  TITLE_MAX_LINES,
} from '#diagrams/diagram-limits.ts';
import {
  componentProps,
  DIAGRAM_ROOT_NAMES,
  EDGE_FLOW_PROPS,
  SHARED_DIAGRAM_PROP_INFO,
  STATE_SYNONYMS,
  type DiagramComponentName,
  type DiagramPropInfo,
  type SharedDiagramPropName,
} from '#diagrams/diagram-props.ts';
import { DIAGRAM_STATES, EDGE_ARROWS, EDGE_ROUTES, PACKET_ROLES } from '#diagrams/flow-spec.ts';
import { NODE_KIND_ALIASES, NODE_KINDS, type NodeKind } from '#diagrams/node-kinds.ts';
import { SVG_ROLES } from '#diagrams/svg-roles.ts';

export {
  DIAGRAM_EDGE_BUDGET,
  DIAGRAM_GRID_LIMITS,
  DIAGRAM_HARD_LIMITS,
  DIAGRAM_NODE_BUDGET,
  LABEL_MAX_CHARS,
  LABEL_MAX_LINES,
  TITLE_MAX_LINES,
} from '#diagrams/diagram-limits.ts';
export {
  checkDiagramProps,
  DIAGRAM_PROPS,
  type DiagramComponentName,
  type DiagramPropInfo,
} from '#diagrams/diagram-props.ts';

/**
 * One entry of the diagram catalog: an option or animation primitive with when to use it and an
 * example.
 */
export type DiagramCatalogEntry = {
  /**
   * The tag without brackets or the option, such as `Flow`, `Packet` or `dashed / async`, as `deck
   * charts` and `deck components` name theirs.
   */
  name: string;

  /**
   * When to reach for it, in a sentence.
   */
  useWhen: string;

  /**
   * MDX that uses it.
   */
  example: string;
};

/**
 * One diagram component or part, as `deck diagrams --json` prints it.
 */
export type DiagramComponentInfo = DiagramCatalogEntry & {
  /**
   * The tag without brackets, such as `Flow`.
   */
  name: DiagramComponentName;

  /**
   * `diagram` for a component that draws a figure, `part` for an element inside one.
   */
  role: 'diagram' | 'part';

  /**
   * Where a part goes, such as `<Flow>, <Tree> or <Cycle>`; `null` for a diagram.
   */
  inside: string | null;

  /**
   * The shared props it takes, by name: each is described once in the catalog's `shared`.
   */
  shared: readonly SharedDiagramPropName[];

  /**
   * Its own props, by name. A name in neither `shared` nor here is not a prop: the build fails with
   * the closest one ("`lable` is not a prop of <Edge>; did you mean `label`?").
   */
  props: Readonly<Record<string, DiagramPropInfo>>;

  /**
   * What goes inside it; empty when nothing does.
   */
  children: string;

  /**
   * The numbers `deck lint` and the renderer hold it to.
   */
  limits: Readonly<Record<string, number | string>>;

  /**
   * What happens to its long titles and labels, only where that differs from the catalog's
   * `longText`, which every component that wraps node and edge text follows.
   */
  longText?: string;
};

/**
 * One node kind in the catalog.
 */
export type NodeKindEntry = {
  /**
   * The kind, as `kind="..."` takes it.
   */
  kind: NodeKind;

  /**
   * Other names that mean the same kind.
   */
  aliases: readonly string[];

  /**
   * The shape it is drawn with.
   */
  shape: string;

  /**
   * Its icon in each icon set the kit maps; `null` for kinds without one.
   */
  icons: Readonly<Record<string, string>> | null;

  /**
   * When to pick it.
   */
  useWhen: string;
};

/**
 * Cards: the node styles a brand defines, and how a node picks one.
 */
export type DiagramCardGuide = {
  /**
   * How a node's card is chosen, in order, and what happens to a name the brand does not have.
   */
  resolution: string;

  /**
   * The cards every brand has, by name, with their look when the brand does not restyle them.
   */
  standard: Readonly<Record<string, string>>;

  /**
   * Where the brand's own cards come from and how to list them.
   */
  custom: string;

  /**
   * What a card does not change: states, focus, and the bands of a stack.
   */
  rules: readonly string[];
};

/**
 * How to write diagrams in a TSX slide.
 */
export type DiagramTsxGuide = {
  /**
   * The import line.
   */
  import: string;

  /**
   * How icons work in TSX.
   */
  icons: string;

  /**
   * How mistakes are reported in TSX.
   */
  errors: string;

  /**
   * A TSX slide with a flow.
   */
  example: string;
};

/**
 * Everything `deck diagrams` lists: the shared props, every diagram component and part with its
 * props and limits, node kinds, edge options, animation primitives, emphasis states, packet roles,
 * the color roles an imported SVG can use, how long text is handled and how to write diagrams in
 * TSX.
 */
export type DiagramCatalog = {
  /**
   * The props several components share, described once; each component's `shared` names the ones it
   * takes.
   */
  shared: Readonly<Record<SharedDiagramPropName, DiagramPropInfo>>;

  /**
   * Every diagram component and part.
   */
  components: readonly DiagramComponentInfo[];

  /**
   * The node kinds.
   */
  nodeKinds: readonly NodeKindEntry[];

  /**
   * Options of `<Edge>`.
   */
  edgeOptions: readonly DiagramCatalogEntry[];

  /**
   * The fields of the object form of `<Edge flow>`.
   */
  edgeFlow: Readonly<Record<string, DiagramPropInfo>>;

  /**
   * Cards: the node styles a brand defines, the standard ones and how a node picks one.
   */
  cards: DiagramCardGuide;

  /**
   * Packets, journeys, state changes, focus and reveals.
   */
  animation: readonly DiagramCatalogEntry[];

  /**
   * The emphasis states of nodes and edges.
   */
  states: readonly string[];

  /**
   * Other words `state` and `is` accept, and the state each means.
   */
  stateSynonyms: Readonly<Record<string, string>>;

  /**
   * The color roles packets travel in.
   */
  packetRoles: readonly string[];

  /**
   * The color roles an `<Svg>` shape can take.
   */
  svgRoles: readonly string[];

  /**
   * The numbers `deck lint` holds diagrams to and the renderer wraps text by.
   */
  limits: Readonly<Record<string, number | string>>;

  /**
   * What happens to long node titles, subtitles and edge labels, said once for every component that
   * has them; a component with its own rule says it in its `longText`.
   */
  longText: string;

  /**
   * How to write diagrams in a TSX slide.
   */
  tsx: DiagramTsxGuide;

  /**
   * Notes that apply to every diagram.
   */
  notes: readonly string[];
};

/**
 * Where an edge, packet, state change or focus goes: inside a flow or a cycle.
 */
const FLOW_OR_CYCLE = '<Flow> or <Cycle>';

/**
 * The import line every TSX example starts with.
 */
const TSX_IMPORT = "import { Edge, Flow, Node } from '@deckster/kit/diagrams';";

/**
 * How long node and edge text is handled, in one sentence.
 */
const LONG_TEXT =
  `Node titles and subtitles wrap between words, up to ${TITLE_MAX_LINES} lines for a title; a node first widens ` +
  ('(up to fourteen captions, taking room from the gutters down to their ' +
    'least, every one-column node keeping one ') +
  ('width) until its widest whole word fits, and only a word wider than that ' +
    'breaks: at a camelCase boundary or ') +
  `after -, _, . or /, else with a hyphen, never leaving fewer than ${MIN_BREAK_CHARS} characters on a line. Edge ` +
  `labels take about ${LABEL_MAX_CHARS} characters a line (less between two columns the nodes widened into), at ` +
  `most ${LABEL_MAX_LINES} lines, broken the same way; what still does not fit is cut with an ellipsis, one identifier keeping its ` +
  ('start and end (OrderCancelled…Event), several words ending after a whole ' +
    'word. The full text stays in the ') +
  ('accessible summary; `deck lint` warns (diagram-long-word) for every text ' +
    'broken inside a word or cut. Keep ') +
  'labels to a word or two (HTTPS, publish) and titles to about 20 characters.';

/**
 * The limits of a flow-like diagram.
 */
const FLOW_LIMITS = {
  /**
   * The node budget.
   */
  nodes: DIAGRAM_NODE_BUDGET,

  /**
   * The edge budget.
   */
  edges: DIAGRAM_EDGE_BUDGET,

  /**
   * Comfortable columns.
   */
  columns: DIAGRAM_GRID_LIMITS.columns,

  /**
   * Columns before the diagram is cramped.
   */
  maxColumns: DIAGRAM_GRID_LIMITS.maxColumns,

  /**
   * Comfortable rows.
   */
  rows: DIAGRAM_GRID_LIMITS.rows,

  /**
   * Rows before the diagram is cramped.
   */
  maxRows: DIAGRAM_GRID_LIMITS.maxRows,

  /**
   * The most nodes a diagram has; more fails the build.
   */
  maxNodes: DIAGRAM_HARD_LIMITS.maxNodes,

  /**
   * The most edges a diagram has; more fails the build.
   */
  maxEdges: DIAGRAM_HARD_LIMITS.maxEdges,

  /**
   * The most particles one packet or edge flow sends together.
   */
  maxParticles: DIAGRAM_HARD_LIMITS.maxParticles,

  /**
   * The highest grid column, row, span or minimum size.
   */
  maxGridIndex: DIAGRAM_HARD_LIMITS.maxGridIndex,

  /**
   * The highest step an `at` or `until` names.
   */
  maxStep: DIAGRAM_HARD_LIMITS.maxStep,

  /**
   * Characters an edge label takes on a line.
   */
  labelChars: LABEL_MAX_CHARS,

  /**
   * Lines an edge label wraps to.
   */
  labelLines: LABEL_MAX_LINES,

  /**
   * Lines a node title wraps to.
   */
  titleLines: TITLE_MAX_LINES,

  /**
   * The fewest characters a word broken across lines leaves on a line.
   */
  minBreakChars: MIN_BREAK_CHARS,
} as const;

/**
 * What the catalog says about each component beyond its props.
 */
type ComponentText = {
  /**
   * When to reach for it.
   */
  useWhen: string;

  /**
   * MDX that uses it.
   */
  example: string;

  /**
   * Where a part goes; `null` for a diagram.
   */
  inside: string | null;

  /**
   * What goes inside.
   */
  children: string;

  /**
   * Its limits.
   */
  limits: Readonly<Record<string, number | string>>;

  /**
   * What happens to long text: the shared rule, its own, or empty when it has no text.
   */
  longText: string;
};

/**
 * The words of every component and part.
 */
const TEXTS: Readonly<Record<DiagramComponentName, ComponentText>> = {
  /**
   * `<Flow>`.
   */
  Flow: {
    useWhen:
      'Any system of boxes and arrows: an architecture, a request path, a ' +
      'pipeline. Place nodes with col/row ' +
      '(spans for wide nodes) or leave cells out for an automatic layout (`layout`, `direction`).',
    example: [
      '<Flow title="Checkout request path">',
      '  <Node id="web" kind="client" title="Web app" col={1} row={1} />',
      '  <Node id="api" kind="service" title="Orders API" col={2} row={1} />',
      '  <Node id="db" kind="database" title="Orders DB" col={3} row={1} />',
      '  <Edge from="web" to="api" label="HTTPS" />',
      '  <Edge from="api" to="db" label="SQL" />',
      '  <Journey at={1} path="web api db" back />',
      '</Flow>',
    ].join('\n'),
    inside: null,
    children:
      '<Node>, <Group>, <Edge>, <Packet>, <Journey>, <State> and <Focus>; at least one <Node>.',
    limits: FLOW_LIMITS,
    longText: LONG_TEXT,
  },

  /**
   * `<Node>`.
   */
  Node: {
    useWhen:
      'A box in a <Flow>, <Tree> or <Cycle>. `kind` sets its shape and icon; ' +
      '`icon` overrides it ("none" drops it).',
    example:
      '<Node id="db" kind="database" title="Orders DB" subtitle="Postgres 16" col={4} row={2} />',
    inside: '<Flow>, <Group>, <Tree> (nested in its parent <Node>) or <Cycle>',
    children:
      'In a <Tree>, its child <Node>s; in a <Flow>, optional content of your ' +
      'own instead of title and subtitle.',
    limits: { titleLines: TITLE_MAX_LINES },
    longText: LONG_TEXT,
  },

  /**
   * `<Group>`.
   */
  Group: {
    useWhen:
      'A labelled container (a VPC, a region, "Client side"): nest the nodes in ' +
      'it; it wraps them, or takes its own col/row/colSpan/rowSpan.',
    example:
      '<Group label="Production VPC">\n  <Node id="api" kind="service" ' +
      'title="API" col={2} row={1} />\n</Group>',
    inside: '<Flow> or another <Group>',
    children: '<Node>s and inner <Group>s.',
    limits: {},
    longText: 'The label sits on one line in the top-left corner; keep it to a few words.',
  },

  /**
   * `<Edge>`.
   */
  Edge: {
    useWhen:
      'A connection between two nodes; `to` equal to `from` draws a small loop ' +
      'on the node (a retry). In a <Cycle>, an <Edge> between consecutive ' +
      'stages labels or styles that arc.',
    example:
      '<Edge from="api" to="db" label="SQL" />\n<Edge from="worker" to="worker" label="retry" />',
    inside: FLOW_OR_CYCLE,
    children: '',
    limits: { labelChars: LABEL_MAX_CHARS, labelLines: LABEL_MAX_LINES },
    longText: LONG_TEXT,
  },

  /**
   * `<Packet>`.
   */
  Packet: {
    useWhen:
      'Traffic along edges on a step: `from`/`to` or a multi-hop `path`, `at` ' +
      '(plays while that step is current) and `until` (to keep playing), ' +
      '`reply` for out, pause and back. Loops by default; `play="once"` rests ' +
      'at the end. from = to rides a self loop.',
    example: '<Packet from="web" to="api" at={2} label="POST /orders" reply="201" />',
    inside: FLOW_OR_CYCLE,
    children: '',
    limits: {},
    longText: 'The tag rides on one line beside the packet; keep it to a few words.',
  },

  /**
   * `<Journey>`.
   */
  Journey: {
    useWhen:
      'A request travelling hop by hop, one hop per step: `path` with `back` ' +
      'for the response, or <Hop> children with their own labels and replies; ' +
      '`focus` dims everything off the path; travelled edges stay lit ' +
      '(`trail`); `pace="trip"` plays the whole path on one step.',
    example: '<Journey at={1} path="browser cdn gateway orders db" back focus />',
    inside: '<Flow>',
    children: '<Hop>s, instead of `path`.',
    limits: {},
    longText: '',
  },

  /**
   * `<Hop>`.
   */
  Hop: {
    useWhen: 'One hop of a <Journey>, with its own tag and reply.',
    example: '<Hop from="api" to="db" label="SELECT" reply="12 rows" />',
    inside: '<Journey>',
    children: '',
    limits: {},
    longText: '',
  },

  /**
   * `<State>`.
   */
  State: {
    useWhen:
      'Change a node or an edge from a step on: is="highlighted", "error", ' +
      '"success", "muted" or "default", with a `badge`.',
    example: '<State node="payments" at={3} is="error" badge="Timeout" until={5} />',
    inside: FLOW_OR_CYCLE,
    children: '',
    limits: {},
    longText:
      'The badge sits on one line on a corner of the node; keep it to a word or a number. It ' +
      ('takes the top right corner, and moves to the top left, bottom right or ' +
        'bottom left when an ') +
      'edge drawn at that step runs through the top right (the corner is chosen from the ' +
      'edges visible at each step, so it can change between steps). When no corner is free it ' +
      'stays on the one with the fewest edges and `deck lint` warns diagram-badge-overlap: move ' +
      'that edge to another side of the node (`fromSide`/`toSide`) or drop the badge.',
  },

  /**
   * `<Focus>`.
   */
  Focus: {
    useWhen: 'Dim everything but some nodes (and the edges between them) for a range of steps.',
    example: '<Focus at={4} nodes="api queue worker" />',
    inside: FLOW_OR_CYCLE,
    children: '',
    limits: {},
    longText: '',
  },

  /**
   * `<SequenceDiagram>`.
   */
  SequenceDiagram: {
    useWhen:
      'Who calls whom, in order: a protocol, an API handshake, a retry. ' +
      '<Actor>s across the top, <Message>s top to bottom; the current message ' +
      'animates.',
    example: [
      '<SequenceDiagram title="Charging once">',
      '  <Actor id="web" kind="client" title="Web app" />',
      '  <Actor id="api" kind="service" title="Payments API" />',
      '  <Message from="web" to="api" label="POST /charges" at={1} />',
      '  <Message from="api" to="web" label="201 Created" reply at={2} />',
      '</SequenceDiagram>',
    ].join('\n'),
    inside: null,
    children: '<Actor>s, then <Message>s in order.',
    limits: { actors: 6, messages: 10 },
    longText:
      'Actor titles wrap at word boundaries; message labels sit above their ' +
      'arrows on one line, so keep them short.',
  },

  /**
   * `<Actor>`.
   */
  Actor: {
    useWhen: 'A participant of a <SequenceDiagram>, drawn as a node over its lifeline.',
    example: '<Actor id="api" kind="service" title="Payments API" />',
    inside: '<SequenceDiagram>',
    children: '',
    limits: {},
    longText: LONG_TEXT,
  },

  /**
   * `<Message>`.
   */
  Message: {
    useWhen:
      'An arrow between lifelines; `reply` for a response, `async` for ' +
      'fire-and-forget, from = to for a call to itself.',
    example: '<Message from="web" to="api" label="POST /charges" at={1} />',
    inside: '<SequenceDiagram>',
    children: '',
    limits: {},
    longText: 'The label sits above its arrow on one line.',
  },

  /**
   * `<Timeline>`.
   */
  Timeline: {
    useWhen:
      'Milestones in time order, with where we are now: a roadmap, a migration, ' +
      'a history. The line fills up to the latest milestone shown, or the one ' +
      'marked `current`.',
    example:
      '<Timeline title="Migration">\n  <Milestone date="Q1" title="Split ' +
      'checkout" at={1}>Orders live</Milestone>\n  <Milestone date="Q2" ' +
      'title="Move payments" at={2} current />\n</Timeline>',
    inside: null,
    children: '<Milestone>s, in time order.',
    limits: { milestones: 6 },
    longText: 'Titles and details wrap at word boundaries within their column.',
  },

  /**
   * `<Milestone>`.
   */
  Milestone: {
    useWhen: 'One milestone of a <Timeline>: date, title and a short line of detail as children.',
    example:
      '<Milestone date="Q3 2026" title="Region cells" at={3} current>EU and US apart</Milestone>',
    inside: '<Timeline>',
    children: 'A short line of detail.',
    limits: {},
    longText: 'Wraps at word boundaries within its column.',
  },

  /**
   * `<Layers>`.
   */
  Layers: {
    useWhen:
      'A stacked architecture or ownership map: <Layer> bands top to bottom, ' +
      'each with <Item> chips.',
    example:
      '<Layers title="Platform">\n  <Layer title="Edge" subtitle="Platform team" ' +
      'at={1}>\n    <Item kind="gateway" title="API gateway" />\n  ' +
      '</Layer>\n</Layers>',
    inside: null,
    children: '<Layer>s, top to bottom.',
    limits: { layers: 6, itemsPerLayer: 6 },
    longText: 'Items wrap onto a second row of chips; layer names wrap at word boundaries.',
  },

  /**
   * `<Layer>`.
   */
  Layer: {
    useWhen:
      'One band of a <Layers> stack. While the stack is built, the band its `at` step adds is ' +
      'picked out; once the last band is in, only bands with `state` stand out, so mark the ' +
      'band the stack is about with `state="highlighted"`.',
    example:
      '<Layer title="Data" subtitle="Data team" at={4}>\n  <Item kind="database" ' +
      'title="Postgres" />\n</Layer>',
    inside: '<Layers>',
    children: '<Item>s.',
    limits: {},
    longText: '',
  },

  /**
   * `<Item>`.
   */
  Item: {
    useWhen: 'One building block in a <Layer>, as a chip with its kind’s icon.',
    example: '<Item kind="queue" title="Kafka" />',
    inside: '<Layer>',
    children: '',
    limits: {},
    longText: '',
  },

  /**
   * `<Cycle>`.
   */
  Cycle: {
    useWhen:
      'A loop of stages that repeats: an incident loop, a feedback cycle, an ' +
      'agent loop. `steps` walks it one stage per step; `spin` keeps a packet ' +
      'circling; an <Edge> between consecutive stages labels that arc.',
    example:
      '<Cycle title="Incident loop" steps>\n  <Node id="detect" title="Detect" ' +
      '/>\n  <Node id="respond" title="Respond" />\n  <Node id="learn" ' +
      'title="Learn" />\n  <Edge from="learn" to="detect" label="new alert" ' +
      '/>\n</Cycle>',
    inside: null,
    children: '<Node>s in order from the top, plus <Edge>, <State>, <Packet> and <Focus>.',
    limits: { stages: 8 },
    longText: LONG_TEXT,
  },

  /**
   * `<Tree>`.
   */
  Tree: {
    useWhen:
      'A hierarchy: an org chart, a decision tree, a module tree. Nest <Node>s; ' +
      '`direction` down or right; `at` on a node reveals its branch.',
    example:
      '<Tree title="Pricing rules">\n  <Node id="price" kind="decision" ' +
      'title="Price?">\n    <Node id="zone" title="Zone" />\n    <Node ' +
      'id="weight" title="Weight" at={1} />\n  </Node>\n</Tree>',
    inside: null,
    children: 'One root <Node>, its children nested inside it.',
    limits: { nodes: DIAGRAM_NODE_BUDGET, leaves: 7, depth: 4 },
    longText: LONG_TEXT,
  },

  /**
   * `<Svg>`.
   */
  Svg: {
    useWhen:
      'A drawing someone made (a floor plan, a product sketch, an exported ' +
      'figure): inlined and cleaned at build time (no scripts, event handlers ' +
      'or external references), it takes brand colors (`recolor`, or ' +
      'data-fill/data-stroke on shapes), reveals elements by id per step ' +
      '(`steps`) and can draw its strokes on (`draw`).',
    example:
      '<Svg src="../assets/floor.svg" title="The warehouse floor" steps={{ ' +
      'inbound: 1, sorting: 2 }} ' +
      'recolor={{ "#e4572e": "accent" }} draw />',
    inside: null,
    children: '',
    limits: {},
    longText:
      'Text inside scales with the drawing; `deck lint` reports text drawn ' +
      'below the brand’s caption size.',
  },
};

/**
 * A component's catalog entry: its words, its shared and own props, its limits.
 *
 * @param name - The tag.
 */
function infoOf(name: DiagramComponentName): DiagramComponentInfo {
  const text = TEXTS[name];
  const { shared, props } = componentProps(name);
  const ownLongText =
    text.longText === LONG_TEXT || text.longText === '' ? {} : { longText: text.longText };
  return {
    name,
    role: DIAGRAM_ROOT_NAMES.includes(name) ? 'diagram' : 'part',
    inside: text.inside,
    useWhen: text.useWhen,
    example: text.example,
    shared,
    props,
    children: text.children,
    limits: text.limits,
    ...ownLongText,
  };
}

/**
 * Options of `<Edge>`.
 */
const EDGE_OPTIONS: readonly DiagramCatalogEntry[] = [
  {
    name: 'label',
    useWhen:
      'What travels on the edge (HTTPS, SQL, publish); it sits beside the line, ' +
      'never on a node. Wraps after about 18 characters.',
    example: '<Edge from="api" to="db" label="SQL" />',
  },
  {
    name: 'dashed / async',
    useWhen: 'An asynchronous, optional or eventual link (events, replication, fire-and-forget).',
    example: '<Edge from="orders" to="events" async />',
  },
  {
    name: 'lineStyle / strokeWidth',
    useWhen: "Vary an ordinary connector's line pattern or width in canvas pixels.",
    example: '<Edge from="checkout" to="dispatch" lineStyle="dotted" strokeWidth={3} />',
  },
  {
    name: `route: ${EDGE_ROUTES.join(' | ')}`,
    useWhen:
      'orthogonal (the default) routes around nodes with rounded corners; ' +
      'straight runs centre to centre; curved bends gently between ports.',
    example: '<Edge from="a" to="b" route="curved" />',
  },
  {
    name: `arrow: ${EDGE_ARROWS.join(' | ')}`,
    useWhen: 'Where arrowheads go; `bidirectional` is arrow="both".',
    example: '<Edge from="agent" to="model" bidirectional />',
  },
  {
    name: 'fromSide / toSide',
    useWhen:
      'Force the side an edge leaves or enters by (top, right, bottom, left) ' +
      'when the router picks another.',
    example: '<Edge from="api" to="cache" fromSide="top" toSide="bottom" />',
  },
  {
    name: 'self loop',
    useWhen:
      'An edge whose `from` and `to` are the same node draws a small loop on ' +
      'it, such as a retry; a packet from and to that node rides it.',
    example: '<Edge from="worker" to="worker" label="retry" />',
  },
  {
    name: 'flow',
    useWhen:
      'Continuous traffic along an edge while it is shown: `flow`, `flow={5}` ' +
      'or `flow={{ count, speed, size, role, reverse }}` (see `edgeFlow`).',
    example: '<Edge from="orders" to="bus" label="publish" flow={{ count: 3 }} />',
  },
  {
    name: 'at / state / id',
    useWhen: 'Reveal the edge at a step, start it in a state, or name it for <State edge="...">.',
    example: '<Edge id="auth" from="api" to="idp" at={2} />',
  },
];

/**
 * Animation primitives.
 */
const ANIMATION: readonly DiagramCatalogEntry[] = [
  { name: 'Packet', useWhen: TEXTS.Packet.useWhen, example: TEXTS.Packet.example },
  { name: 'Journey', useWhen: TEXTS.Journey.useWhen, example: TEXTS.Journey.example },
  { name: 'State', useWhen: TEXTS.State.useWhen, example: TEXTS.State.example },
  { name: 'Focus', useWhen: TEXTS.Focus.useWhen, example: TEXTS.Focus.example },
  {
    name: 'at (reveal)',
    useWhen:
      'Every node, group and edge takes `at` to appear on a step; an edge also ' +
      'waits for its nodes.',
    example: '<Node id="cache" kind="cache" title="Cache" col={3} row={1} at={2} />',
  },
];

/**
 * How to write diagrams in TSX.
 */
const TSX: DiagramTsxGuide = {
  /**
   * The import line.
   */
  import: TSX_IMPORT,

  /**
   * How icons work.
   */
  icons:
    "`kind` icons resolve at run time from the brand's icon set, as in MDX. " +
    "`icon` takes a component (`import Rocket from '~icons/lucide/rocket'`), an imported image " +
    'URL (`import mark from \'./mark.svg?url\'`), an HTTPS image URL, or "none". ' +
    'MDX also resolves Iconify names and bundles relative image paths.',

  /**
   * How mistakes are reported.
   */
  errors:
    'TSX props are checked when the slide renders: an unknown prop or a value ' +
    'outside its set throws an error naming the closest one, shown on the ' +
    'slide in place of the diagram.',

  /**
   * A TSX slide with a flow.
   */
  example: [
    TSX_IMPORT,
    '',
    "export const frontmatter = { layout: 'diagram', title: 'Orders talk to " +
      "the database over SQL' };",
    '',
    'export default function Slide() {',
    '  return (',
    '    <Flow title="Orders and its database">',
    '      <Node id="api" kind="service" title="Orders API" col={1} row={1} />',
    '      <Node id="db" kind="database" title="Orders DB" col={2} row={1} />',
    '      <Edge from="api" to="db" label="SQL" />',
    '    </Flow>',
    '  );',
    '}',
  ].join('\n'),
};

/**
 * Cards, as the catalog explains them.
 */
const CARDS: DiagramCardGuide = {
  /**
   * How a node picks its card.
   */
  resolution:
    "A node's card is, in order: its own `card`; its diagram's `card`; the card the brand maps " +
    'its kind to (`diagram.kinds` in brand.ts); `default`. A name the brand does not have is ' +
    'skipped (the next in that order applies) and the node carries `data-card-missing` with the ' +
    'name asked for; every node carries `data-card` with the card it uses.',

  /**
   * The standard cards.
   */
  standard: {
    /**
     * Today's node.
     */
    default: "The brand's node: its node fill and border, the icon in a bordered tile.",

    /**
     * Border only.
     */
    outline: 'No fill, the node border only.',

    /**
     * Filled in the accent.
     */
    solid: 'Filled in the accent, no border, text in the accent foreground.',

    /**
     * A light accent tint.
     */
    tint: 'The accent at a low opacity with an accent border and a filled icon tile.',

    /**
     * Lifted off the slide.
     */
    raised: "The surface fill, a hairline border and the brand's medium shadow.",
  },

  /**
   * The brand's own cards.
   */
  custom:
    'Every brand has the five standard cards and may restyle them or define more of its own ' +
    '(`deck brand <name>` lists them). Stick to the standard names for a deck that should look ' +
    'right in any brand.',

  /**
   * What a card leaves alone.
   */
  rules: [
    'States still win over the card: highlighted, error and success recolor the outline and ' +
      'show the halo, muted and a focus dim the node.',
    "On <Layers> the items follow the stack's `card`; the bands keep the stack's own look unless " +
      'a <Layer> names a card.',
    'Pick a card for a reason (a role, a group of nodes that belong together), not per node at ' +
      'random: one or two cards on a slide besides the default.',
  ],
};

/**
 * The diagram catalog, as `deck diagrams --json` prints it.
 */
export const DIAGRAM_CATALOG: DiagramCatalog = {
  /**
   * The shared props.
   */
  shared: SHARED_DIAGRAM_PROP_INFO,

  /**
   * Every diagram component and part, diagrams first.
   */
  components: [
    ...DIAGRAM_ROOT_NAMES.map(infoOf),
    ...(Object.keys(TEXTS) as DiagramComponentName[])
      .filter((name) => !DIAGRAM_ROOT_NAMES.includes(name))
      .map(infoOf),
  ],

  /**
   * The node kinds, with their aliases.
   */
  nodeKinds: (Object.keys(NODE_KINDS) as NodeKind[]).map((kind) => ({
    kind,
    aliases: Object.entries(NODE_KIND_ALIASES)
      .filter(([, target]) => target === kind)
      .map(([alias]) => alias),
    shape: NODE_KINDS[kind].shape,
    icons: NODE_KINDS[kind].icons,
    useWhen: NODE_KINDS[kind].useWhen,
  })),

  /**
   * The options of `<Edge>`.
   */
  edgeOptions: EDGE_OPTIONS,

  /**
   * The fields of `<Edge flow={{ ... }}>`.
   */
  edgeFlow: EDGE_FLOW_PROPS,

  /**
   * Cards and how a node picks one.
   */
  cards: CARDS,

  /**
   * Packets, journeys, state changes, focus and reveals.
   */
  animation: ANIMATION,

  /**
   * The emphasis states.
   */
  states: DIAGRAM_STATES,

  /**
   * Other words for the states.
   */
  stateSynonyms: STATE_SYNONYMS,

  /**
   * The color roles packets travel in.
   */
  packetRoles: PACKET_ROLES,

  /**
   * The color roles an imported SVG's shapes can take.
   */
  svgRoles: Object.keys(SVG_ROLES),

  /**
   * The numbers diagrams are held to.
   */
  limits: FLOW_LIMITS,

  /**
   * What happens to long text.
   */
  longText: LONG_TEXT,

  /**
   * Writing diagrams in TSX.
   */
  tsx: TSX,

  /**
   * Notes that apply to every diagram.
   */
  notes: [
    'Use the `diagram` layout: a takeaway title over one diagram that fills ' +
      'the slide, with an optional <Aside>.',
    'Every diagram needs a `title` (its accessible name); the build fails ' +
      'without one, and on any prop it does not take or value outside its set, ' +
      'naming the closest.',
    'Place nodes on grid cells (col, row); never pixels. The diagram scales ' +
      'to its region and text stays at brand sizes.',
    `Keep a slide to about ${DIAGRAM_NODE_BUDGET} nodes and ${DIAGRAM_EDGE_BUDGET} edges and ${DIAGRAM_GRID_LIMITS.columns} columns by ${DIAGRAM_GRID_LIMITS.rows} rows; \`deck lint\` warns above that (diagram-too-dense) and reports nodes that overlap.`,
    'One accent: let a journey, a highlight or a state carry the point; ' +
      'everything else stays in the quiet colors.',
    'Nodes, actors, items and layers take `card` (a node style the brand defines: `default`, ' +
      "`outline`, `solid`, `tint`, `raised` or one of the brand's own, listed by `deck brand " +
      "<name>`); a diagram's `card` sets it for all its nodes. Without one a node takes the card " +
      'the brand maps its kind to, else `default`; a name the brand lacks is skipped. States ' +
      'still win over the card (`cards` in --json has the details).',
    'Static mode and exports show each step as a still: packets frozen ' +
      'partway along with a tail that shows their direction.',
    'Every diagram puts a JSON description in `data-diagram-description` for ' +
      'native exports (`@deckster/kit/diagram-description`).',
    'Designer-made motion no diagram expresses (an illustrated loop, a ' +
      'product animation) is a <Lottie> from After Effects; see the media ' +
      'components.',
  ],
};
