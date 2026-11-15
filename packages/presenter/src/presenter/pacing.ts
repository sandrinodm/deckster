/**
 * How the talk is going against its plan.
 */
export type Pacing = {
  /**
   * `idle` before the timer has started, `ahead` or `behind` the planned time, `on-pace` inside the
   * current slide's own window, or `unplanned` when neither the slides nor the deck have a time.
   */
  status: 'idle' | 'ahead' | 'behind' | 'on-pace' | 'unplanned';

  /**
   * Seconds ahead or behind, always positive; 0 when idle, on pace or unplanned.
   */
  offsetSeconds: number;

  /**
   * The current slide's planned time in seconds, after scaling to the deck's `duration`;
   * `undefined` when the slide has none.
   */
  slideBudgetSeconds: number | undefined;

  /**
   * Seconds left of the current slide's own budget, counted from when the slide came on screen;
   * negative once it is over; `undefined` when the slide has no budget.
   */
  slideRemainingSeconds: number | undefined;

  /**
   * Seconds left in the whole talk, against the deck `duration` or else the sum of the budgets;
   * negative once over; `undefined` when neither exists.
   */
  totalRemainingSeconds: number | undefined;
};

/**
 * What pacing is computed from.
 */
export type PacingInput = {
  /**
   * Each slide's budget in seconds, `undefined` for a slide without one, in deck order.
   */
  budgets: readonly (number | undefined)[];

  /**
   * The zero-based slide on screen.
   */
  slide: number;

  /**
   * Seconds on the timer.
   */
  elapsedSeconds: number;

  /**
   * Seconds on the timer since the current slide came on screen.
   */
  slideElapsedSeconds: number;

  /**
   * Whether the timer has been started (it may be paused since).
   */
  started: boolean;

  /**
   * The deck's `duration` in seconds, if the config has one.
   */
  durationSeconds: number | undefined;
};

/**
 * Compares the timer with the schedule the slide budgets make. The budgets are first fitted to the
 * deck's `duration` (see {@link planBudgets}). The schedule says the talk should be on slide N
 * between the budgets of the slides before N and the budgets up to and including N: earlier than
 * that window is ahead, later is behind, inside it is on pace. Before the timer starts the status
 * is `idle`, so nothing claims the talk is ahead before it has begun. The slide's own countdown
 * runs from when the slide came on screen.
 *
 * @param input - The budgets, the current slide, the timer and the deck duration.
 */
export function computePacing(input: PacingInput): Pacing {
  const { slide, elapsedSeconds, slideElapsedSeconds, started, durationSeconds } = input;
  const plan = planBudgets(input.budgets, durationSeconds);
  const hasPlan = plan.some((budget) => budget !== undefined);
  const total = durationSeconds ?? (hasPlan ? sum(plan) : undefined);
  const totalRemainingSeconds = total === undefined ? undefined : total - elapsedSeconds;
  const own = plan[slide];
  const slideRemainingSeconds = own === undefined ? undefined : own - slideElapsedSeconds;
  const base = { slideBudgetSeconds: own, slideRemainingSeconds, totalRemainingSeconds };
  if (!hasPlan) {
    return { status: 'unplanned', offsetSeconds: 0, ...base };
  }

  if (!started) {
    return { status: 'idle', offsetSeconds: 0, ...base };
  }

  const windowStart = sum(plan.slice(0, slide));
  const windowEnd = windowStart + (own ?? 0);
  if (elapsedSeconds < windowStart) {
    return { status: 'ahead', offsetSeconds: Math.round(windowStart - elapsedSeconds), ...base };
  }

  if (elapsedSeconds > windowEnd) {
    return { status: 'behind', offsetSeconds: Math.round(elapsedSeconds - windowEnd), ...base };
  }

  return { status: 'on-pace', offsetSeconds: 0, ...base };
}

/**
 * Fits the slide budgets to the deck's `duration`. Without a duration the budgets stand as written.
 * With one, the time the budgets leave over is shared evenly by the slides without a budget, and
 * then every budget is scaled so they add up to the duration exactly: a 20-minute talk whose
 * budgets add up to 10 minutes plans each slide at twice its budget.
 *
 * @param budgets - Each slide's budget in seconds, `undefined` for none.
 * @param durationSeconds - The deck's `duration`, if it has one.
 * @returns A budget per slide; unchanged when there is no duration or no slide has a budget.
 */
export function planBudgets(
  budgets: readonly (number | undefined)[],
  durationSeconds: number | undefined,
): readonly (number | undefined)[] {
  const hasBudgets = budgets.some((budget) => budget !== undefined);
  if (durationSeconds === undefined || !hasBudgets) {
    return budgets;
  }

  const written = sum(budgets);
  const unplanned = budgets.filter((budget) => budget === undefined).length;
  const share = unplanned === 0 ? 0 : Math.max(0, durationSeconds - written) / unplanned;
  const filled = budgets.map((budget) => budget ?? share);
  const filledTotal = sum(filled);
  if (filledTotal === 0) {
    return budgets;
  }

  const scale = durationSeconds / filledTotal;
  return filled.map((budget) => budget * scale);
}

/**
 * The sum of the budgets that exist.
 *
 * @param budgets - Budgets in seconds.
 */
function sum(budgets: readonly (number | undefined)[]): number {
  return budgets.reduce<number>((total, budget) => total + (budget ?? 0), 0);
}
