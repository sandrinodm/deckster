import type { Point, Rect } from '#diagrams/geometry.ts';

/**
 * One message between two actors, as the layout needs it.
 */
export type SequenceMessage = {
  /**
   * The actor it leaves.
   */
  from: string;

  /**
   * The actor it reaches; the same as `from` for a note to self.
   */
  to: string;
};

/**
 * Sizes a sequence diagram is laid out with, in canvas pixels.
 */
export type SequenceMetrics = {
  /**
   * The widest an actor box gets.
   */
  actorMaxWidth: number;

  /**
   * The height of the actor boxes.
   */
  actorHeight: number;

  /**
   * The least room between two actor boxes.
   */
  gutter: number;

  /**
   * The tallest a message row gets; rows share the height below the actors up to this.
   */
  rowMax: number;

  /**
   * How far a message to self loops out to the right.
   */
  loopWidth: number;
};

/**
 * Where everything in a sequence diagram goes.
 */
export type SequenceLayout = {
  /**
   * Each actor's box, by id.
   */
  actors: Map<string, Rect>;

  /**
   * Each actor's lifeline, from under its box to the bottom of the last row.
   */
  lifelines: Map<string, { from: Point; to: Point }>;

  /**
   * Each message's corners, in order.
   */
  messages: Point[][];

  /**
   * The height of one message row.
   */
  row: number;
};

/**
 * Rows kept beyond one per message, so the lifelines run past the last arrow.
 */
const TRAILING_ROWS = 0.5;

/**
 * Where a message's arrow sits in its row, as a fraction of the row below the row's top.
 */
const MESSAGE_ROW_POSITION = 0.75;

/**
 * The height of a message to self's loop, as a fraction of a row.
 */
const SELF_LOOP_ROWS = 0.35;

/**
 * The width of every actor box: the widest an actor box gets, or less when the actors share a
 * narrower diagram, so each keeps the gutter between it and the next. The diagram measures its
 * actors' text at this width, so it must match the boxes {@link layoutSequence} draws.
 *
 * @param actorCount - How many actors stand side by side; fewer than one counts as one.
 * @param width - The diagram's width, in canvas pixels.
 * @param metrics - The widest an actor box gets and the least room between two, in canvas pixels.
 * @returns The width in canvas pixels; zero or less when the gutter alone fills an actor's share.
 */
export function sequenceActorWidth(
  actorCount: number,
  width: number,
  metrics: Pick<SequenceMetrics, 'actorMaxWidth' | 'gutter'>,
): number {
  const cell = width / Math.max(actorCount, 1);
  return Math.min(metrics.actorMaxWidth, cell - metrics.gutter);
}

/**
 * Lays out a sequence diagram: actors side by side across the top, evenly spaced, each with a
 * lifeline down; messages one per row from top to bottom, as horizontal arrows between the
 * lifelines (a message to self loops out to the right and back). Rows share the height under the
 * actors up to a comfortable maximum, and the diagram sits at the top of its box.
 *
 * @param actors - The actor ids, left to right.
 * @param messages - The messages, top to bottom.
 * @param size - The diagram's box.
 * @param metrics - The sizes to use.
 */
export function layoutSequence(
  actors: readonly string[],
  messages: readonly SequenceMessage[],
  size: { width: number; height: number },
  metrics: SequenceMetrics,
): SequenceLayout {
  const cell = size.width / Math.max(actors.length, 1);
  const width = sequenceActorWidth(actors.length, size.width, metrics);
  const top = metrics.actorHeight + metrics.gutter / 2;
  const row = Math.min(
    metrics.rowMax,
    (size.height - top) / Math.max(messages.length + TRAILING_ROWS, 1),
  );
  const bottom = top + row * (messages.length + TRAILING_ROWS);
  const centres = new Map(actors.map((id, index) => [id, (index + 0.5) * cell]));
  const boxes = new Map(
    actors.map((id) => [
      id,
      { x: (centres.get(id) ?? 0) - width / 2, y: 0, width, height: metrics.actorHeight },
    ]),
  );
  const lifelines = new Map(
    actors.map((id) => {
      const x = centres.get(id) ?? 0;
      return [id, { from: { x, y: metrics.actorHeight }, to: { x, y: bottom } }];
    }),
  );
  const paths = messages.map((message, index) => {
    const y = top + row * (index + MESSAGE_ROW_POSITION);
    const x1 = centres.get(message.from) ?? 0;
    const x2 = centres.get(message.to) ?? 0;
    if (message.from === message.to) {
      const drop = row * SELF_LOOP_ROWS;
      return [
        { x: x1, y: y - drop / 2 },
        { x: x1 + metrics.loopWidth, y: y - drop / 2 },
        { x: x1 + metrics.loopWidth, y: y + drop / 2 },
        { x: x1, y: y + drop / 2 },
      ];
    }

    return [
      { x: x1, y },
      { x: x2, y },
    ];
  });
  return { actors: boxes, lifelines, messages: paths, row };
}
