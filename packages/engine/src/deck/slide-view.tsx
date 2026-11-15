import { memo, useMemo, type ReactNode } from 'react';

import { Canvas } from '#canvas/canvas.tsx';
import { useDeckRuntime } from '#deck/deck-runtime.ts';
import { SlideFrame } from '#deck/slide-frame.tsx';
import { resolveSlideIndex } from '#deck/slide-summary.ts';
import { UNRESOLVED_LAST_STEP } from '#navigation/navigation.ts';

/**
 * Props of {@link SlideView}.
 */
export type SlideViewProps = {
  /**
   * The slide to show, by zero-based index or id.
   */
  slide: number | string;

  /**
   * The deck step to show (default 0), clamped to the slide's last step; `last` shows the slide
   * with every step revealed.
   */
  step?: number | 'last';

  /**
   * Whether the copy is inert: hidden from assistive technology, not focusable, and reported to its
   * components as not on screen (`useSlide().isActive` is `false`), so media and mini apps do not
   * start in a thumbnail. Defaults to `true`; pass `false` for a pane that should behave like the
   * slide on screen, which then also reports the slide's step count to the deck.
   */
  inactive?: boolean;

  /**
   * A class for the view's root element, which fills its container.
   */
  className?: string;
};

/**
 * Renders one slide of the deck anywhere inside `<Deck>`: a sidebar thumbnail, an overview grid,
 * the presenter's next-slide pane. It uses the deck's layouts, components and brand, keeps its own
 * step registry and scales the 1920x1080 canvas to fit its container, which the caller sizes (for
 * example `width: 320px; aspect-ratio: 16 / 9`). An inert view (the default) never changes the
 * deck's step count for its slide: it may show the slide differently from the stage (an app's
 * poster instead of the running app), and a view that switches slides must not report for the one
 * it leaves. A view with `inactive={false}` stands for the slide on screen (the presenter window's
 * current pane) and reports its step count like the stage does. Each slide gets a fresh frame and
 * step registry, so a view that switches slides starts clean.
 *
 * It re-renders only when its own props or the deck's plugins change, not when the deck moves, so a
 * sidebar of twenty views stays cheap. Chrome (page numbers, logo) is not drawn.
 *
 * @throws RangeError when `slide` names no slide of the deck; Error outside `<Deck>`.
 */
export const SlideView = memo(function SlideView({
  slide,
  step = 0,
  inactive = true,
  className,
}: SlideViewProps): ReactNode {
  const { manifest } = useDeckRuntime('<SlideView>');
  const slideIds = useMemo(() => manifest.slides.map((entry) => entry.id), [manifest]);
  const index = resolveSlideIndex(slideIds, slide);
  const entry = manifest.slides[index];
  if (entry === undefined) {
    return null;
  }

  const rootClass = className === undefined ? 'deck-slide-view' : `deck-slide-view ${className}`;
  return (
    <div className={rootClass} data-brand={manifest.brand}>
      <Canvas>
        <SlideFrame
          key={entry.id}
          entry={entry}
          index={index}
          step={step === 'last' ? UNRESOLVED_LAST_STEP : step}
          isActive={!inactive}
          state={undefined}
          direction="none"
          reportsSteps={!inactive}
        />
      </Canvas>
    </div>
  );
});
