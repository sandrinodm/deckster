/**
 * Stands for "the last step of this slide" before the slide has registered its steps. It is
 * replaced by the real last step as soon as the slide reports its step count, so entering a slide
 * backwards lands on its last step even when the slide was not mounted yet.
 */
export const UNRESOLVED_LAST_STEP = Number.MAX_SAFE_INTEGER;

/**
 * A place in the deck: a zero-based slide index and a step, where step 0 shows no `<Step>`.
 */
export type Position = {
  /**
   * The zero-based slide index.
   */
  slide: number;

  /**
   * The zero-based step; 0 shows no `<Step>` yet.
   */
  step: number;
};

/**
 * Which way the last move went: `forward` to a later step or slide, `backward` to an earlier one,
 * `none` before the first move. Slide transitions read it from `data-direction`.
 */
export type Direction = 'forward' | 'backward' | 'none';

/**
 * A one-step move that waits while the slide on screen has not reported its step count.
 */
type QueuedMove = 'next' | 'prev';

/**
 * Navigation state: where the deck is and what it knows about each slide's steps.
 */
export type NavigationState = {
  /**
   * The requested position. Its step may exceed the slide's step count, which is clamped on read by
   * {@link currentPosition}, so a slide whose steps remount briefly keeps its step. While the
   * slide's count is not final, a step beyond it is pending: it is reported as requested and lands
   * (clamped to the final count) once the slide settles.
   */
  position: Position;

  /**
   * How many slides the deck has; always 1 or more.
   */
  slideCount: number;

  /**
   * Step count per slide index, `undefined` until that slide has mounted once.
   */
  stepCounts: readonly (number | undefined)[];

  /**
   * Per slide index, whether its step count is final: the slide's content has committed and nothing
   * holds its readiness (`useReadyHold`, a lazy chunk, a suspended boundary), so no more steps are
   * coming. `false` while the count is unknown.
   */
  finalCounts: readonly boolean[];

  /**
   * Which way the last move went.
   */
  direction: Direction;

  /**
   * The slide the deck left on its last move between slides, `undefined` before the first. A move
   * between steps of one slide keeps it, so the slide transition the stage is showing does not
   * change under it.
   */
  previousSlide: number | undefined;

  /**
   * `next` and `prev` moves made while the slide on screen had not reported its step count, applied
   * in order as soon as it does. Without the wait, a `next` would treat an unmounted slide as
   * having one step and skip its steps.
   */
  queued: readonly QueuedMove[];
};

/**
 * Everything that can move the deck or teach it about a slide's steps.
 */
export type NavigationAction =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'first' }
  | { type: 'last' }
  | { type: 'goto'; position: Position }
  | {
      type: 'step-count';
      slide: number;
      count: number;
      /**
       * Whether the count is final; `false` while something on the slide still holds its readiness
       * and may register more steps. Defaults to `true`.
       */
      final?: boolean;
    };

/**
 * The navigation actions a key or a control can trigger directly.
 */
export type MoveAction = Extract<NavigationAction, { type: 'next' | 'prev' | 'first' | 'last' }>;

/**
 * Creates navigation state for a deck.
 *
 * @param slideCount - Number of slides; must be 1 or more.
 * @param position - Where to start; out-of-range slides are clamped into the deck.
 * @returns State with no step counts known yet.
 * @throws RangeError when `slideCount` is less than 1.
 */
export function createNavigationState(
  slideCount: number,
  position: Position = { slide: 0, step: 0 },
): NavigationState {
  if (!Number.isInteger(slideCount) || slideCount < 1) {
    throw new RangeError(`A deck needs at least one slide; got ${slideCount}.`);
  }

  const stepCounts = Array.from({ length: slideCount }, () => undefined);
  const finalCounts = Array.from({ length: slideCount }, () => false);
  return {
    slideCount,
    stepCounts,
    finalCounts,
    position: clampPosition(position, slideCount, stepCounts, finalCounts),
    direction: 'none',
    previousSlide: undefined,
    queued: [],
  };
}

/**
 * Applies a navigation action. `next` and `prev` move one step from the current position and cross
 * into the neighbouring slide at the ends; `prev` enters the previous slide on its last step. Moves
 * clamp to the deck and to final step counts; a step beyond a count that is not final yet stays
 * pending until the slide settles. While the slide on screen has not reported its step count,
 * `next` (and a `prev` that needs its last step) wait in {@link NavigationState.queued} and run when
 * the `step-count` arrives; `goto`, `first` and `last` drop the waiting moves. A `next` or `prev`
 * while a step is pending gives up the pending step and moves from the step on screen, so a late
 * count never pulls the deck away from where the presenter went.
 *
 * @param state - The current state.
 * @param action - What happened.
 * @returns The next state, or the same object when nothing changed.
 */
export function navigate(state: NavigationState, action: NavigationAction): NavigationState {
  switch (action.type) {
    case 'next':
    case 'prev':
      return stepOrQueue(state, action.type);
    case 'first':
      return moveTo(cleared(state), { slide: 0, step: 0 });
    case 'last':
      return moveTo(cleared(state), { slide: state.slideCount - 1, step: UNRESOLVED_LAST_STEP });
    case 'goto':
      return moveTo(cleared(state), action.position);
    case 'step-count':
      return runQueued(recordStepCount(state, action.slide, action.count, action.final ?? true));
  }
}

/**
 * The position on screen: the requested position with its step clamped to the slide's last step
 * once the slide's step count is final. Until then the requested step is returned as is (it is
 * pending, see {@link isStepPending}), which may be {@link UNRESOLVED_LAST_STEP}, so the hash, the
 * API and a presenter window never report a step 0 the deck is about to leave.
 *
 * @param state - The navigation state.
 */
export function currentPosition(state: NavigationState): Position {
  const { slide, step } = state.position;
  const lastStep = lastStepOf(state, slide);
  if (lastStep === undefined || step <= lastStep || state.finalCounts[slide] !== true) {
    return state.position;
  }

  return { slide, step: lastStep };
}

/**
 * Whether the requested step waits for its slide to settle: the slide has reported a step count
 * that is not final yet and the requested step lies beyond it. `ready()` does not resolve while a
 * step is pending.
 *
 * @param state - The navigation state.
 */
export function isStepPending(state: NavigationState): boolean {
  const { slide, step } = state.position;
  const lastStep = lastStepOf(state, slide);
  return lastStep !== undefined && step > lastStep && state.finalCounts[slide] !== true;
}

/**
 * The last step of a slide, if the slide has registered its steps.
 *
 * @returns The zero-based last step, or `undefined` while the step count is unknown.
 */
export function lastStepOf(state: NavigationState, slide: number): number | undefined {
  const count = state.stepCounts[slide];
  if (count === undefined) {
    return undefined;
  }

  return count - 1;
}

/**
 * Applies a `next` or `prev`, or queues it behind the moves already waiting.
 *
 * @param state - The navigation state.
 * @param move - The move.
 */
function stepOrQueue(state: NavigationState, move: QueuedMove): NavigationState {
  const from = withoutPendingStep(state);
  if (from.queued.length > 0 || mustWait(from, move)) {
    return { ...from, queued: [...from.queued, move] };
  }

  return applyMove(from, move);
}

/**
 * The state with a pending step given up for the slide's last known step, the step on screen; the
 * same object when no step is pending.
 *
 * @param state - The navigation state.
 */
function withoutPendingStep(state: NavigationState): NavigationState {
  const lastStep = lastStepOf(state, state.position.slide);
  if (!isStepPending(state) || lastStep === undefined) {
    return state;
  }

  return { ...state, position: { slide: state.position.slide, step: lastStep } };
}

/**
 * Applies the queued moves in order, stopping at the first that still has to wait.
 *
 * @param state - The navigation state, after a step count was recorded.
 */
function runQueued(state: NavigationState): NavigationState {
  let current: NavigationState = cleared(state);
  for (const [index, move] of state.queued.entries()) {
    if (mustWait(current, move)) {
      return { ...current, queued: state.queued.slice(index) };
    }

    current = applyMove(current, move);
  }

  return current;
}

/**
 * Whether a move needs the step count of the slide on screen and it is not known yet: `next` always
 * does (to know whether the slide has a step left), `prev` only when the deck stands on the slide's
 * unresolved last step.
 *
 * @param state - The navigation state.
 * @param move - The move.
 */
function mustWait(state: NavigationState, move: QueuedMove): boolean {
  const { slide, step } = state.position;
  if (lastStepOf(state, slide) !== undefined) {
    return false;
  }

  return move === 'next' || step === UNRESOLVED_LAST_STEP;
}

/**
 * Applies a `next` or `prev` whose slide's step count is known.
 *
 * @param state - The navigation state.
 * @param move - The move.
 */
function applyMove(state: NavigationState, move: QueuedMove): NavigationState {
  return moveTo(state, move === 'next' ? nextPosition(state) : previousPosition(state));
}

/**
 * The state without waiting moves; the same object when none wait.
 *
 * @param state - The navigation state.
 */
function cleared(state: NavigationState): NavigationState {
  return state.queued.length === 0 ? state : { ...state, queued: [] };
}

/**
 * One step forward: the next step, else the start of the next slide, else where the deck already
 * is. Only called once the slide's step count is known.
 *
 * @param state - The navigation state.
 */
function nextPosition(state: NavigationState): Position {
  const { slide, step } = currentPosition(state);
  const lastStep = lastStepOf(state, slide) ?? 0;
  if (step < lastStep) {
    return { slide, step: step + 1 };
  }

  if (slide < state.slideCount - 1) {
    return { slide: slide + 1, step: 0 };
  }

  return state.position;
}

/**
 * One step back: the previous step, else the previous slide at its last step, else where the deck
 * already is.
 *
 * @param state - The navigation state.
 */
function previousPosition(state: NavigationState): Position {
  const position = currentPosition(state);
  const { slide, step } = position;
  if (step > 0) {
    return { slide, step: step - 1 };
  }

  if (slide > 0) {
    return { slide: slide - 1, step: UNRESOLVED_LAST_STEP };
  }

  return position;
}

/**
 * Moves to a position, clamped to the deck and the slide's known steps.
 *
 * @param state - The navigation state.
 * @param target - Where to go.
 * @returns The same state object when the clamped position is the one on screen.
 */
function moveTo(state: NavigationState, target: Position): NavigationState {
  const position = clampPosition(target, state.slideCount, state.stepCounts, state.finalCounts);
  const from = currentPosition(state);
  if (samePosition(position, from)) {
    return state;
  }

  const direction = isBefore(from, position) ? 'forward' : 'backward';
  const previousSlide = position.slide === from.slide ? state.previousSlide : from.slide;
  return { ...state, position, direction, previousSlide };
}

/**
 * Records a slide's step count, at least 1, and whether it is final. A slide index outside the deck
 * is ignored.
 *
 * @param state - The navigation state.
 * @param slide - The zero-based slide index.
 * @param count - The number of steps the slide registered.
 * @param final - Whether the slide has settled, so no more steps are coming.
 * @returns The same state object when nothing changed.
 */
function recordStepCount(
  state: NavigationState,
  slide: number,
  count: number,
  final: boolean,
): NavigationState {
  const isKnownSlide = slide >= 0 && slide < state.slideCount;
  const steps = Math.max(1, count);
  if (!isKnownSlide || (state.stepCounts[slide] === steps && state.finalCounts[slide] === final)) {
    return state;
  }

  return {
    ...state,
    stepCounts: state.stepCounts.with(slide, steps),
    finalCounts: state.finalCounts.with(slide, final),
  };
}

/**
 * Clamps a position into the deck: the slide to an existing index, the step to the slide's last
 * step once its count is final (else to {@link UNRESOLVED_LAST_STEP}, so a step the slide has not
 * registered yet stays pending).
 *
 * @param position - The requested position.
 * @param slideCount - How many slides the deck has.
 * @param stepCounts - Step count per slide index, `undefined` where unknown.
 * @param finalCounts - Whether each slide's count is final.
 */
function clampPosition(
  position: Position,
  slideCount: number,
  stepCounts: readonly (number | undefined)[],
  finalCounts: readonly boolean[],
): Position {
  const slide = clampInteger(position.slide, 0, slideCount - 1);
  const count = stepCounts[slide];
  const maxStep =
    count === undefined || finalCounts[slide] !== true ? UNRESOLVED_LAST_STEP : count - 1;
  return { slide, step: clampInteger(position.step, 0, maxStep) };
}

/**
 * Truncates a number to an integer within `min` and `max`; `NaN` becomes `min`.
 *
 * @param value - The number to clamp.
 * @param min - The smallest allowed value.
 * @param max - The largest allowed value.
 */
function clampInteger(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * Whether position `a` comes before position `b` in the deck.
 *
 * @param a - One position.
 * @param b - The other position.
 */
function isBefore(a: Position, b: Position): boolean {
  return a.slide === b.slide ? a.step < b.step : a.slide < b.slide;
}

/**
 * Whether two positions name the same slide and step.
 *
 * @param a - One position.
 * @param b - The other position.
 */
function samePosition(a: Position, b: Position): boolean {
  return a.slide === b.slide && a.step === b.step;
}
