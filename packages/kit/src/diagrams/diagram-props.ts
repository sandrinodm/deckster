import type { DiagramProblem } from '#diagrams/flow-validate.ts';

import { DIAGRAM_HARD_LIMITS } from '#diagrams/diagram-limits.ts';
import {
  AUTO_LAYOUTS,
  DIAGRAM_STATES,
  EDGE_ARROWS,
  EDGE_ROUTES,
  FLOW_DIRECTIONS,
  PACKET_ROLES,
  PACKET_SIZES,
  PACKET_SPEEDS,
  type DiagramState,
} from '#diagrams/flow-spec.ts';
import { NODE_KIND_ALIASES, NODE_KIND_NAMES } from '#diagrams/node-kinds.ts';
import { pushAll } from '#foundation/lists.ts';

/**
 * The kinds of JavaScript value a prop takes, for the checks: `list` is a string of ids or an array
 * of them, `node` is React children, `function` an icon component.
 */
export type ValueKind = 'string' | 'number' | 'boolean' | 'list' | 'object' | 'function' | 'node';

/**
 * One prop of a diagram component or part, as `deck diagrams --json` prints it and the validator
 * checks it.
 */
export type DiagramPropInfo = {
  /**
   * The TypeScript type, in short.
   */
  type: string;

  /**
   * Whether a slide must set it.
   */
  required: boolean;

  /**
   * The value when left out, or `null` when it has none.
   */
  default: unknown;

  /**
   * What it does, as a sentence.
   */
  description: string;

  /**
   * The values it takes, for a prop with a fixed set.
   */
  values?: readonly string[];
};

/**
 * A prop as the validator sees it: its catalog entry plus the kinds of value it accepts.
 */
type CheckedProp = DiagramPropInfo & {
  /**
   * The kinds of value it accepts.
   */
  accepts: readonly ValueKind[];

  /**
   * What an allowed value is called in messages, such as `node kind`.
   */
  noun?: string;

  /**
   * The lowest and highest number it takes, for a number prop.
   */
  range?: readonly [number, number];
};

/**
 * Describes a prop.
 *
 * @param type - The type in short.
 * @param accepts - The kinds of value it accepts.
 * @param description - What it does.
 * @param options - Whether it is required, its default, its allowed values and their noun, and for
 *   a number the range it takes.
 */
function prop(
  type: string,
  accepts: readonly ValueKind[],
  description: string,
  options: {
    required?: boolean;
    default?: unknown;
    values?: readonly string[];
    noun?: string;
    range?: readonly [number, number];
  } = {},
): CheckedProp {
  return {
    type,
    required: options.required ?? false,
    default: options.default ?? null,
    description,
    ...(options.values === undefined ? {} : { values: options.values }),
    accepts,
    ...(options.noun === undefined ? {} : { noun: options.noun }),
    ...(options.range === undefined ? {} : { range: options.range }),
  };
}

/**
 * A prop that takes one of a fixed set of strings.
 *
 * @param values - The allowed values.
 * @param description - What it does.
 * @param options - Its default and the noun for messages.
 */
function oneOf(
  values: readonly string[],
  description: string,
  options: { default?: string; noun?: string; required?: boolean } = {},
): CheckedProp {
  return prop(values.map((value) => `"${value}"`).join(' | '), ['string'], description, {
    ...options,
    values,
  });
}

/**
 * Other names authors write for an emphasis state, and the state each means.
 */
export const STATE_SYNONYMS: Readonly<Record<string, DiagramState>> = {
  /**
   * `highlight` means `highlighted`.
   */
  highlight: 'highlighted',

  /**
   * `fail` means `error`.
   */
  fail: 'error',

  /**
   * `failed` means `error`.
   */
  failed: 'error',

  /**
   * `failure` means `error`.
   */
  failure: 'error',

  /**
   * `ok` means `success`.
   */
  ok: 'success',

  /**
   * `done` means `success`.
   */
  done: 'success',

  /**
   * `recover` means `success`.
   */
  recover: 'success',

  /**
   * `recovered` means `success`.
   */
  recovered: 'success',

  /**
   * `mute` means `muted`.
   */
  mute: 'muted',

  /**
   * `dim` means `muted`.
   */
  dim: 'muted',

  /**
   * `dimmed` means `muted`.
   */
  dimmed: 'muted',
};

/**
 * An emphasis state as the diagram keeps it: the value itself, or the state a synonym stands for.
 *
 * @param value - The state as written.
 * @returns The state; the value unchanged when it is neither a state nor a synonym.
 */
export function normalizeState<Value extends string | undefined>(
  value: Value,
): DiagramState | Value {
  if (value === undefined) {
    return value;
  }

  return Object.hasOwn(STATE_SYNONYMS, value) ? (STATE_SYNONYMS[value] ?? value) : value;
}

/**
 * The four sides of a node.
 */
const SIDES = ['top', 'right', 'bottom', 'left'] as const;

/**
 * The description of `from` on an edge, packet or hop, which all three share.
 */
const FROM_DESCRIPTION = 'The node it starts at.';

/**
 * The description of the packet size options, shared by the shared `size` and the edge flow's.
 */
const DOT_SIZE_DESCRIPTION = 'How big the dots are.';

/**
 * The type of a prop that takes one node id or a list of them.
 */
const NODE_OR_LIST_TYPE = 'string | string[]';

/**
 * The type of a prop that takes a boolean or a tag.
 */
const BOOLEAN_OR_STRING_TYPE = 'boolean | string';

/**
 * How many allowed values a message lists before it says `…`.
 */
const SHOWN_VALUE_LIMIT = 30;

/**
 * The fewest edits a misspelt name may be away from a candidate and still count as a likely typo.
 */
const TYPO_MIN_EDITS = 2;

/**
 * How many characters of a name one edit is allowed for when judging a likely typo, so a longer
 * name tolerates more typos.
 */
const TYPO_CHARS_PER_EDIT = 3;

/**
 * The range of a step number.
 */
const STEP_RANGE = [0, DIAGRAM_HARD_LIMITS.maxStep] as const;

/**
 * The range of a grid column or row.
 */
const GRID_RANGE = [0, DIAGRAM_HARD_LIMITS.maxGridIndex] as const;

/**
 * The range of a count of grid columns or rows covered.
 */
const SPAN_RANGE = [1, DIAGRAM_HARD_LIMITS.maxGridIndex] as const;

/**
 * The range of a count of particles.
 */
const PARTICLE_RANGE = [0, DIAGRAM_HARD_LIMITS.maxParticles] as const;

/**
 * Every name `kind` takes: the kinds and their aliases.
 */
const KIND_VALUES: readonly string[] = [...NODE_KIND_NAMES, ...Object.keys(NODE_KIND_ALIASES)];

/**
 * The props several components and parts share, described once.
 */
export const SHARED_DIAGRAM_PROPS = {
  /**
   * The id other elements name it by.
   */
  id: prop(
    'string',
    ['string'],
    'Its id: what edges, packets and states name it by, and its id in the export description.',
  ),

  /**
   * The diagram's accessible name.
   */
  title: prop(
    'string',
    ['string'],
    'What the diagram shows, in a few words: its accessible name. Every diagram needs one; the build fails without it.',
    { required: true },
  ),

  /**
   * A fixed height.
   */
  height: prop(
    'number',
    ['number'],
    'A fixed height in canvas pixels; without it the diagram fills its region.',
    { range: [1, DIAGRAM_HARD_LIMITS.maxHeight] },
  ),

  /**
   * The step that reveals it.
   */
  at: prop(
    'number',
    ['number'],
    'The step that reveals it (or plays it); shown from the start when left out.',
    { range: STEP_RANGE },
  ),

  /**
   * The step it stops at.
   */
  until: prop(
    'number',
    ['number'],
    'The step it stops at (exclusive); without it a packet plays only on `at` and a state lasts to the end.',
    { range: STEP_RANGE },
  ),

  /**
   * The emphasis.
   */
  state: oneOf(DIAGRAM_STATES, 'The emphasis it starts with.', {
    default: 'default',
    noun: 'state',
  }),

  /**
   * What it is.
   */
  kind: prop(
    'string',
    ['string'],
    'What it is, which sets its shape and icon: one of the node kinds (`nodeKinds`), or an alias.',
    { default: 'node', values: KIND_VALUES, noun: 'node kind' },
  ),

  /**
   * An icon.
   */
  icon: prop(
    'string | IconComponent',
    ['string', 'function'],
    "An icon from the brand's set by name (resolved at build time in MDX), \"none\" to drop the kind's icon, or in TSX an icon component (`import Rocket from '~icons/lucide/rocket'`).",
  ),

  /**
   * How many particles.
   */
  count: prop('number', ['number'], 'Particles travelling together.', {
    default: 1,
    range: PARTICLE_RANGE,
  }),

  /**
   * How fast.
   */
  speed: oneOf(PACKET_SPEEDS, "How fast they travel, as a multiple of the brand's motion.", {
    default: 'normal',
    noun: 'speed',
  }),

  /**
   * How big.
   */
  size: oneOf(PACKET_SIZES, DOT_SIZE_DESCRIPTION, { default: 'md', noun: 'size' }),

  /**
   * The color role.
   */
  role: oneOf(PACKET_ROLES, 'The color role they travel in.', { default: 'accent', noun: 'role' }),

  /**
   * Loop or once.
   */
  play: oneOf(
    ['loop', 'once'],
    'Loop while the step is current, or play once and rest at the end.',
    {
      default: 'loop',
      noun: 'play mode',
    },
  ),

  /**
   * The grid column.
   */
  col: prop('number', ['number'], 'The grid column, from 1 on the left.', { range: GRID_RANGE }),

  /**
   * The grid row.
   */
  row: prop('number', ['number'], 'The grid row, from 1 at the top.', { range: GRID_RANGE }),

  /**
   * Columns covered.
   */
  colSpan: prop('number', ['number'], 'How many columns it covers.', {
    default: 1,
    range: SPAN_RANGE,
  }),

  /**
   * Rows covered.
   */
  rowSpan: prop('number', ['number'], 'How many rows it covers.', {
    default: 1,
    range: SPAN_RANGE,
  }),
} as const;

/**
 * The name of a shared prop.
 */
export type SharedDiagramPropName = keyof typeof SHARED_DIAGRAM_PROPS;

/**
 * Shorthand for the shared props.
 */
const S = SHARED_DIAGRAM_PROPS;

/**
 * Children of a component, described.
 *
 * @param description - What goes inside.
 */
function children(description: string): CheckedProp {
  return prop('ReactNode', ['node'], description);
}

/**
 * The props of every component and part, each table checked against the component's props type at
 * compile time, so the validator, the catalog and the components cannot drift apart.
 */
function propTables() {
  /**
   * The props of `<Flow>`.
   */
  const FLOW = {
    id: S.id,
    title: S.title,
    cols: prop(
      'number',
      ['number'],
      'Columns the grid has at least; the cells used decide otherwise.',
      { range: GRID_RANGE },
    ),
    rows: prop('number', ['number'], 'Rows the grid has at least.', { range: GRID_RANGE }),
    layout: oneOf(AUTO_LAYOUTS, 'The automatic layout used when no node has a grid cell.', {
      default: 'layered',
      noun: 'layout',
    }),
    direction: oneOf(FLOW_DIRECTIONS, 'Which way an automatic layout flows.', {
      default: 'right',
      noun: 'direction',
    }),
    height: S.height,
    children: children(
      '<Node>, <Group>, <Edge>, <Packet>, <Journey>, <State> and <Focus> elements.',
    ),
  } as const;

  /**
   * The props of `<Node>`.
   */
  const NODE = {
    id: prop('string', ['string'], 'The id edges and packets name it by.', { required: true }),
    kind: S.kind,
    title: prop(
      'string',
      ['string'],
      'The name on the node; the id when left out. Wraps at word boundaries.',
    ),
    subtitle: prop('string', ['string'], 'A second, quieter line, such as `Postgres 16`.'),
    badge: prop(
      'string',
      ['string'],
      'A small status pill on a corner of the node, such as `503`: the top right unless an edge runs there, then the first free corner.',
    ),
    state: S.state,
    at: S.at,
    icon: S.icon,
    col: S.col,
    row: S.row,
    colSpan: S.colSpan,
    rowSpan: S.rowSpan,
    children: children(
      'In a <Tree>, its child <Node>s; elsewhere content of your own instead of the title and subtitle.',
    ),
  } as const;

  /**
   * The props of `<Group>`.
   */
  const GROUP = {
    id: prop('string', ['string'], 'Its id; made from the label when left out.'),
    label: prop('string', ['string'], 'The label in its top-left corner, such as `VPC`.', {
      required: true,
    }),
    at: S.at,
    col: S.col,
    row: S.row,
    colSpan: S.colSpan,
    rowSpan: S.rowSpan,
    children: children('The <Node>s and inner <Group>s inside it.'),
  } as const;

  /**
   * The fields of the object form of `<Edge flow>`.
   */
  const EDGE_FLOW = {
    count: prop('number', ['number'], 'Particles on the edge at once.', {
      default: 3,
      range: PARTICLE_RANGE,
    }),
    speed: S.speed,
    size: oneOf(PACKET_SIZES, DOT_SIZE_DESCRIPTION, { default: 'sm', noun: 'size' }),
    role: S.role,
    reverse: prop('boolean', ['boolean'], 'Travel from `to` back to `from`.', { default: false }),
  } as const;

  /**
   * The props of `<Edge>`.
   */
  const EDGE = {
    id: prop('string', ['string'], 'Its id, for <State edge>; `from->to` when left out.'),
    from: prop('string', ['string'], FROM_DESCRIPTION, { required: true }),
    to: prop(
      'string',
      ['string'],
      'The node it ends at; the same node as `from` draws a small loop on it, such as a retry.',
      { required: true },
    ),
    label: prop(
      'string',
      ['string'],
      'Text beside the line, such as `HTTPS`. Wraps after about 18 characters to two lines, then is cut with an ellipsis.',
    ),
    dashed: prop('boolean', ['boolean'], 'A dashed line, for asynchronous or optional links.', {
      default: false,
    }),
    async: prop('boolean', ['boolean'], 'Another name for `dashed`.', { default: false }),
    route: oneOf(EDGE_ROUTES, 'How it runs between its nodes.', {
      default: 'orthogonal',
      noun: 'route',
    }),
    arrow: oneOf(EDGE_ARROWS, 'Where arrowheads go.', { default: 'end', noun: 'arrow' }),
    bidirectional: prop('boolean', ['boolean'], 'Arrowheads at both ends; `arrow="both"`.', {
      default: false,
    }),
    at: S.at,
    fromSide: oneOf(SIDES, 'The side of `from` it leaves by.', { noun: 'side' }),
    toSide: oneOf(SIDES, 'The side of `to` it enters by.', { noun: 'side' }),
    flow: prop(
      'boolean | number | { count, speed, size, role, reverse }',
      ['boolean', 'number', 'object'],
      'Continuous traffic along it: `true`, a particle count, or the details.',
    ),
    state: S.state,
  } as const;

  /**
   * The props of `<Packet>`.
   */
  const PACKET = {
    from: prop('string', ['string'], FROM_DESCRIPTION),
    to: prop('string', ['string'], 'The node it travels to; `from` again rides a self loop.'),
    path: prop(
      NODE_OR_LIST_TYPE,
      ['list'],
      'Several hops instead of `from` and `to`: node ids in order.',
    ),
    label: prop('string', ['string'], 'A short tag that rides with it, such as `GET /cart`.'),
    reply: prop(
      BOOLEAN_OR_STRING_TYPE,
      ['boolean', 'string'],
      "Come back after a pause at the far end: `true`, or the response's tag.",
    ),
    at: S.at,
    until: S.until,
    count: S.count,
    speed: S.speed,
    size: S.size,
    role: S.role,
    play: S.play,
  } as const;

  /**
   * The props of `<Journey>`.
   */
  const JOURNEY = {
    id: prop('string', ['string'], 'Its id.'),
    at: prop(
      'number',
      ['number'],
      'The step of the first hop; later hops take the steps after it.',
      {
        default: 1,
        range: STEP_RANGE,
      },
    ),
    path: prop(NODE_OR_LIST_TYPE, ['list'], 'The nodes it passes through: one hop per pair.'),
    back: prop('boolean', ['boolean'], 'Come back along the path afterwards, one hop per step.', {
      default: false,
    }),
    pace: oneOf(
      ['hop', 'trip'],
      '`hop` gives each hop its own step; `trip` plays the whole path on `at`.',
      {
        default: 'hop',
        noun: 'pace',
      },
    ),
    focus: prop('boolean', ['boolean'], 'Dim everything off the path while it plays.', {
      default: false,
    }),
    trail: prop('boolean', ['boolean'], 'Keep travelled edges lit.', { default: true }),
    count: S.count,
    speed: S.speed,
    size: S.size,
    role: S.role,
    play: S.play,
    children: children('Explicit <Hop>s, instead of `path`.'),
  } as const;

  /**
   * The props of `<Hop>`.
   */
  const HOP = {
    from: prop('string', ['string'], FROM_DESCRIPTION),
    to: prop('string', ['string'], 'The node it travels to.'),
    path: prop(
      NODE_OR_LIST_TYPE,
      ['list'],
      'Several nodes in one hop, instead of `from` and `to`.',
    ),
    at: prop('number', ['number'], "Its step; the step after the previous hop's when left out.", {
      range: STEP_RANGE,
    }),
    label: prop('string', ['string'], 'A tag that rides with the packet.'),
    reply: prop(
      BOOLEAN_OR_STRING_TYPE,
      ['boolean', 'string'],
      "Come back after a pause: `true` or the response's tag.",
    ),
    returning: prop('boolean', ['boolean'], 'Draw it as a reply on its way back.', {
      default: false,
    }),
    count: S.count,
    speed: S.speed,
    size: S.size,
    role: S.role,
    play: S.play,
  } as const;

  /**
   * The props of `<State>`.
   */
  const STATE = {
    node: prop('string', ['string'], 'The node it changes.'),
    edge: prop(
      'string',
      ['string'],
      'The edge it changes, by id (`from->to` unless it has its own).',
    ),
    is: oneOf(DIAGRAM_STATES, 'The emphasis it sets from `at` (to `until`).', {
      required: true,
      noun: 'state',
    }),
    badge: prop('string', ['string'], 'A badge to show meanwhile, such as `Timeout`.'),
    at: prop('number', ['number'], 'The step it applies from.', { default: 0, range: STEP_RANGE }),
    until: S.until,
  } as const;

  /**
   * The props of `<Focus>`.
   */
  const FOCUS = {
    nodes: prop(NODE_OR_LIST_TYPE, ['list'], 'The nodes that stay lit, such as `"web api db"`.', {
      required: true,
    }),
    at: prop('number', ['number'], 'The first step it applies on.', {
      default: 0,
      range: STEP_RANGE,
    }),
    until: S.until,
  } as const;

  /**
   * The props of `<SequenceDiagram>`.
   */
  const SEQUENCE = {
    id: S.id,
    title: S.title,
    height: S.height,
    children: children('<Actor>s, then <Message>s in order.'),
  } as const;

  /**
   * The props of `<Actor>`.
   */
  const ACTOR = {
    id: prop('string', ['string'], 'The id messages name it by.', { required: true }),
    kind: S.kind,
    title: prop('string', ['string'], 'Its name; the id when left out.'),
    subtitle: prop('string', ['string'], 'A quieter second line.'),
    icon: S.icon,
  } as const;

  /**
   * The props of `<Message>`.
   */
  const MESSAGE = {
    from: prop('string', ['string'], 'The actor it leaves.', { required: true }),
    to: prop(
      'string',
      ['string'],
      'The actor it reaches; the same as `from` for a call to itself.',
      {
        required: true,
      },
    ),
    label: prop('string', ['string'], 'What it says, such as `POST /orders`.'),
    at: prop(
      'number',
      ['number'],
      'The step that reveals it; it plays while that step is current.',
      { range: STEP_RANGE },
    ),
    reply: prop('boolean', ['boolean'], 'A response: a dashed arrow, its packet a ring.', {
      default: false,
    }),
    async: prop('boolean', ['boolean'], 'An asynchronous message: a dashed arrow.', {
      default: false,
    }),
    play: S.play,
    state: S.state,
  } as const;

  /**
   * The props of `<Timeline>`.
   */
  const TIMELINE = {
    id: S.id,
    title: S.title,
    height: S.height,
    children: children('The <Milestone>s, in time order.'),
  } as const;

  /**
   * The props of `<Milestone>`.
   */
  const MILESTONE = {
    date: prop('string', ['string'], 'When, as it should read: `Q1 2026`, `March`.', {
      required: true,
    }),
    title: prop('string', ['string'], 'What happens, in a few words.', { required: true }),
    at: S.at,
    current: prop(
      'boolean',
      ['boolean'],
      'Marks where we are now; once revealed it stays current over later milestones.',
      { default: false },
    ),
    state: S.state,
    icon: S.icon,
    children: children('A short line of detail under the title.'),
  } as const;

  /**
   * The props of `<Layers>`.
   */
  const LAYERS = {
    id: S.id,
    title: S.title,
    height: S.height,
    children: children('The <Layer>s, top to bottom.'),
  } as const;

  /**
   * The props of `<Layer>`.
   */
  const LAYER = {
    title: prop('string', ['string'], "The layer's name, such as `Data`.", { required: true }),
    subtitle: prop('string', ['string'], 'What it does or who owns it.'),
    at: S.at,
    state: S.state,
    children: children('Its <Item>s.'),
  } as const;

  /**
   * The props of `<Item>`.
   */
  const ITEM = {
    kind: S.kind,
    title: prop('string', ['string'], 'Its name.', { required: true }),
    icon: S.icon,
    state: S.state,
  } as const;

  /**
   * The props of `<Cycle>`.
   */
  const CYCLE = {
    id: S.id,
    title: S.title,
    steps: prop('boolean', ['boolean'], 'Walk the loop one stage per step.', { default: false }),
    spin: prop('boolean', ['boolean'], 'Keep a packet circling while the slide is on screen.', {
      default: false,
    }),
    height: S.height,
    children: children(
      'The stages as <Node>s in order from the top, plus <Edge> (to label or style an arc), <State>, <Packet> and <Focus>.',
    ),
  } as const;

  /**
   * The props of `<Tree>`.
   */
  const TREE = {
    id: S.id,
    title: S.title,
    direction: oneOf(['down', 'right'], 'Which way it grows.', {
      default: 'down',
      noun: 'direction',
    }),
    height: S.height,
    children: children('One root <Node>, with its children nested inside it.'),
  } as const;

  /**
   * The props of `<Svg>`.
   */
  const SVG = {
    src: prop(
      'string',
      ['string'],
      'In MDX a relative path to an .svg file, inlined at build time; in TSX the markup (`?raw` import).',
      { required: true },
    ),
    title: prop('string', ['string'], 'What the drawing shows, for people who cannot see it.', {
      required: true,
    }),
    steps: prop(
      'Record<string, number>',
      ['object'],
      'Elements to reveal by step, by id: `{{ dock: 1, sorting: 2 }}`.',
    ),
    draw: prop('boolean', ['boolean'], 'Draw the strokes of each element on as it is revealed.', {
      default: false,
    }),
    recolor: prop(
      'Record<string, SvgRole>',
      ['object'],
      'Colors in the file to replace with color roles: `{{ "#ff5a1f": "accent" }}` (`svgRoles`).',
    ),
    height: S.height,
  } as const;
  return {
    tables: {
      /**
       * `<Flow>`.
       */
      Flow: FLOW,

      /**
       * `<Node>`.
       */
      Node: NODE,

      /**
       * `<Group>`.
       */
      Group: GROUP,

      /**
       * `<Edge>`.
       */
      Edge: EDGE,

      /**
       * `<Packet>`.
       */
      Packet: PACKET,

      /**
       * `<Journey>`.
       */
      Journey: JOURNEY,

      /**
       * `<Hop>`.
       */
      Hop: HOP,

      /**
       * `<State>`.
       */
      State: STATE,

      /**
       * `<Focus>`.
       */
      Focus: FOCUS,

      /**
       * `<SequenceDiagram>`.
       */
      SequenceDiagram: SEQUENCE,

      /**
       * `<Actor>`.
       */
      Actor: ACTOR,

      /**
       * `<Message>`.
       */
      Message: MESSAGE,

      /**
       * `<Timeline>`.
       */
      Timeline: TIMELINE,

      /**
       * `<Milestone>`.
       */
      Milestone: MILESTONE,

      /**
       * `<Layers>`.
       */
      Layers: LAYERS,

      /**
       * `<Layer>`.
       */
      Layer: LAYER,

      /**
       * `<Item>`.
       */
      Item: ITEM,

      /**
       * `<Cycle>`.
       */
      Cycle: CYCLE,

      /**
       * `<Tree>`.
       */
      Tree: TREE,

      /**
       * `<Svg>`.
       */
      Svg: SVG,
    } as const,
    edgeFlow: EDGE_FLOW,
  };
}

/**
 * Every prop of every diagram component and part, by tag: the one list the build, the components
 * and `deck diagrams` read, and the fields of `<Edge flow>`.
 */
const PROP_TABLES = propTables();

/**
 * The prop tables by component, with their literal keys, for the compile-time check that each table
 * names exactly the props of its component's TypeScript type (`diagram-props-types.ts`).
 */
export type PropTables = ReturnType<typeof propTables>['tables'];

/**
 * The fields of the object form of `<Edge flow>`, with their literal keys.
 */
export type EdgeFlowTable = ReturnType<typeof propTables>['edgeFlow'];

/**
 * Every prop of every diagram component and part, by tag.
 */
const CHECKED_PROPS = PROP_TABLES.tables;

/**
 * The fields of the object form of `<Edge flow>`.
 */
const EDGE_FLOW = PROP_TABLES.edgeFlow;

/**
 * Props the build writes, never authors: accepted by the checks, left out of the catalog.
 */
const INTERNAL_PROPS: Readonly<Partial<Record<string, Readonly<Record<string, CheckedProp>>>>> = {
  /**
   * The node centres the build computed for an automatic layout.
   */
  Flow: {
    positions: prop(
      'Record<string, { x: number; y: number }>',
      ['object'],
      'Node centres of an automatic layout, computed at build time.',
    ),
  },
};

/**
 * The tag of a diagram component or part, such as `Flow` or `Edge`.
 */
export type DiagramComponentName = keyof typeof CHECKED_PROPS;

/**
 * Every diagram component and part tag.
 */
export const DIAGRAM_COMPONENT_NAMES = Object.keys(CHECKED_PROPS) as DiagramComponentName[];

/**
 * The diagram components that draw a figure (the others are parts inside one).
 */
export const DIAGRAM_ROOT_NAMES: readonly DiagramComponentName[] = [
  'Flow',
  'SequenceDiagram',
  'Timeline',
  'Layers',
  'Cycle',
  'Tree',
  'Svg',
];

/**
 * Every prop of every diagram component and part, as `deck diagrams --json` prints them.
 */
export const DIAGRAM_PROPS: Readonly<
  Record<DiagramComponentName, Readonly<Record<string, DiagramPropInfo>>>
> = Object.fromEntries(
  DIAGRAM_COMPONENT_NAMES.map((name) => [
    name,
    Object.fromEntries(
      Object.entries(CHECKED_PROPS[name] as Readonly<Record<string, CheckedProp>>).map(
        ([key, info]) => [key, catalogInfo(info)],
      ),
    ),
  ]),
) as Record<DiagramComponentName, Readonly<Record<string, DiagramPropInfo>>>;

/**
 * The fields of the object form of `<Edge flow>`, as the catalog prints them.
 */
export const EDGE_FLOW_PROPS: Readonly<Record<string, DiagramPropInfo>> = Object.fromEntries(
  Object.entries(EDGE_FLOW).map(([key, info]) => [key, catalogInfo(info)]),
);

/**
 * Whether a tag names a diagram component or part.
 *
 * @param name - A JSX tag.
 */
export function isDiagramComponent(name: unknown): name is DiagramComponentName {
  return typeof name === 'string' && Object.hasOwn(CHECKED_PROPS, name);
}

/**
 * Checks a diagram element's props: names it does not take (with the nearest one), required props
 * left out, values of the wrong kind and values outside a fixed set (with the allowed ones and the
 * nearest). `key`, `ref` and `data-*` props are ignored; state synonyms (`highlight`, `fail`, ...)
 * are accepted.
 *
 * @param component - The tag.
 * @param props - The props as written; a prop whose value the build cannot read is `undefined` and
 *   only its name is checked.
 * @param options - `partial` skips the required check (when a spread may supply props).
 * @returns Every problem, as errors.
 */
export function checkDiagramProps(
  component: DiagramComponentName,
  props: Readonly<Record<string, unknown>>,
  options: { partial?: boolean } = {},
): DiagramProblem[] {
  const known = CHECKED_PROPS[component] as Readonly<Record<string, CheckedProp>>;
  const names = Object.keys(known);
  const problems: DiagramProblem[] = [];
  for (const [name, value] of Object.entries(props)) {
    if (name === 'key' || name === 'ref' || name.startsWith('data-')) {
      continue;
    }

    const info = ownProp(known, name) ?? ownProp(INTERNAL_PROPS[component], name);
    if (info === undefined) {
      const near = nearest(name, names);
      problems.push({
        severity: 'error',
        message:
          near === undefined
            ? `\`${name}\` is not a prop of <${component}>.`
            : `\`${name}\` is not a prop of <${component}>; did you mean \`${near}\`?`,
        fix: `Use one of its props: ${names.join(', ')}.`,
      });
      continue;
    }

    pushAll(problems, checkValue(component, name, info, value));
    if (component === 'Edge' && name === 'flow' && isPlainObject(value)) {
      pushAll(problems, checkFlowObject(value));
    }
  }

  if (options.partial !== true) {
    pushAll(problems, missingRequired(component, known, props));
  }

  return problems;
}

/**
 * A prop's description from a table, by a name an author wrote: only the table's own entries, so
 * `constructor` or `toString` is not a prop.
 *
 * @param table - A prop table, or nothing.
 * @param name - The name as written.
 */
function ownProp(
  table: Readonly<Record<string, CheckedProp>> | undefined,
  name: string,
): CheckedProp | undefined {
  return table !== undefined && Object.hasOwn(table, name) ? table[name] : undefined;
}

/**
 * The problems for required props a component's element leaves out.
 *
 * @param component - The tag.
 * @param known - The component's props.
 * @param props - The props as written.
 */
function missingRequired(
  component: DiagramComponentName,
  known: Readonly<Record<string, CheckedProp>>,
  props: Readonly<Record<string, unknown>>,
): DiagramProblem[] {
  return Object.entries(known).flatMap(([name, info]): DiagramProblem[] => {
    if (!info.required || Object.hasOwn(props, name)) {
      return [];
    }

    return [
      {
        severity: 'error',
        message: `<${component}> needs \`${name}\`.`,
        fix: `Add ${name}=…: ${info.description}`,
      },
    ];
  });
}

/**
 * Throws the problems {@link checkDiagramProps} finds, for components rendered from TSX.
 *
 * @param component - The tag.
 * @param props - The props.
 * @throws Error listing every problem with its fix.
 */
export function assertDiagramProps(
  component: DiagramComponentName,
  props: Readonly<Record<string, unknown>>,
): void {
  const problems = checkDiagramProps(component, props);
  if (problems.length > 0) {
    throw new Error(formatProblems(`<${component}>`, problems));
  }
}

/**
 * Problems as one message: a heading and one line per problem with its fix.
 *
 * @param element - The element, as it reads in the message.
 * @param problems - The problems.
 */
export function formatProblems(element: string, problems: readonly DiagramProblem[]): string {
  if (problems.length === 1) {
    const [only] = problems as [DiagramProblem];
    return `${only.message} ${only.fix}`;
  }

  return (
    `${element} has ${problems.length} problems:\n` +
    problems.map((problem) => `- ${problem.message} ${problem.fix}`).join('\n')
  );
}

/**
 * The problem with one prop's value, if any.
 *
 * @param component - The tag.
 * @param name - The prop.
 * @param info - What it takes.
 * @param value - The value; `undefined` when not readable.
 */
function checkValue(
  component: string,
  name: string,
  info: CheckedProp,
  value: unknown,
): DiagramProblem[] {
  if (value === undefined) {
    return [];
  }

  const kind = valueKind(value);
  if (!acceptsKind(info, kind)) {
    return [
      {
        severity: 'error',
        message: `<${component} ${name}=${written(value)}> takes ${info.type}, not ${article(kind)}.`,
        fix: `${info.description}`,
      },
    ];
  }

  if (typeof value === 'number' && info.range !== undefined) {
    return checkRange(component, name, info.range, value);
  }

  if (info.values === undefined || typeof value !== 'string') {
    return [];
  }

  const isState = name === 'state' || name === 'is';
  if (info.values.includes(value) || (isState && Object.hasOwn(STATE_SYNONYMS, value))) {
    return [];
  }

  const near = nearest(value, info.values);
  const noun = info.noun ?? `\`${name}\` value`;
  const shown =
    info.values.length > SHOWN_VALUE_LIMIT
      ? `${info.values.slice(0, SHOWN_VALUE_LIMIT).join(', ')}, …`
      : info.values.join(', ');
  return [
    {
      severity: 'error',
      message: `<${component} ${name}="${value}"> is not a ${noun}${near === undefined ? '.' : `; did you mean "${near}"?`}`,
      fix: `Use one of: ${shown}.`,
    },
  ];
}

/**
 * The problem with a number outside the range its prop takes: not a finite number, too low or too
 * high.
 *
 * @param component - The tag.
 * @param name - The prop.
 * @param range - The lowest and highest value.
 * @param value - The number.
 */
function checkRange(
  component: string,
  name: string,
  range: readonly [number, number],
  value: number,
): DiagramProblem[] {
  const [low, high] = range;
  if (Number.isFinite(value) && value >= low && value <= high) {
    return [];
  }

  return [
    {
      severity: 'error',
      message: `<${component} ${name}={${value}}> is outside the ${low} to ${high} a diagram takes.`,
      fix: `Use a number from ${low} to ${high} (\`deck diagrams --json\` lists the limits).`,
    },
  ];
}

/**
 * Whether a prop takes a value of this kind: any element for a prop that takes elements, and a
 * string of ids for a prop that takes a list.
 *
 * @param info - The prop.
 * @param kind - The value's kind.
 */
function acceptsKind(info: CheckedProp, kind: ValueKind): boolean {
  if (info.accepts.includes('node') || info.accepts.includes(kind)) {
    return true;
  }

  return kind === 'string' && info.accepts.includes('list');
}

/**
 * Problems with the object form of `<Edge flow>`.
 *
 * @param value - The object.
 */
function checkFlowObject(value: Readonly<Record<string, unknown>>): DiagramProblem[] {
  const known = EDGE_FLOW as Readonly<Record<string, CheckedProp>>;
  const names = Object.keys(known);
  return Object.entries(value).flatMap(([name, field]): DiagramProblem[] => {
    const info = ownProp(known, name);
    if (info === undefined) {
      const near = nearest(name, names);
      return [
        {
          severity: 'error',
          message:
            near === undefined
              ? `\`${name}\` is not a field of <Edge flow>.`
              : `\`${name}\` is not a field of <Edge flow>; did you mean \`${near}\`?`,
          fix: `Use: ${names.join(', ')}.`,
        },
      ];
    }

    return checkValue('Edge flow', name, info, field);
  });
}

/**
 * The kind of a value.
 *
 * @param value - Any value.
 */
function valueKind(value: unknown): ValueKind {
  if (typeof value === 'string') {
    return 'string';
  }

  if (typeof value === 'number') {
    return 'number';
  }

  if (typeof value === 'boolean') {
    return 'boolean';
  }

  if (typeof value === 'function') {
    return 'function';
  }

  if (Array.isArray(value)) {
    return value.every((item) => typeof item === 'string') ? 'list' : 'node';
  }

  if (isPlainObject(value)) {
    return '$$typeof' in value ? 'node' : 'object';
  }

  return 'node';
}

/**
 * Whether a value is a plain object (not an array).
 *
 * @param value - Any value.
 */
function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A value as it would be written in a prop.
 *
 * @param value - Any value.
 */
function written(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }

  return `{${typeof value === 'function' ? 'component' : JSON.stringify(value)}}`;
}

/**
 * A value kind with its article, for messages.
 *
 * @param kind - The kind.
 */
function article(kind: ValueKind): string {
  const nouns: Record<ValueKind, string> = {
    string: 'a string',
    number: 'a number',
    boolean: 'a boolean',
    list: 'a list',
    object: 'an object',
    function: 'a component',
    node: 'elements',
  };
  return nouns[kind];
}

/**
 * The candidate closest to a misspelt name, when one is close enough to be a likely typo.
 *
 * @param name - The name as written.
 * @param candidates - The names that exist.
 */
export function nearest(name: string, candidates: readonly string[]): string | undefined {
  const lower = name.toLowerCase();
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = editDistance(lower, candidate.toLowerCase());
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  const limit = Math.max(TYPO_MIN_EDITS, Math.ceil(name.length / TYPO_CHARS_PER_EDIT));
  return bestDistance <= limit ? best : undefined;
}

/**
 * The Damerau–Levenshtein distance (with adjacent swaps) between two strings.
 *
 * @param a - A string.
 * @param b - Another.
 */
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 || j === 0 ? i + j : 0)),
  );
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const row = rows[i] as number[];
      const above = rows[i - 1] as number[];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        (above[j] as number) + 1,
        (row[j - 1] as number) + 1,
        (above[j - 1] as number) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, ((rows[i - 2] as number[])[j - 2] as number) + 1);
      }

      row[j] = value;
    }
  }

  return (rows[a.length] as number[])[b.length] as number;
}

/**
 * A checked prop without the validator's own fields.
 *
 * @param info - The checked prop.
 */
function catalogInfo(info: CheckedProp): DiagramPropInfo {
  const { accepts: _accepts, noun: _noun, range: _range, ...rest } = info;
  return rest;
}

/**
 * The shared props, as the catalog prints them.
 */
export const SHARED_DIAGRAM_PROP_INFO: Readonly<Record<SharedDiagramPropName, DiagramPropInfo>> =
  Object.fromEntries(
    Object.entries(SHARED_DIAGRAM_PROPS).map(([key, info]) => [key, catalogInfo(info)]),
  ) as Record<SharedDiagramPropName, DiagramPropInfo>;

/**
 * A component's props split as the catalog prints them: the shared ones it takes, by name, and its
 * own, described.
 *
 * @param component - The tag.
 */
export function componentProps(component: DiagramComponentName): {
  shared: SharedDiagramPropName[];
  props: Record<string, DiagramPropInfo>;
} {
  const shared: SharedDiagramPropName[] = [];
  const props: Record<string, DiagramPropInfo> = {};
  const sharedProps = SHARED_DIAGRAM_PROPS as Readonly<Record<string, CheckedProp>>;
  for (const [key, info] of Object.entries(
    CHECKED_PROPS[component] as Readonly<Record<string, CheckedProp>>,
  )) {
    if (sharedProps[key] === info) {
      shared.push(key as SharedDiagramPropName);
    } else {
      props[key] = catalogInfo(info);
    }
  }

  return { shared, props };
}
