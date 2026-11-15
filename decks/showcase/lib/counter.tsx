import { useSlide } from '@deckster/engine';
import { useState, type KeyboardEvent, type ReactNode } from 'react';

import './counter.css';

/**
 * The count the widget starts at, and the one its poster shows.
 */
const INITIAL_COUNT = 3;

/**
 * The smallest count the widget shows.
 */
const MIN_COUNT = 0;

/**
 * The largest count the widget shows.
 */
const MAX_COUNT = 99;

/**
 * An inline widget: a counter you step with its buttons or, once you have clicked anywhere on it,
 * the arrow keys. The arrows belong to the widget while it has focus, so they do not move the deck;
 * Escape gives the keyboard back. It counts only while its slide is on screen.
 */
export function Counter(): ReactNode {
  const { isActive } = useSlide();
  const [count, setCount] = useState(INITIAL_COUNT);
  const change = (delta: number): void => {
    setCount((value) => Math.min(Math.max(value + delta, MIN_COUNT), MAX_COUNT));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault();
      change(1);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault();
      change(-1);
    }
  };
  // The whole counter is one focus target, so a click anywhere on it gives it the arrow keys; the
  // buttons inside stay the way to change it by pointer and by Tab.
  /* oxlint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/prefer-tag-over-role */
  return (
    <div
      className="counter"
      data-active={isActive}
      role="group"
      aria-label="Votes for the demo; arrow keys change the count"
      tabIndex={0}
      onKeyDown={onKeyDown}>
      <p className="counter-label">Votes for the demo</p>
      <output className="counter-value" aria-live="polite">
        {count}
      </output>
      <div className="counter-controls">
        <button type="button" onClick={() => change(-1)} aria-label="One fewer">
          <span aria-hidden="true">−</span>
        </button>
        <button type="button" onClick={() => change(1)} aria-label="One more">
          <span aria-hidden="true">+</span>
        </button>
      </div>
      <p className="counter-hint">Click here, then use the arrow keys</p>
    </div>
  );
  /* oxlint-enable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/prefer-tag-over-role */
}
