/**
 * A point on the board's map, in the map's own units (its view box is 800 by 500).
 */
export type MapPoint = {
  /**
   * Distance from the left edge.
   */
  x: number;

  /**
   * Distance from the top edge.
   */
  y: number;
};

/**
 * One loop Flock builds in the simulation: its stops in riding order and who rides it.
 */
export type SimLoop = {
  /**
   * The loop's number, as Dispatch shows it.
   */
  id: number;

  /**
   * Which of the brand's categorical data colours marks the loop, from 1.
   */
  color: number;

  /**
   * The drops' doors, in the order the route solver puts them.
   */
  stops: readonly MapPoint[];

  /**
   * The loop's planned time, in minutes.
   */
  minutes: number;

  /**
   * The loop's planned distance, in kilometres.
   */
  km: number;

  /**
   * The first name of the rider who takes it.
   */
  rider: string;
};

/**
 * What the board is doing, for the status pill in its header.
 */
export type SimPhase = 'waiting' | 'batching' | 'routing' | 'riding';

/**
 * The board at one moment of the simulation.
 */
export type BoardView = {
  /**
   * What the board is doing.
   */
  phase: SimPhase;

  /**
   * Seconds left until the next batch; zero once Flock has batched.
   */
  countdownSeconds: number;

  /**
   * How many stops of each loop carry their loop's colour, from 0 to the loop's length.
   */
  coloured: number;

  /**
   * How much of each route is drawn, from 0 to 1.
   */
  routeDrawn: number;

  /**
   * How far each rider has ridden from the hub towards the first stop, from 0 to 1, or `undefined`
   * before the loops are handed out.
   */
  riderProgress: number | undefined;
};

/**
 * The hub on the map: the Old Town hub, in the middle.
 */
export const HUB: MapPoint = { x: 400, y: 250 };

/**
 * The time on the board's clock while the simulation runs.
 */
export const BOARD_TIME = '09:56';

/**
 * The two loops Flock builds from the eighteen waiting drops. The riders are the two whose last
 * loops (14 and 15 on the Dispatch screen) are back at the hub.
 */
export const LOOPS: readonly SimLoop[] = [
  {
    id: 17,
    color: 1,
    stops: [
      { x: 450, y: 190 },
      { x: 500, y: 130 },
      { x: 580, y: 90 },
      { x: 660, y: 100 },
      { x: 720, y: 160 },
      { x: 700, y: 240 },
      { x: 630, y: 280 },
      { x: 560, y: 300 },
      { x: 480, y: 290 },
    ],
    minutes: 66,
    km: 7.0,
    rider: 'Aoife',
  },
  {
    id: 18,
    color: 2,
    stops: [
      { x: 340, y: 300 },
      { x: 290, y: 360 },
      { x: 220, y: 410 },
      { x: 140, y: 400 },
      { x: 100, y: 330 },
      { x: 130, y: 260 },
      { x: 200, y: 220 },
      { x: 270, y: 200 },
      { x: 340, y: 190 },
    ],
    minutes: 70,
    km: 7.4,
    rider: 'Jonas',
  },
];

/**
 * Every waiting drop, across both loops.
 */
export const WAITING_DROPS = LOOPS.reduce((total, loop) => total + loop.stops.length, 0);

/**
 * Seconds on the countdown to the next batch when the simulation opens.
 */
export const COUNTDOWN_START_SECONDS = 12;

/**
 * Clock ticks one step takes to play out.
 */
export const STEP_TICKS = 24;

/**
 * How long one clock tick is, in milliseconds.
 */
export const TICK_MS = 50;

/**
 * The phase of each slide step: step 0 shows the drops waiting, then one step each to batch them,
 * route them and hand the loops to riders.
 */
const PHASES: readonly SimPhase[] = ['waiting', 'batching', 'routing', 'riding'];

/**
 * The last step of the simulation; the app asks the deck for this many steps.
 */
export const LAST_STEP = PHASES.length - 1;

/**
 * The share of the batching step spent counting down; the rest colours the stops.
 */
const COUNTDOWN_SHARE = 0.5;

/**
 * The board as it looks `tick` ticks into `step`. Earlier steps are complete; a step that is not
 * being played passes `STEP_TICKS` and shows its finished frame.
 *
 * @param step - The slide step; values outside 0 to `LAST_STEP` are clamped.
 * @param tick - Ticks played within the step; values outside 0 to `STEP_TICKS` are clamped.
 * @returns The view to draw.
 */
export function viewAt(step: number, tick: number): BoardView {
  const current = clamp(step, 0, LAST_STEP);
  const progress = clamp(tick, 0, STEP_TICKS) / STEP_TICKS;
  const phase = PHASES[current] ?? 'waiting';
  const stopsPerLoop = LOOPS[0]?.stops.length ?? 0;
  switch (phase) {
    case 'waiting':
      return {
        phase,
        countdownSeconds: COUNTDOWN_START_SECONDS,
        coloured: 0,
        routeDrawn: 0,
        riderProgress: undefined,
      };
    case 'batching':
      return {
        phase,
        countdownSeconds: Math.ceil(
          COUNTDOWN_START_SECONDS * Math.max(1 - progress / COUNTDOWN_SHARE, 0),
        ),
        coloured: Math.floor(
          stopsPerLoop * Math.max((progress - COUNTDOWN_SHARE) / (1 - COUNTDOWN_SHARE), 0),
        ),
        routeDrawn: 0,
        riderProgress: undefined,
      };
    case 'routing':
      return {
        phase,
        countdownSeconds: 0,
        coloured: stopsPerLoop,
        routeDrawn: progress,
        riderProgress: undefined,
      };
    case 'riding':
      return {
        phase,
        countdownSeconds: 0,
        coloured: stopsPerLoop,
        routeDrawn: 1,
        riderProgress: progress,
      };
  }
}

/**
 * Keeps a number inside a range.
 *
 * @param value - Any number.
 * @param min - The smallest value returned.
 * @param max - The largest value returned.
 * @returns `value`, or the nearer end of the range when it falls outside.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
