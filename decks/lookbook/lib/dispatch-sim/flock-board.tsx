import type { ReactNode } from 'react';

import {
  BOARD_TIME,
  HUB,
  LOOPS,
  WAITING_DROPS,
  viewAt,
  type BoardView,
  type MapPoint,
  type SimLoop,
  type SimPhase,
} from './script.ts';
import './flock-board.css';

/**
 * Props of {@link FlockBoard}.
 */
export type FlockBoardProps = {
  /**
   * The slide step the simulation has reached, from 0.
   */
  step: number;

  /**
   * Ticks played within the step; `STEP_TICKS` for a finished frame, which is what a poster shows.
   */
  tick: number;

  /**
   * Whether the simulation is paused because its slide is off screen; set as `data-paused`.
   */
  paused?: boolean;
};

/**
 * What the status pill says in each phase.
 */
const PHASE_LABELS: Readonly<Record<SimPhase, string>> = {
  waiting: 'Waiting',
  batching: 'Batching',
  routing: 'Routing',
  riding: 'Riding',
};

/**
 * The streets of the drawn map, as horizontal and vertical lines every this many map units.
 */
const STREET_SPACING = 80;

/**
 * The map's width, in map units.
 */
const MAP_WIDTH = 800;

/**
 * The map's height, in map units.
 */
const MAP_HEIGHT = 500;

/**
 * Half the side of the hub's square, in map units.
 */
const HUB_HALF_SIDE = 16;

/**
 * The radius of the hub square's corners, in map units.
 */
const HUB_CORNER_RADIUS = 5;

/**
 * A stop's radius, in map units.
 */
const STOP_RADIUS = 11;

/**
 * A rider marker's radius, in map units.
 */
const RIDER_RADIUS = 15;

/**
 * The river across the bottom right of the map.
 */
const RIVER_PATH = 'M380 500 C470 440 560 470 640 430 S760 380 800 370';

/**
 * Drops in each loop the scripted batch builds. It mirrors the stop count of each loop in `LOOPS`
 * (`script.ts`), and the headline and the map label print it.
 */
const DROPS_PER_LOOP = 9;

/**
 * Seconds in a minute, for the countdown.
 */
const SECONDS_PER_MINUTE = 60;

/**
 * Dispatch's view of one batch: the hub's waiting drops on a drawn map beside a panel of the loops
 * Flock builds from them. The slide's steps play the batch: the drops wait, Flock colours them into
 * two loops, the route solver draws each route, and each loop goes to a rider. Every colour, size
 * and font is a brand custom property, so the deck's poster and the mini app look the same in every
 * brand.
 */
export function FlockBoard({ step, tick, paused = false }: FlockBoardProps): ReactNode {
  const view = viewAt(step, tick);
  return (
    <div className="fb" data-phase={view.phase} data-paused={paused}>
      <BoardMap view={view} />
      <BoardPanel view={view} />
    </div>
  );
}

/**
 * The drawn map: streets, the river, the hub, the waiting drops and, once routed, each loop.
 */
function BoardMap({ view }: { view: BoardView }): ReactNode {
  return (
    <svg className="fb-map" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}>
      <title>{mapLabel(view)}</title>
      <Streets />
      <path className="fb-river" d={RIVER_PATH} />
      {LOOPS.map((loop) => (
        <LoopMarks key={loop.id} loop={loop} view={view} />
      ))}
      <rect
        className="fb-hub"
        x={HUB.x - HUB_HALF_SIDE}
        y={HUB.y - HUB_HALF_SIDE}
        width={HUB_HALF_SIDE * 2}
        height={HUB_HALF_SIDE * 2}
        rx={HUB_CORNER_RADIUS}
      />
    </svg>
  );
}

/**
 * The street grid under everything else.
 */
function Streets(): ReactNode {
  const columns = Array.from({ length: MAP_WIDTH / STREET_SPACING - 1 }, (_, index) => index + 1);
  const rows = Array.from({ length: MAP_HEIGHT / STREET_SPACING }, (_, index) => index + 1);
  return (
    <g className="fb-streets">
      {columns.map((column) => (
        <line
          key={`x${column}`}
          x1={column * STREET_SPACING}
          x2={column * STREET_SPACING}
          y1={0}
          y2={MAP_HEIGHT}
        />
      ))}
      {rows.map((row) => (
        <line
          key={`y${row}`}
          x1={0}
          x2={MAP_WIDTH}
          y1={row * STREET_SPACING}
          y2={row * STREET_SPACING}
        />
      ))}
    </g>
  );
}

/**
 * One loop on the map: its route from the hub and back, its stops and, once handed out, its rider
 * leaving the hub.
 */
function LoopMarks({ loop, view }: { loop: SimLoop; view: BoardView }): ReactNode {
  const points = [HUB, ...loop.stops, HUB].map((point) => `${point.x},${point.y}`).join(' ');
  const rider = riderPoint(loop, view.riderProgress);
  return (
    <g data-color={loop.color}>
      <polyline
        className="fb-route"
        points={points}
        pathLength={1}
        strokeDasharray="1 1"
        strokeDashoffset={1 - view.routeDrawn}
      />
      {loop.stops.map((stop, index) => (
        <circle
          key={`${stop.x}-${stop.y}`}
          className="fb-stop"
          data-coloured={index < view.coloured}
          cx={stop.x}
          cy={stop.y}
          r={STOP_RADIUS}
        />
      ))}
      {rider === undefined ? null : (
        <circle className="fb-rider" cx={rider.x} cy={rider.y} r={RIDER_RADIUS} />
      )}
    </g>
  );
}

/**
 * The side panel: the hub and its clock, what Flock is doing, and the loops it has built.
 */
function BoardPanel({ view }: { view: BoardView }): ReactNode {
  const batched = view.phase !== 'waiting' && view.countdownSeconds === 0;
  return (
    <section className="fb-panel">
      <header className="fb-head">
        <span>{BOARD_TIME}</span>
        <span className="fb-status" data-phase={view.phase}>
          <i aria-hidden="true" />
          {PHASE_LABELS[view.phase]}
        </span>
      </header>
      <p className="fb-headline">
        {batched ? `${LOOPS.length} loops of ${DROPS_PER_LOOP}` : `${WAITING_DROPS} drops waiting`}
      </p>
      <p className="fb-sub">
        {batched
          ? `Batched by Flock at ${BOARD_TIME}`
          : `Next batch in ${countdown(view.countdownSeconds)}`}
      </p>
      <div className="fb-loops">
        {LOOPS.map((loop) => (
          <LoopCard key={loop.id} loop={loop} view={view} shown={batched} />
        ))}
      </div>
    </section>
  );
}

/**
 * One loop in the panel: its number and size, its plan once routed, its rider once handed out.
 */
function LoopCard({
  loop,
  view,
  shown,
}: {
  loop: SimLoop;
  view: BoardView;
  shown: boolean;
}): ReactNode {
  const routed = view.phase === 'routing' || view.phase === 'riding';
  const plan = routed ? ` · ${loop.minutes} min · ${loop.km.toFixed(1)} km` : '';
  return (
    <article className="fb-loop" data-color={loop.color} data-shown={shown}>
      <header>
        <i aria-hidden="true" />
        <strong>Loop {loop.id}</strong>
        <span data-shown={view.riderProgress !== undefined}>{loop.rider} is out</span>
      </header>
      <p>
        {loop.stops.length} drops{plan}
      </p>
    </article>
  );
}

/**
 * Where a loop's rider is drawn: on the way from the hub to the loop's first stop.
 *
 * @param loop - The loop.
 * @param progress - How far along, from 0 to 1, or `undefined` before the loop is handed out.
 * @returns The point, or `undefined` when no rider is out yet.
 */
function riderPoint(loop: SimLoop, progress: number | undefined): MapPoint | undefined {
  const first = loop.stops[0];
  if (progress === undefined || first === undefined) {
    return undefined;
  }

  return {
    x: HUB.x + (first.x - HUB.x) * progress,
    y: HUB.y + (first.y - HUB.y) * progress,
  };
}

/**
 * A countdown as minutes and seconds, such as `0:12`.
 *
 * @param seconds - Whole seconds, zero or more.
 * @returns The countdown text.
 */
function countdown(seconds: number): string {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const rest = String(seconds % SECONDS_PER_MINUTE).padStart(2, '0');
  return `${minutes}:${rest}`;
}

/**
 * What the map shows at this moment, for people who cannot see it.
 *
 * @param view - The board.
 * @returns One sentence.
 */
function mapLabel(view: BoardView): string {
  if (view.phase === 'waiting' || view.coloured === 0) {
    return `A map of the Old Town with ${WAITING_DROPS} drops waiting around the hub.`;
  }

  return (
    'A map of the Old Town with the drops grouped into ' +
    `${LOOPS.length} loops of ${DROPS_PER_LOOP} around the hub.`
  );
}
