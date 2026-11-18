import { useReadyHold, useSlide, useStatic, useStep } from '@deckster/engine';
import { Children, isValidElement, useId, useMemo, useRef, type ReactNode } from 'react';

import type { NodeExtras } from '#diagrams/flow-children.ts';
import type { DiagramState, FlowEdgeSpec, FlowNodeSpec, PlayMode } from '#diagrams/flow-spec.ts';
import type { Point } from '#diagrams/geometry.ts';
import type { MotionPlan } from '#diagrams/use-motion-plans.ts';

import { StepMarks } from '#code/step-marks.tsx';
import { flag } from '#diagrams/data-flags.ts';
import {
  describeDiagram,
  type DescribeEdge,
  type DescribeInput,
  type DescribeNode,
} from '#diagrams/describe-diagram.ts';
import { DiagramFrame } from '#diagrams/diagram-frame.tsx';
import { assertDiagramProps, formatProblems, normalizeState } from '#diagrams/diagram-props.ts';
import { count } from '#diagrams/diagram-summary.ts';
import {
  edgeCornerRadius,
  FALLBACK,
  useDiagramTokens,
  useReducedMotion,
  type DiagramTokens,
  type LabelType,
} from '#diagrams/diagram-tokens.ts';
import { EdgePath } from '#diagrams/flow-edge-view.tsx';
import { NodeBody, NodeShadow, NodeShape } from '#diagrams/flow-node-view.tsx';
import { PacketDots, PacketTags, type PacketDot, type PacketTag } from '#diagrams/flow-packets.tsx';
import { optional } from '#diagrams/flow-spec-builder.ts';
import { Actor, Message, type ActorProps, type MessageProps } from '#diagrams/form-parts.tsx';
import { checkSequence } from '#diagrams/form-validate.ts';
import { resolveCard, type ResolvedCard } from '#diagrams/node-cards.ts';
import { resolveNodeKind, NODE_KINDS } from '#diagrams/node-kinds.ts';
import { cardShape, nodeGeometry } from '#diagrams/node-shapes.ts';
import { movesAt, planTrip, staticTripPositions, tailBehind } from '#diagrams/packet-motion.ts';
import { roundedPath, type PathSegment } from '#diagrams/path-geometry.ts';
import {
  layoutSequence,
  sequenceActorWidth,
  type SequenceLayout,
} from '#diagrams/sequence-layout.ts';
import { useDiagramDescription } from '#diagrams/use-description.ts';
import { useElementSize, type ElementSize } from '#diagrams/use-element-size.ts';
import { useKindIcons } from '#diagrams/use-kind-icons.ts';
import { useMeasurements } from '#diagrams/use-measurements.ts';
import { useMotionPlans } from '#diagrams/use-motion-plans.ts';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';

/**
 * The characters an id generated from `useId` may contain beyond letters and digits; they are
 * dropped.
 */
const NON_ID_CHARACTERS = /[^a-z0-9]/gi;

/**
 * Props of {@link SequenceDiagram}.
 */
export type SequenceDiagramProps = {
  /**
   * An id for the export description.
   */
  id?: string;

  /**
   * What it shows, in a few words: its accessible name.
   */
  title: string;

  /**
   * A fixed height in canvas pixels; without it the diagram fills its region.
   */
  height?: number;

  /**
   * The card (a node style the brand defines) for every actor: `default`, `outline`, `solid`,
   * `tint`, `raised` or one of the brand's own. An actor's own `card` wins over it.
   */
  card?: string;

  /**
   * `<Actor>`s, left to right, then `<Message>`s, top to bottom.
   */
  children?: ReactNode;
};

/**
 * A sequence diagram: actors across the top with lifelines down, messages as arrows between them
 * from top to bottom. Give messages `at` to reveal them by step; the current message lights up in
 * the accent and a packet runs along it (a ring for a `reply`), and the actor it reaches lights
 * up.
 *
 * ```mdx
 * <SequenceDiagram title="Paying twice with one idempotency key">
 *   <Actor id="web" kind="client" title="Web app" />
 *   <Actor id="api" kind="service" title="Payments API" />
 *   <Message from="web" to="api" label="POST /charges" at={1} />
 *   <Message from="api" to="web" label="201 Created" reply at={2} />
 * </SequenceDiagram>
 * ```
 */
export function SequenceDiagram({
  id,
  title,
  height,
  card,
  children,
}: SequenceDiagramProps): ReactNode {
  const parsed = useMemo(() => parseSequence(children), [children]);
  const { actors, messages } = parsed;
  const kindIcons = useKindIcons(
    actors.map((actor) => {
      const extra = parsed.extras.get(actor.id);
      return { kind: actor.kind, settled: extra?.icon !== undefined || extra?.iconless === true };
    }),
  );
  const extras = useMemo(() => {
    if (kindIcons.size === 0) {
      return parsed.extras;
    }

    return new Map(
      actors.map((actor) => {
        const extra = parsed.extras.get(actor.id) ?? {};
        const icon = kindIcons.get(actor.kind);
        return [
          actor.id,
          extra.icon === undefined && extra.iconless !== true && icon !== undefined
            ? { ...extra, icon }
            : extra,
        ];
      }),
    );
  }, [actors, parsed.extras, kindIcons]);
  const step = useStep();
  const isStatic = useStatic();
  const { isActive } = useSlide();
  const root = useRef<HTMLElement | null>(null);
  const size = useElementSize(root);
  const tokens = useDiagramTokens(root);
  const cards = useMemo(() => actorCards(actors, tokens, card), [actors, tokens, card]);
  const key = JSON.stringify({ actors, messages });
  const boxWidth = measuredActorWidth(actors.length, size, tokens);
  const cardNames =
    tokens === undefined ? '' : [...cards.values()].map((one) => one.name).join(' ');
  const measurements = useMeasurements(root, `${key}|${Math.round(boxWidth)}|${cardNames}`);
  const layout = useMemo(() => {
    if (size === undefined || tokens === undefined || measurements === undefined) {
      return undefined;
    }

    return layoutSequence(
      actors.map((actor) => actor.id),
      messages,
      size,
      {
        ...actorSpacing(tokens),
        actorHeight: measurements.nodeHeight,
        rowMax: tokens.type.caption * ROW_MAX_CAPTIONS,
        loopWidth: tokens.space.xl,
      },
    );
  }, [actors, messages, size, tokens, measurements]);
  useReadyHold(layout === undefined);
  const reduced = useReducedMotion();
  const still = isStatic || reduced || !movesAt(tokens?.motion);
  const current = messages.findIndex((message) => message.at !== undefined && message.at === step);
  const scene = useMemo(
    () =>
      layout === undefined || tokens === undefined
        ? undefined
        : messageScene(messages, layout.messages, current, tokens, still),
    [layout, tokens, messages, current, still],
  );
  useMotionPlans(root, scene?.plans ?? NO_PLANS, layout !== undefined && isActive && !still);
  const visible = messages.filter((message) => message.at === undefined || message.at <= step);
  const arrival = still ? 0 : (scene?.arrival ?? 0);
  const summary = sequenceSummary(actors, visible);
  const generated = useId();
  const diagramId = id ?? `sequence-${generated.replace(NON_ID_CHARACTERS, '')}`;
  useDiagramDescription(
    root,
    layout === undefined
      ? undefined
      : () => {
          const element = root.current as HTMLElement;
          return describeDiagram({
            element,
            kind: 'sequence',
            id: diagramId,
            step,
            summary,
            groups: [],
            nodes: describedActors(actors, cards, layout),
            edges: describedMessages(messages, layout, {
              step,
              current,
              radius: tokens === undefined ? 0 : messageRadius(tokens),
            }),
            packets: { dots: stillDots(scene, messages, layout, current, tokens), tags: [] },
            lines: lifelineLines(element, actors, layout),
          });
        },
  );
  const live = liveLabel(messages[current], actors);
  return (
    <DiagramFrame
      ref={root}
      kind="sequence"
      title={title}
      summary={summary}
      ready={layout !== undefined}
      height={height}
      live={live}
      data={{
        'data-diagram-id': diagramId,
        'data-diagram-nodes': String(actors.length),
        'data-diagram-edges': String(visible.length),
      }}>
      <StepMarks
        ats={[
          ...new Set(messages.flatMap((message) => (message.at === undefined ? [] : [message.at]))),
        ]}
      />
      {layout === undefined || tokens === undefined ? (
        <MeasureActors actors={actors} cards={cards} extras={extras} width={boxWidth} />
      ) : (
        <SequenceDrawing
          actors={actors}
          cards={cards}
          messages={messages}
          extras={extras}
          layout={layout}
          tokens={tokens}
          scene={scene}
          state={{ step, current, arrival }}
        />
      )}
    </DiagramFrame>
  );
}

/**
 * The live region's sentence for the message playing now: who sends it to whom, and its label.
 *
 * @param playing - The message playing now, if any.
 * @param actors - The actors, for their titles.
 */
function liveLabel(
  playing: ParsedMessage | undefined,
  actors: readonly FlowNodeSpec[],
): string | undefined {
  if (playing === undefined) {
    return undefined;
  }

  const from = actors.find((actor) => actor.id === playing.from)?.title ?? playing.from;
  const to = actors.find((actor) => actor.id === playing.to)?.title ?? playing.to;
  const label = playing.label === undefined ? '' : `: ${playing.label}`;
  return `${from} to ${to}${label}.`;
}

/**
 * The lifelines as the export description lists them, each found in the rendered diagram.
 *
 * @param element - The diagram's root element.
 * @param actors - The actors.
 * @param layout - Where the lifelines are.
 */
function lifelineLines(
  element: HTMLElement,
  actors: readonly FlowNodeSpec[],
  layout: SequenceLayout,
): NonNullable<DescribeInput['lines']> {
  return actors.flatMap((actor) => {
    const line = layout.lifelines.get(actor.id);
    const drawn = element.querySelector(
      `.kit-sequence-lifeline[data-actor="${CSS.escape(actor.id)}"]`,
    );
    if (line === undefined || drawn === null) {
      return [];
    }

    return [
      {
        role: 'lifeline' as const,
        node: actor.id,
        element: drawn,
        points: [line.from, line.to],
      },
    ];
  });
}

/**
 * No animations.
 */
const NO_PLANS: readonly MotionPlan[] = [];

/**
 * The widest an actor box gets, as a multiple of the caption size.
 */
const ACTOR_WIDTH_CAPTIONS = 10;

/**
 * The tallest a message row gets, as a multiple of the caption size.
 */
const ROW_MAX_CAPTIONS = 5;

/**
 * How many ghost dots trail a message's packet.
 */
const GHOST_COUNT = 3;

/**
 * Where the ghosts' opacity fade starts, as a share of the packet's opacity; the ghost nearest the
 * packet is one fade step below it.
 */
const GHOST_BASE_OPACITY = 0.5;

/**
 * How much opacity each ghost dot loses compared with the one before it.
 */
const GHOST_FADE_STEP = 0.12;

/**
 * The delay between the ghosts' motions, in milliseconds.
 */
const GHOST_STAGGER_MS = 26;

/**
 * The widest an actor box gets, in pixels.
 *
 * @param tokens - The brand's values; the default brand's caption size before they are read.
 */
function actorWidth(tokens: DiagramTokens | undefined): number {
  return (tokens?.type.caption ?? DEFAULT_CAPTION_PX) * ACTOR_WIDTH_CAPTIONS;
}

/**
 * How wide actor boxes get and how far apart they stay, in pixels, for the layout and for the width
 * the actors are measured at.
 *
 * @param tokens - The brand's values.
 */
function actorSpacing(tokens: DiagramTokens): { actorMaxWidth: number; gutter: number } {
  return { actorMaxWidth: actorWidth(tokens), gutter: tokens.space.xl };
}

/**
 * The width the layout will give every actor box, so the hidden actors are measured as wide as they
 * are drawn and a title that wraps in its box is measured wrapped. Before the diagram's size and
 * the brand's values are read, it is the widest an actor box gets.
 *
 * @param actorCount - How many actors stand side by side.
 * @param size - The diagram's box, once measured.
 * @param tokens - The brand's values, once read.
 */
function measuredActorWidth(
  actorCount: number,
  size: ElementSize | undefined,
  tokens: DiagramTokens | undefined,
): number {
  if (size === undefined || tokens === undefined) {
    return actorWidth(tokens);
  }

  return sequenceActorWidth(actorCount, size.width, actorSpacing(tokens));
}

/**
 * The caption size used before the brand's is read, in pixels.
 */
const DEFAULT_CAPTION_PX = 24;

/**
 * Props of {@link MeasureActors}.
 */
type MeasureActorsProps = {
  /**
   * The actors.
   */
  actors: readonly FlowNodeSpec[];

  /**
   * Their cards, by id.
   */
  cards: ReadonlyMap<string, ResolvedCard>;

  /**
   * Their icons.
   */
  extras: ReadonlyMap<string, NodeExtras>;

  /**
   * The width actors will get.
   */
  width: number;
};

/**
 * Renders every actor, hidden, so the first layout knows how tall the actor boxes are.
 */
function MeasureActors({ actors, cards, extras, width }: MeasureActorsProps): ReactNode {
  return (
    <div className="kit-flow-html" aria-hidden="true" data-measuring="true">
      {actors.map((actor) => (
        <NodeBody
          key={actor.id}
          node={actor}
          card={cardOf(cards, actor)}
          extras={extras.get(actor.id)}
          rect={{ x: 0, y: 0, width, height: 0 }}
          inset={{ top: 0, right: 0, bottom: 0, left: 0 }}
          frame={{ visible: false, state: 'default', arrival: false }}
          dimmed={false}
          arrivalDelay={0}
        />
      ))}
    </div>
  );
}

/**
 * Props of {@link SequenceDrawing}.
 */
type SequenceDrawingProps = {
  /**
   * The actors.
   */
  actors: readonly FlowNodeSpec[];

  /**
   * The actors' cards, by id.
   */
  cards: ReadonlyMap<string, ResolvedCard>;

  /**
   * The messages.
   */
  messages: readonly ParsedMessage[];

  /**
   * The actors' icons.
   */
  extras: ReadonlyMap<string, NodeExtras>;

  /**
   * Where everything goes.
   */
  layout: SequenceLayout;

  /**
   * The brand's values.
   */
  tokens: DiagramTokens;

  /**
   * What moves.
   */
  scene: ReturnType<typeof messageScene> | undefined;

  /**
   * The step, the message playing now and when its packet lands.
   */
  state: { step: number; current: number; arrival: number };
};

/**
 * The laid-out sequence diagram: lifelines, message arrows, the packet and the actor boxes in an
 * SVG, the labels and actor text in an HTML layer over it.
 */
function SequenceDrawing({
  actors,
  cards,
  messages,
  extras,
  layout,
  tokens,
  scene,
  state,
}: SequenceDrawingProps): ReactNode {
  const playing = messages[state.current];
  /**
   * Whether a message is shown at this step.
   */
  const shown = (message: ParsedMessage): boolean =>
    message.at === undefined || message.at <= state.step;
  const geometries = new Map(
    actors.flatMap((actor) => {
      const rect = layout.actors.get(actor.id);
      return rect === undefined
        ? []
        : [
            [
              actor.id,
              {
                rect,
                geometry: nodeGeometry(
                  NODE_KINDS[actor.kind].shape,
                  cardOf(cards, actor).tokens,
                  rect,
                ),
              },
            ] as const,
          ];
    }),
  );
  return (
    <>
      <svg className="kit-flow-svg" width="100%" height="100%" aria-hidden="true">
        {actors.map((actor) => {
          const placed = geometries.get(actor.id);
          return placed === undefined ? null : (
            <NodeShadow
              key={actor.id}
              node={actor}
              card={cardOf(cards, actor)}
              rect={placed.rect}
              geometry={placed.geometry}
              frame={actorFrame(actor, playing)}
              dimmed={false}
            />
          );
        })}
        {actors.map((actor) => {
          const line = layout.lifelines.get(actor.id);
          return line === undefined ? null : (
            <line
              key={actor.id}
              className="kit-sequence-lifeline"
              data-diagram-part="lifeline"
              data-actor={actor.id}
              x1={line.from.x}
              y1={line.from.y}
              x2={line.to.x}
              y2={line.to.y}
            />
          );
        })}
        {messages.map((message, index) => {
          const points = layout.messages[index];
          return points === undefined ? null : (
            <EdgePath
              key={message.id}
              edge={message}
              path={{
                id: message.id,
                points,
                segments: roundedPath(points, messageRadius(tokens)),
                fromSide: 'right',
                toSide: 'left',
              }}
              frame={{ visible: shown(message), tone: messageTone(message, index, state.current) }}
              dimmed={false}
              stroke={tokens.edge.stroke}
              arrow={tokens.edge.arrow}
            />
          );
        })}
        {scene === undefined ? null : <PacketDots dots={scene.dots} />}
        {actors.map((actor) => {
          const placed = geometries.get(actor.id);
          return placed === undefined ? null : (
            <NodeShape
              key={actor.id}
              node={actor}
              card={cardOf(cards, actor)}
              rect={placed.rect}
              geometry={placed.geometry}
              frame={actorFrame(actor, playing)}
              dimmed={false}
              arrivalDelay={state.arrival}
            />
          );
        })}
      </svg>
      <div className="kit-flow-html">
        {messages.map((message, index) => (
          <MessageLabel
            key={message.id}
            message={message}
            points={layout.messages[index]}
            shown={shown(message)}
            loop={tokens.space.xl + tokens.space.xs}
            chip={tokens.label.style === 'chip'}
            step={tokens.label.type}
            tone={messageTone(message, index, state.current)}
          />
        ))}
        {actors.map((actor) => {
          const placed = geometries.get(actor.id);
          return placed === undefined ? null : (
            <NodeBody
              key={actor.id}
              node={actor}
              card={cardOf(cards, actor)}
              extras={extras.get(actor.id)}
              rect={placed.rect}
              inset={placed.geometry.inset}
              frame={actorFrame(actor, playing)}
              dimmed={false}
              arrivalDelay={state.arrival}
            />
          );
        })}
        {scene === undefined ? null : <PacketTags tags={scene.tags} />}
      </div>
    </>
  );
}

/**
 * Props of {@link MessageLabel}.
 */
type MessageLabelProps = {
  /**
   * The message.
   */
  message: ParsedMessage;

  /**
   * Its corners.
   */
  points: readonly Point[] | undefined;

  /**
   * Whether it is shown at this step.
   */
  shown: boolean;

  /**
   * How far right of its lifeline a call to self puts its label.
   */
  loop: number;

  /**
   * Whether the brand sets edge labels in a bordered chip.
   */
  chip: boolean;

  /**
   * The type step labels are set in.
   */
  step: LabelType;

  /**
   * The message's tone at this step (`active` while it plays), so a chip's border follows the
   * arrow's colour.
   */
  tone: DiagramState | 'active';
};

/**
 * A message's label: above the middle of its arrow, or beside the loop of a call to self.
 */
function MessageLabel({
  message,
  points,
  shown,
  loop,
  chip,
  step,
  tone,
}: MessageLabelProps): ReactNode {
  const [a, b] = points ?? [];
  if (a === undefined || b === undefined || message.label === undefined) {
    return null;
  }

  const self = message.from === message.to;
  return (
    <span
      className={`kit-flow-label kit-sequence-label kit-type-${step}`}
      data-diagram-part="edge-label"
      data-edge={message.id}
      data-tone={tone}
      data-label-style={chip ? 'chip' : undefined}
      data-visible={String(shown)}
      data-self={flag(self)}
      style={{ left: self ? a.x + loop : (a.x + b.x) / 2, top: a.y }}>
      {smartPunctuation(message.label)}
    </span>
  );
}

/**
 * A message's tone: active while it plays, else its own state.
 *
 * @param message - The message.
 * @param index - Its place.
 * @param current - The place of the message playing now.
 */
function messageTone(
  message: ParsedMessage,
  index: number,
  current: number,
): DiagramState | 'active' {
  return index === current ? 'active' : message.state;
}

/**
 * The actors as the export description lists them.
 *
 * @param actors - The actors.
 * @param cards - Their cards, by id, for the shape a card gives them.
 * @param layout - Where they are.
 */
function describedActors(
  actors: readonly FlowNodeSpec[],
  cards: ReadonlyMap<string, ResolvedCard>,
  layout: SequenceLayout,
): DescribeNode[] {
  return actors.flatMap((actor) => {
    const rect = layout.actors.get(actor.id);
    if (rect === undefined) {
      return [];
    }

    return [
      {
        id: actor.id,
        kind: actor.kind,
        state: actor.state,
        shape: cardShape(NODE_KINDS[actor.kind].shape, cardOf(cards, actor).tokens.shape),
        rect,
      },
    ];
  });
}

/**
 * The messages shown at a step, as the export description lists them.
 *
 * @param messages - The messages.
 * @param layout - Where they are.
 * @param state - The step, the message playing now and the corner radius.
 */
function describedMessages(
  messages: readonly ParsedMessage[],
  layout: SequenceLayout,
  state: { step: number; current: number; radius: number },
): DescribeEdge[] {
  return messages.flatMap((message, index) => {
    const points = layout.messages[index];
    const shown = message.at === undefined || message.at <= state.step;
    if (points === undefined || !shown) {
      return [];
    }

    return [
      {
        id: message.id,
        from: message.from,
        to: message.to,
        route: 'orthogonal',
        arrow: 'end',
        points,
        segments: roundedPath(points, state.radius),
        tone: messageTone(message, index, state.current),
      },
    ];
  });
}

/**
 * A message as the diagram keeps it.
 */
type ParsedMessage = FlowEdgeSpec & {
  /**
   * Its play mode.
   */
  play: PlayMode;

  /**
   * Whether it is a response.
   */
  reply: boolean;
};

/**
 * Reads the actors and messages of a sequence diagram.
 *
 * @param children - The diagram's children.
 * @throws Error for anything other than `<Actor>` and `<Message>`, or a message naming an unknown
 *   actor.
 */
function parseSequence(children: ReactNode): {
  actors: FlowNodeSpec[];
  messages: ParsedMessage[];
  extras: Map<string, NodeExtras>;
} {
  const actors: FlowNodeSpec[] = [];
  const messages: ParsedMessage[] = [];
  const extras = new Map<string, NodeExtras>();
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) {
      continue;
    }

    if (child.type === Actor) {
      const props = child.props as ActorProps;
      assertDiagramProps('Actor', props);
      actors.push({
        id: props.id,
        kind: (props.kind === undefined ? undefined : resolveNodeKind(props.kind)) ?? 'node',
        title: props.title ?? props.id,
        ...optional('subtitle', props.subtitle),
        state: 'default',
        ...optional('card', props.card),
      });
      extras.set(props.id, {
        ...optional('icon', typeof props.icon === 'function' ? props.icon : undefined),
        ...(props.icon === 'none' ? { iconless: true } : {}),
      });
      continue;
    }

    if (child.type === Message) {
      const props = child.props as MessageProps;
      assertDiagramProps('Message', props);
      messages.push({
        id: `message-${messages.length + 1}`,
        from: props.from,
        to: props.to,
        ...optional('label', props.label),
        dashed: props.reply === true || props.async === true,
        route: 'orthogonal',
        arrow: 'end',
        ...optional('at', props.at),
        state: (normalizeState(props.state) as DiagramState | undefined) ?? 'default',
        play: props.play ?? 'loop',
        reply: props.reply === true,
      });
      continue;
    }

    throw new Error(
      'A <SequenceDiagram> holds only <Actor>s and <Message>s; move anything else out of it.',
    );
  }

  const problems = checkSequence(
    actors.map((actor) => actor.id),
    messages,
  );
  if (problems.length > 0) {
    throw new Error(formatProblems('This <SequenceDiagram>', problems));
  }

  return { actors, messages, extras };
}

/**
 * An actor's look at a step: lit when the current message reaches it.
 *
 * @param actor - The actor.
 * @param current - The message playing now.
 */
function actorFrame(
  actor: FlowNodeSpec,
  current: ParsedMessage | undefined,
): { visible: boolean; state: DiagramState; arrival: boolean } {
  const arrives = current?.to === actor.id;
  return { visible: true, state: arrives ? 'highlighted' : 'default', arrival: arrives };
}

/**
 * The look of a message's packet: the accent, medium, as a reply or not.
 */
type MessageLook = {
  /**
   * The packet's colour role.
   */
  role: 'accent';

  /**
   * The packet's size.
   */
  size: 'md';

  /**
   * Whether the packet is drawn as a reply, a ring.
   */
  reply: boolean;
};

/**
 * What a message draws now: its packet and tags, the motion that moves them and the time its packet
 * arrives at the actor it reaches.
 */
type MessageScene = {
  /**
   * The packet's dots.
   */
  dots: PacketDot[];

  /**
   * The packet's tags.
   */
  tags: PacketTag[];

  /**
   * The motion of each dot.
   */
  plans: MotionPlan[];

  /**
   * When the packet arrives, in milliseconds.
   */
  arrival: number;
};

/**
 * The packet of the message playing now, still or moving.
 *
 * @param messages - The messages.
 * @param paths - Each message's corners.
 * @param current - The index of the message playing now, or -1.
 * @param tokens - The brand's values.
 * @param still - Whether to draw a still.
 */
function messageScene(
  messages: readonly ParsedMessage[],
  paths: readonly { x: number; y: number }[][],
  current: number,
  tokens: DiagramTokens,
  still: boolean,
): MessageScene {
  const message = messages[current];
  const points = paths[current];
  if (message === undefined || points === undefined) {
    return emptyMessageScene();
  }

  const segments = roundedPath(points, messageRadius(tokens));
  const look: MessageLook = { role: 'accent', size: 'md', reply: message.reply };
  return still
    ? stillMessageScene(segments, look)
    : movingMessageScene(message, segments, look, tokens);
}

/**
 * The scene of a message with nothing to draw.
 */
function emptyMessageScene(): MessageScene {
  return { dots: [], tags: [], plans: [], arrival: 0 };
}

/**
 * A message's packet frozen partway along its path, with ghost dots trailing behind it.
 *
 * @param segments - The message's path.
 * @param look - The packet's look.
 */
function stillMessageScene(segments: readonly PathSegment[], look: MessageLook): MessageScene {
  const [head] = staticTripPositions(segments, 1);
  if (head === undefined) {
    return emptyMessageScene();
  }

  const tail = tailBehind(segments, head, GHOST_COUNT).map((point, index) => ({
    motion: `message:ghost:${index + 1}`,
    ...look,
    ghost: index + 1,
    at: { ...point, angle: head.angle },
  }));
  return {
    dots: [...tail.reverse(), { motion: 'message', ...look, ghost: 0, at: head }],
    tags: [],
    plans: [],
    arrival: 0,
  };
}

/**
 * A message's packet travelling its path, with the ghosts following it a little behind.
 *
 * @param message - The message.
 * @param segments - The message's path.
 * @param look - The packet's look.
 * @param tokens - The brand's values.
 */
function movingMessageScene(
  message: ParsedMessage,
  segments: readonly PathSegment[],
  look: MessageLook,
  tokens: DiagramTokens,
): MessageScene {
  const motion = planTrip(
    {
      legs: [{ segments, arrives: message.to }],
      origin: message.from,
      reply: false,
      count: 1,
      speed: 'normal',
      play: message.play,
    },
    tokens.motion,
  );
  const dots: PacketDot[] = [];
  const plans: MotionPlan[] = [];
  for (let ghost = GHOST_COUNT; ghost >= 0; ghost -= 1) {
    const target = ghost === 0 ? 'message' : `message:ghost:${ghost}`;
    dots.push({ motion: target, ...look, ghost, at: undefined });
    plans.push({
      target,
      keyframes: motion.out.map((frame) => ({
        offset: frame.offset,
        transform: `translate(${frame.x}px, ${frame.y}px)`,
        opacity:
          ghost === 0
            ? frame.opacity
            : frame.opacity * (GHOST_BASE_OPACITY - ghost * GHOST_FADE_STEP),
      })),
      timing: {
        duration: motion.period,
        delay: ghost * GHOST_STAGGER_MS,
        iterations: motion.loop ? Infinity : 1,
        fill: 'both',
        easing: 'linear',
      },
    });
  }

  return { dots, tags: [], plans, arrival: motion.arrivals[0]?.time ?? 0 };
}

/**
 * The text summary: actors left to right, then the messages shown, in order.
 *
 * @param actors - The actors.
 * @param messages - The messages shown at this step.
 */
function sequenceSummary(
  actors: readonly FlowNodeSpec[],
  messages: readonly ParsedMessage[],
): string {
  const titles = new Map(actors.map((actor) => [actor.id, actor.title]));
  const steps = messages.map((message, index) => {
    const label = message.label === undefined ? '' : `: ${message.label}`;
    const verb = message.reply ? 'replies to' : 'to';
    const from = titles.get(message.from) ?? message.from;
    const to = titles.get(message.to) ?? message.to;
    return `${index + 1}. ${from} ${verb} ${to}${label}`;
  });
  return [
    `${count(actors.length, 'participant')}: ${actors.map((actor) => actor.title).join(', ')}.`,
    steps.length === 0 ? '' : `${count(steps.length, 'message')}: ${steps.join('; ')}.`,
  ]
    .filter((sentence) => sentence !== '')
    .join(' ');
}

/**
 * The dots of the message playing at this step as its still shows them, for the description: the
 * scene's own dots in a still, else a still worked out for the same message.
 *
 * @param scene - What moves now.
 * @param messages - The messages.
 * @param layout - Where they run.
 * @param current - The message playing.
 * @param tokens - The brand's values.
 */
function stillDots(
  scene: ReturnType<typeof messageScene> | undefined,
  messages: readonly ParsedMessage[],
  layout: SequenceLayout,
  current: number,
  tokens: DiagramTokens | undefined,
): PacketDot[] {
  if (scene !== undefined && scene.dots.every((dot) => dot.at !== undefined)) {
    return scene.dots;
  }

  return tokens === undefined
    ? []
    : messageScene(messages, layout.messages, current, tokens, true).dots;
}

/**
 * The radius a message arrow's corners are rounded with: the small radius, or 0 for a brand that
 * draws edge corners square.
 *
 * @param tokens - The brand's values.
 */
function messageRadius(tokens: DiagramTokens): number {
  return edgeCornerRadius(tokens, tokens.radius.sm);
}

/**
 * Each actor's card, by id: its own card, else the diagram's, else the brand's card for its kind,
 * else `default`; today's node before the brand's values are read.
 *
 * @param actors - The actors.
 * @param tokens - The brand's values, once read.
 * @param card - The diagram's card.
 */
function actorCards(
  actors: readonly FlowNodeSpec[],
  tokens: DiagramTokens | undefined,
  card: string | undefined,
): Map<string, ResolvedCard> {
  const source = (tokens ?? FALLBACK).cards;
  return new Map(
    actors.map((actor) => [
      actor.id,
      resolveCard(source, { own: actor.card, diagram: card, kind: actor.kind }),
    ]),
  );
}

/**
 * An actor's card from the resolved cards, or today's node when it has none.
 *
 * @param cards - Each actor's card, by id.
 * @param actor - The actor.
 */
function cardOf(cards: ReadonlyMap<string, ResolvedCard>, actor: FlowNodeSpec): ResolvedCard {
  return cards.get(actor.id) ?? resolveCard(FALLBACK.cards, { kind: actor.kind });
}
