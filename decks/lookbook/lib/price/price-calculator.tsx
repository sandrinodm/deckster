import { useState, type ChangeEvent, type ReactNode } from 'react';

import { DROPS_STEP, INITIAL_DROPS, MAX_DROPS, MIN_DROPS, quote, type PlanQuote } from './plans.ts';
import './price-calculator.css';

/**
 * Props of {@link PriceSheet}.
 */
export type PriceSheetProps = {
  /**
   * Drops a month to price; clamped to the calculator's range.
   */
  drops: number;

  /**
   * The control laid over the slider's track, such as a range input; the track alone is drawn when
   * it is absent, which is what the poster shows.
   */
  control?: ReactNode;
};

/**
 * Formats whole euros the way the price list writes them, such as `€1,860`.
 */
const WHOLE_EUROS = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

/**
 * Formats euros and cents, such as `€3.10`.
 */
const EUROS_AND_CENTS = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats a count of drops with a thousands separator, such as `1,200`.
 */
const DROP_COUNT = new Intl.NumberFormat('en-GB');

/**
 * How many percent make up a whole, used to turn the slider's fraction into a width.
 */
const PERCENT = 100;

/**
 * The drop price calculator a merchant can use on the slide: drag the slider, or click it and use
 * the arrow keys, and the three plans' monthly bills update with the cheapest marked. The arrow
 * keys belong to the slider while it has focus, so they do not move the deck; Escape gives the
 * keyboard back.
 */
export function PriceCalculator(): ReactNode {
  const [drops, setDrops] = useState(INITIAL_DROPS);
  const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setDrops(Number(event.target.value));
  };
  return (
    <PriceSheet
      drops={drops}
      control={
        <input
          className="pc-input"
          type="range"
          min={MIN_DROPS}
          max={MAX_DROPS}
          step={DROPS_STEP}
          value={drops}
          onChange={onChange}
          aria-label="Drops a month"
          aria-valuetext={`${DROP_COUNT.format(drops)} drops a month`}
        />
      }
    />
  );
}

/**
 * The calculator drawn for a number of drops: the count, the slider's track and one row per plan.
 * The live calculator passes its range input as `control`; the poster draws it without one.
 */
export function PriceSheet({ drops, control }: PriceSheetProps): ReactNode {
  const quotes = quote(drops);
  const filled = ((drops - MIN_DROPS) / (MAX_DROPS - MIN_DROPS)) * PERCENT;
  return (
    <div className="pc">
      <div className="pc-volume">
        <p className="pc-label">Drops a month</p>
        <output className="pc-count">{DROP_COUNT.format(drops)}</output>
        <div className="pc-slider">
          <div className="pc-track" aria-hidden="true">
            <span className="pc-fill" style={{ width: `${filled}%` }} />
            <span className="pc-thumb" style={{ left: `${filled}%` }} />
          </div>
          {control}
        </div>
        <p className="pc-range">
          <span>{DROP_COUNT.format(MIN_DROPS)}</span>
          <span>{DROP_COUNT.format(MAX_DROPS)}</span>
        </p>
      </div>
      <div className="pc-plans">
        {quotes.map((item) => (
          <PlanRow key={item.plan.id} quote={item} />
        ))}
      </div>
    </div>
  );
}

/**
 * One plan's row: its name, what a drop really costs on it and the month's bill.
 */
function PlanRow({ quote: item }: { quote: PlanQuote }): ReactNode {
  return (
    <article className="pc-plan" data-cheapest={item.cheapest}>
      <p className="pc-plan-name">{item.plan.name}</p>
      {item.cheapest ? <p className="pc-tag">Cheapest</p> : null}
      <p className="pc-plan-drop">{EUROS_AND_CENTS.format(item.effectiveEur)} a drop</p>
      <p className="pc-plan-month">{WHOLE_EUROS.format(item.monthlyEur)}</p>
    </article>
  );
}
