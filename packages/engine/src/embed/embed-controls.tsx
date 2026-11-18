import type { ReactNode } from 'react';

import { useDeck, type DeckControls } from '#deck/deck-context.ts';
import { fullDeckUrl } from '#embed/embed-mode.ts';
import { useIdle } from '#embed/use-idle.ts';
import {
  neighbourShownSlide,
  shownPageNumber,
  shownSlideIndexes,
} from '#navigation/shown-slides.ts';
import '#embed/embed.css';

/**
 * How long the control stays on screen without input before it fades out, in milliseconds.
 */
export const EMBED_CONTROLS_IDLE_MS = 2000;

/**
 * The small control an embedded deck shows in its bottom corner: previous and next (one step each,
 * like the arrow keys), "Slide n of N" counting the shown slides (a hidden slide the deck was sent
 * to shows "N slides" without a number), and a link that opens the whole deck at the same position
 * in a new tab. It sits outside the stage, so its clicks never reach mouse navigation, and it never
 * takes focus by itself.
 *
 * It fades out after {@link EMBED_CONTROLS_IDLE_MS} without input in the frame and comes back on a
 * pointer move, a tap, a key or a focus change; it stays while keyboard focus is inside it. At
 * either end of the deck its button is marked `aria-disabled` rather than `disabled`, so a button
 * that reaches the end while focused keeps focus and the control does not fade under it. In a
 * narrow frame (embed.css) the count shortens to "n/N" and the link shows only its icon; the full
 * wording stays in the accessibility tree.
 */
export function EmbedControls(): ReactNode {
  const deck = useDeck();
  const isIdle = useIdle(EMBED_CONTROLS_IDLE_MS);
  const { position, slides } = deck;
  const hidden = slides.map((slide) => slide.hidden);
  const current = shownPageNumber(hidden, position.slide);
  const total = shownSlideIndexes(hidden).length;
  const longCount = current === undefined ? `${total} slides` : `Slide ${current} of ${total}`;
  const shortCount = current === undefined ? `${total}` : `${current}/${total}`;
  const isFirst = isAtStart(deck);
  const isLast = isAtEnd(deck);
  return (
    <div className="deck-embed-layer">
      <nav
        className="deck-embed-controls"
        aria-label="Deck controls"
        data-testid="deck-embed"
        data-idle={isIdle}>
        <button
          type="button"
          className="deck-embed-button"
          aria-label="Previous"
          aria-disabled={isFirst}
          onClick={() => {
            if (!isFirst) {
              deck.prev();
            }
          }}>
          <Chevron points="10,3 5,8 10,13" />
        </button>
        <span className="deck-embed-count" aria-live="polite">
          <span className="deck-embed-long">{longCount}</span>
          <span className="deck-embed-short" aria-hidden="true">
            {shortCount}
          </span>
        </span>
        <button
          type="button"
          className="deck-embed-button"
          aria-label="Next"
          aria-disabled={isLast}
          onClick={() => {
            if (!isLast) {
              deck.next();
            }
          }}>
          <Chevron points="6,3 11,8 6,13" />
        </button>
        <a
          className="deck-embed-open"
          href={fullDeckUrl(window.location, position)}
          target="_blank"
          rel="noopener">
          <OpenIcon />
          <span className="deck-embed-long">Open full deck</span>
        </a>
      </nav>
    </div>
  );
}

/**
 * Whether the deck shows the first step of its first shown slide (or a hidden slide before it),
 * where Previous does nothing.
 *
 * @param deck - The deck's controls.
 */
function isAtStart(deck: DeckControls): boolean {
  const hidden = deck.slides.map((slide) => slide.hidden);
  return (
    neighbourShownSlide(hidden, deck.position.slide, 'backward') === undefined &&
    deck.position.step === 0
  );
}

/**
 * Whether the deck shows the last step of its last shown slide (or a hidden slide after it), where
 * Next does nothing. While the last slide has not reported its steps, Next stays enabled.
 *
 * @param deck - The deck's controls.
 */
function isAtEnd(deck: DeckControls): boolean {
  const { position, slides, stepCount } = deck;
  const hidden = slides.map((slide) => slide.hidden);
  if (
    neighbourShownSlide(hidden, position.slide, 'forward') !== undefined ||
    stepCount === undefined
  ) {
    return false;
  }

  return position.step >= stepCount - 1;
}

/**
 * Props of {@link Chevron}.
 */
type ChevronProps = {
  /**
   * The polyline's points in a 16x16 box.
   */
  points: string;
};

/**
 * A chevron icon drawn in the current text colour, hidden from assistive technology because its
 * button carries the label.
 */
function Chevron({ points }: ChevronProps): ReactNode {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * An "open in new window" icon drawn in the current text colour, hidden from assistive technology
 * because its link carries the text.
 */
function OpenIcon(): ReactNode {
  return (
    <svg
      className="deck-embed-open-icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false">
      <path
        d="M9 3h4v4M13 3 7.5 8.5M11.5 9.5V13h-8.5V4.5H6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
