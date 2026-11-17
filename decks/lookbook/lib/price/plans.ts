/**
 * One way a merchant can pay for drops, with the prices from Wrenhaul's price list.
 */
export type Plan = {
  /**
   * A stable id, used as the element key.
   */
  id: 'per-drop' | 'hub' | 'network';

  /**
   * The plan's name, as the price list writes it.
   */
  name: string;

  /**
   * The price of one drop, in euros.
   */
  perDropEur: number;

  /**
   * The fixed monthly fee, in euros; zero when the plan has none.
   */
  monthlyFeeEur: number;

  /**
   * The drops billed each month at least, whether or not they are sent.
   */
  minimumDrops: number;
};

/**
 * A plan's bill for one month of drops.
 */
export type PlanQuote = {
  /**
   * The plan this bill is for.
   */
  plan: Plan;

  /**
   * What the month costs, in euros.
   */
  monthlyEur: number;

  /**
   * What each drop sent costs once the fee and any minimum are spread over it, in euros.
   */
  effectiveEur: number;

  /**
   * Whether no other plan is cheaper for this month.
   */
  cheapest: boolean;
};

/**
 * The three plans, in the order the price list gives them. Open Network's volume tiers start above
 * 10,000 drops a month, beyond the calculator's range, so they are left out.
 */
export const PLANS: readonly Plan[] = [
  { id: 'per-drop', name: 'Pay per drop', perDropEur: 3.4, monthlyFeeEur: 0, minimumDrops: 0 },
  { id: 'hub', name: 'Hub plan', perDropEur: 2.9, monthlyFeeEur: 190, minimumDrops: 500 },
  { id: 'network', name: 'Open Network', perDropEur: 3.1, monthlyFeeEur: 0, minimumDrops: 0 },
];

/**
 * The fewest drops a month the calculator offers.
 */
export const MIN_DROPS = 100;

/**
 * The most drops a month the calculator offers.
 */
export const MAX_DROPS = 3000;

/**
 * How far one move of the slider changes the drops a month.
 */
export const DROPS_STEP = 50;

/**
 * The drops a month the calculator opens at, and the one its poster shows.
 */
export const INITIAL_DROPS = 600;

/**
 * Cents in a euro, for rounding bills.
 */
const CENTS_PER_EURO = 100;

/**
 * Every plan's bill for a month, with the cheapest marked.
 *
 * @param drops - Drops sent in the month; clamped to `MIN_DROPS` to `MAX_DROPS`.
 * @returns One quote per plan, in the order of `PLANS`; exactly one is marked cheapest, and a tie
 *   goes to the plan with the lower monthly fee.
 */
export function quote(drops: number): PlanQuote[] {
  const sent = Math.min(Math.max(drops, MIN_DROPS), MAX_DROPS);
  const bills = PLANS.map((plan) => ({ plan, monthlyEur: monthlyBill(plan, sent) }));
  const best = bills.reduce((winner, bill) => (cheaper(bill, winner) ? bill : winner));
  return bills.map((bill) => ({
    ...bill,
    effectiveEur: bill.monthlyEur / sent,
    cheapest: bill === best,
  }));
}

/**
 * Whether one bill beats another: a lower total, or the same total with a lower monthly fee, so a
 * tie goes to the plan that commits the merchant to less.
 *
 * @param bill - The challenger.
 * @param winner - The best bill so far.
 * @returns `true` when `bill` should replace `winner`.
 */
function cheaper(
  bill: { plan: Plan; monthlyEur: number },
  winner: { plan: Plan; monthlyEur: number },
): boolean {
  if (bill.monthlyEur !== winner.monthlyEur) {
    return bill.monthlyEur < winner.monthlyEur;
  }

  return bill.plan.monthlyFeeEur < winner.plan.monthlyFeeEur;
}

/**
 * What one plan bills for a month.
 *
 * @param plan - The plan.
 * @param drops - Drops sent in the month, already in range.
 * @returns The bill, in euros, rounded to the cent.
 */
function monthlyBill(plan: Plan, drops: number): number {
  const bill = Math.max(drops, plan.minimumDrops) * plan.perDropEur + plan.monthlyFeeEur;
  return Math.round(bill * CENTS_PER_EURO) / CENTS_PER_EURO;
}
