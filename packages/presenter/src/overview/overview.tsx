import { SlideView, useDeck, type SlideSummary } from '@deckster/engine';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

import { SlideChips } from '#sidebar/slide-meta.tsx';
import { updateUi, useUiState } from '#ui/ui-state.ts';
import { useModalFocus } from '#ui/use-modal-focus.ts';

/**
 * How far outside the viewport a thumbnail starts rendering, so scrolling shows no blank cells.
 */
const NEAR_VIEWPORT_MARGIN = '600px 0px';

/**
 * The overview grid: every slide as a live thumbnail. Arrow keys move the selection (and focus),
 * Enter, Space or a click opens it, Escape closes the overview. It is modal: focus moves into it
 * and back out when it closes, and navigation keys do nothing behind it.
 */
export function Overview(): ReactNode {
  const { overviewOpen } = useUiState();
  return overviewOpen ? <OverviewGrid /> : null;
}

/**
 * The open overview.
 */
function OverviewGrid(): ReactNode {
  const deck = useDeck();
  const { overviewSelected } = useUiState();
  const gridRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDialogElement>(null);
  useModalFocus(panelRef, (panel) =>
    panel.querySelector<HTMLElement>(`[data-slide-index="${overviewSelected}"]`),
  );

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (grid === null) {
      return undefined;
    }

    /**
     * Tells the keyboard handler how many thumbnails fit in a row.
     */
    const measure = () => {
      const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
      updateUi({ overviewColumns: columns });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const cell = gridRef.current?.querySelector<HTMLElement>(
      `[data-slide-index="${overviewSelected}"]`,
    );
    cell?.scrollIntoView({ block: 'nearest' });
    if (cell !== undefined && cell !== null && gridRef.current?.contains(document.activeElement)) {
      cell.focus({ preventScroll: true });
    }
  }, [overviewSelected]);

  /**
   * Opens a slide and closes the overview.
   */
  const pick = (index: number) => {
    updateUi({ overviewOpen: false });
    deck.goto(index);
  };

  return (
    <dialog
      ref={panelRef}
      open
      className="dp-ui dp-overview"
      data-deck-interactive=""
      aria-modal="true"
      aria-label="Slide overview">
      <div className="dp-overview-head">
        <span className="dp-overview-title">Overview</span>
        <OverviewHint />
        <button
          type="button"
          className="dp-button"
          data-variant="icon"
          aria-label="Close overview"
          onClick={() => updateUi({ overviewOpen: false })}>
          ×
        </button>
      </div>
      <div ref={gridRef} className="dp-grid" role="listbox" aria-label="Slides">
        {deck.slides.map((slide) => (
          <OverviewCell
            key={slide.id}
            slide={slide}
            isSelected={slide.index === overviewSelected}
            onPick={pick}
          />
        ))}
      </div>
    </dialog>
  );
}

/**
 * The keys the overview answers, shown in its header.
 */
function OverviewHint(): ReactNode {
  return (
    <span className="dp-overview-hint">
      <kbd>←</kbd>
      <kbd>→</kbd>
      <kbd>↑</kbd>
      <kbd>↓</kbd> move <kbd>Enter</kbd> open <kbd>Esc</kbd> close
    </span>
  );
}

/**
 * Props of {@link OverviewCell}.
 */
type OverviewCellProps = {
  /**
   * The slide the cell shows.
   */
  slide: SlideSummary;

  /**
   * Whether the overview has this slide selected.
   */
  isSelected: boolean;

  /**
   * Opens the slide with its zero-based index.
   */
  onPick: (index: number) => void;
};

/**
 * One slide in the overview grid: its live thumbnail, number, title and chips. Enter, Space or a
 * click opens it.
 */
function OverviewCell({ slide, isSelected, onPick }: OverviewCellProps): ReactNode {
  return (
    <div
      className="dp-cell"
      role="option"
      tabIndex={0}
      aria-selected={isSelected}
      aria-label={`Slide ${slide.index + 1}: ${slide.title}`}
      data-slide-index={slide.index}
      data-hidden={slide.hidden ? '' : undefined}
      onClick={() => onPick(slide.index)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onPick(slide.index);
        }
      }}>
      <LazyThumb index={slide.index} />
      <div className="dp-cell-meta">
        <span className="dp-cell-index">{slide.index + 1}</span>
        <span className="dp-cell-title" title={slide.title}>
          {slide.title}
        </span>
        <SlideChips slide={slide} />
      </div>
    </div>
  );
}

/**
 * Props of {@link LazyThumb}.
 */
type LazyThumbProps = {
  /**
   * The slide's zero-based index.
   */
  index: number;
};

/**
 * A thumbnail that renders its slide only while it is near the viewport, so an overview of 100
 * slides mounts a screenful at a time.
 */
function LazyThumb({ index }: LazyThumbProps): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const isNear = useIsNearViewport(ref);
  return (
    <div ref={ref} className="dp-thumb">
      {isNear ? <SlideView slide={index} step="last" /> : null}
    </div>
  );
}

/**
 * Whether an element is within {@link NEAR_VIEWPORT_MARGIN} of its scroll container's viewport.
 *
 * @param ref - The element.
 */
function useIsNearViewport(ref: RefObject<HTMLElement | null>): boolean {
  const [isNear, setIsNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => setIsNear(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: NEAR_VIEWPORT_MARGIN },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return isNear;
}
