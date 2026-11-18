import { useDeck, SlideView, type DeckControls } from '@deckster/engine';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from 'react';

import { postReorder } from '#sidebar/post-reorder.ts';
import { dropIndex, moveItem } from '#sidebar/reorder-move.ts';
import { SlideChips } from '#sidebar/slide-meta.tsx';
import { scrollToRow, visibleRows } from '#sidebar/virtual-range.ts';
import { setSidebarOpen, useUiState } from '#ui/ui-state.ts';

/**
 * The height of one sidebar row: the thumbnail at the sidebar's width, its caption and spacing.
 */
const ROW_HEIGHT_PX = 166;

/**
 * How many rows beyond the visible ones stay mounted on each side.
 */
const OVERSCAN_ROWS = 2;

/**
 * Whether drag-to-reorder is on. Only the dev server has the endpoint that rewrites the manifest,
 * and Vite replaces this constant, so a production build carries no drag code paths.
 */
const CAN_REORDER = import.meta.env.DEV;

/**
 * Where a dragged slide would land.
 */
type DropTarget = {
  /**
   * The row the pointer is over.
   */
  row: number;

  /**
   * Whether it lands after that row instead of before it.
   */
  after: boolean;
};

/**
 * The slide sidebar: a filmstrip docked at the left of the window, shown while the user has it
 * open. Only the rows in view are mounted, so a 100-slide deck stays smooth.
 */
export function Sidebar(): ReactNode {
  const { sidebarOpen } = useUiState();
  return sidebarOpen ? <SidebarPanel /> : null;
}

/**
 * The open sidebar.
 */
function SidebarPanel(): ReactNode {
  const deck = useDeck();
  const listRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ scrollTop: 0, height: 0 });
  const [dragging, setDragging] = useState<number | undefined>(undefined);
  const [target, setTarget] = useState<DropTarget | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const current = deck.position.slide;
  const count = deck.slides.length;
  const range = visibleRows({
    scrollTop: view.scrollTop,
    viewportHeight: view.height,
    rowHeight: ROW_HEIGHT_PX,
    count,
    overscan: OVERSCAN_ROWS,
  });

  useLayoutEffect(() => {
    const list = listRef.current;
    if (list === null) {
      return undefined;
    }

    /**
     * Records the list's scroll position and height.
     */
    const measure = () => setView({ scrollTop: list.scrollTop, height: list.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (list === null || list.clientHeight === 0) {
      return;
    }

    list.scrollTop = scrollToRow({
      row: current,
      scrollTop: list.scrollTop,
      viewportHeight: list.clientHeight,
      rowHeight: ROW_HEIGHT_PX,
    });
  }, [current]);

  /**
   * Forgets the drag in progress and the drop indicator.
   */
  const clearDrag = () => {
    setDragging(undefined);
    setTarget(undefined);
  };

  /**
   * Sends the new order to the dev server, which rewrites the manifest and reloads the page.
   */
  const drop = (from: number, over: DropTarget) => {
    if (!CAN_REORDER) {
      return;
    }

    const ids = deck.slides.map((slide) => slide.id);
    const next = moveItem(ids, from, dropIndex({ from, row: over.row, after: over.after }));
    clearDrag();
    if (next === ids) {
      return;
    }

    void postReorder(next).then(setProblem);
  };

  return (
    <aside className="dp-ui dp-sidebar" data-deck-interactive="" aria-label="Slides">
      <SidebarHeader count={count} />
      <div
        ref={listRef}
        className="dp-list"
        role="listbox"
        aria-label="Slides"
        onScroll={(event) =>
          setView({
            scrollTop: event.currentTarget.scrollTop,
            height: event.currentTarget.clientHeight,
          })
        }>
        <div className="dp-list-spacer" style={{ height: count * ROW_HEIGHT_PX }}>
          {deck.slides.slice(range.start, range.end).map((slide) => (
            <SidebarRow
              key={slide.id}
              deck={deck}
              index={slide.index}
              isCurrent={slide.index === current}
              isDragging={dragging === slide.index}
              drop={target?.row === slide.index ? target : undefined}
              onDragStart={() => setDragging(slide.index)}
              onDragOver={setTarget}
              onDrop={(over) => dragging !== undefined && drop(dragging, over)}
              onDragEnd={clearDrag}
            />
          ))}
        </div>
      </div>
      {problem === undefined ? null : (
        <ReorderProblem message={problem} onDismiss={() => setProblem(undefined)} />
      )}
    </aside>
  );
}

/**
 * The sidebar's title bar: the slide count and the button that closes the sidebar.
 */
function SidebarHeader({ count }: SidebarHeaderProps): ReactNode {
  return (
    <div className="dp-sidebar-head">
      <span className="dp-sidebar-title">Slides</span>
      <span className="dp-sidebar-count dp-chip">{count}</span>
      <button
        type="button"
        className="dp-button"
        data-variant="icon"
        aria-label="Close sidebar"
        title="Close (S)"
        onClick={() => setSidebarOpen(false)}>
        ×
      </button>
    </div>
  );
}

/**
 * Props of {@link SidebarHeader}.
 */
type SidebarHeaderProps = {
  /**
   * How many slides the deck has.
   */
  count: number;
};

/**
 * Props of {@link ReorderProblem}.
 */
type ReorderProblemProps = {
  /**
   * What went wrong, as the dev server reported it.
   */
  message: string;

  /**
   * Hides the notice.
   */
  onDismiss: () => void;
};

/**
 * The notice under the list when the dev server did not save a new order.
 */
function ReorderProblem({ message, onDismiss }: ReorderProblemProps): ReactNode {
  return (
    <div className="dp-sidebar-note" role="alert" data-testid="reorder-problem">
      <span>{message}</span>
      <button
        type="button"
        className="dp-button"
        data-variant="icon"
        aria-label="Dismiss"
        onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}

/**
 * Which edge of a row the drop indicator sits on.
 *
 * @param drop - Where the dragged slide would land relative to the row, if the pointer is over it.
 */
function dropEdge(drop: DropTarget | undefined): 'before' | 'after' | undefined {
  if (drop === undefined) {
    return undefined;
  }

  return drop.after ? 'after' : 'before';
}

/**
 * Props of {@link SidebarRow}.
 */
type SidebarRowProps = {
  /**
   * The deck.
   */
  deck: DeckControls;

  /**
   * The slide's zero-based index.
   */
  index: number;

  /**
   * Whether the slide is on screen.
   */
  isCurrent: boolean;

  /**
   * Whether the row is the one being dragged.
   */
  isDragging: boolean;

  /**
   * Where the dragged slide would land relative to this row, when the pointer is over it.
   */
  drop: DropTarget | undefined;

  /**
   * Called when a drag starts on this row.
   */
  onDragStart: () => void;

  /**
   * Called as a drag moves over this row.
   */
  onDragOver: (target: DropTarget) => void;

  /**
   * Called when a drag is dropped on this row.
   */
  onDrop: (target: DropTarget) => void;

  /**
   * Called when a drag ends anywhere.
   */
  onDragEnd: () => void;
};

/**
 * One slide in the sidebar: its live thumbnail, number, title and chips. Clicking, Enter or Space
 * jumps to it; in development it can be dragged to a new place.
 */
function SidebarRow(props: SidebarRowProps): ReactNode {
  const { deck, index, isCurrent, isDragging, drop, onDragStart, onDragOver, onDrop, onDragEnd } =
    props;
  const slide = deck.slides[index];
  if (slide === undefined) {
    return null;
  }

  /**
   * Whether the pointer is over the lower half of the row.
   */
  const isLowerHalf = (event: ReactDragEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return event.clientY > box.top + box.height / 2;
  };

  return (
    <div
      className="dp-row"
      role="option"
      tabIndex={0}
      aria-selected={isCurrent}
      aria-label={`Slide ${index + 1}: ${slide.title}`}
      data-slide-index={index}
      data-hidden={slide.hidden ? '' : undefined}
      data-dragging={isDragging}
      data-drop={dropEdge(drop)}
      draggable={CAN_REORDER}
      style={{ top: index * ROW_HEIGHT_PX, height: ROW_HEIGHT_PX }}
      onClick={() => deck.goto(index)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          deck.goto(index);
        }
      }}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', slide.id);
        onDragStart();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver({ row: index, after: isLowerHalf(event) });
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop({ row: index, after: isLowerHalf(event) });
      }}
      onDragEnd={onDragEnd}>
      <div className="dp-thumb">
        <SlideView slide={index} step="last" />
      </div>
      <div className="dp-row-meta">
        <span className="dp-row-index">{index + 1}</span>
        <span className="dp-row-title" title={slide.title}>
          {slide.title}
        </span>
        <SlideChips slide={slide} />
      </div>
    </div>
  );
}
