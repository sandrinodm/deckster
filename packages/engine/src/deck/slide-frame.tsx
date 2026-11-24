import {
  memo,
  Suspense,
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import type { SlideEntry } from '#contract/manifest.ts';
import type { TransitionKind } from '#contract/transition.ts';
import type { Direction } from '#navigation/navigation.ts';

import { DEFAULT_SURFACE } from '#contract/slide-defaults.ts';
import { useDeckRuntime } from '#deck/deck-runtime.ts';
import { SlideContent } from '#deck/slide-content.tsx';
import { SlideErrorBoundary } from '#deck/slide-error-boundary.tsx';
import { useReadyHold } from '#readiness/use-ready-hold.ts';
import { SlideContext, type SlideContextValue, type SlideState } from '#steps/slide-context.ts';
import { createStepRegistry } from '#steps/step-registry.ts';

/**
 * Props of {@link SlideFrame}.
 */
type SlideFrameProps = {
  /**
   * The slide to mount.
   */
  entry: SlideEntry;

  /**
   * The slide's zero-based position in the deck.
   */
  index: number;

  /**
   * The deck step the slide shows; may exceed its last step, which it then shows.
   */
  step: number;

  /**
   * Whether the slide behaves as the one on screen; inactive slides are hidden from assistive
   * technology and inert.
   */
  isActive: boolean;

  /**
   * Where a slide on the deck's stage stands relative to the one on screen; `undefined` for a copy
   * in a `SlideView`, which the navigation, `ready()` and tooling ignore.
   */
  state: SlideState | undefined;

  /**
   * Which way the deck moved last; `none` in a `SlideView`.
   */
  direction: Direction;

  /**
   * The slide transition this stage slide moves with, from `stageTransition`. `undefined` leaves it
   * to the brand's transition; a `SlideView` and static mode never pass one.
   */
  transition?: TransitionKind | undefined;

  /**
   * Whether this copy tells the deck how many steps the slide has: slides on the stage and
   * non-inert `SlideView`s do, inert views (thumbnails, previews) never do, so a copy that shows
   * the slide differently (an app's poster instead of the running app) cannot change the count.
   */
  reportsSteps: boolean;
};

/**
 * One mounted slide: its own step registry, its layout and its content. When `reportsSteps` is set
 * it reports the slide's step count to the deck once the content has committed (not while it
 * suspends, and never while it unmounts), and again whenever steps mount or unmount or its
 * readiness holds change: the count is final once nothing holds the slide, so a step the deck was
 * sent to before a lazy part registered it lands then. It holds the deck's `ready()` while its
 * content suspends and shows a render error in place of the slide. The section is stamped with
 * `data-deck-layout`, the layout name the slide's frontmatter gives, which export reads.
 */
export const SlideFrame = memo(function SlideFrame({
  entry,
  index,
  step,
  isActive,
  state,
  direction,
  transition,
  reportsSteps,
}: SlideFrameProps): ReactNode {
  const { reportStepCount, readiness } = useDeckRuntime('A slide');
  const [registry] = useState(createStepRegistry);
  const [steps, setSteps] = useState(registry.getSteps);
  const [settled, setSettled] = useState(false);
  const held = useSyncExternalStore(
    readiness.subscribe,
    () => readiness.heldSlides([index]).length > 0,
  );
  const { frontmatter, title } = entry.module.slideMeta;

  // Runs after the children's layout effects, so the first read already counts every step. On
  // unmount it unsubscribes before the children unregister their steps, so a slide that leaves
  // never shrinks its own count on the way out.
  useLayoutEffect(() => {
    /**
     * Publishes the registered steps to the slide.
     */
    const update = () => setSteps(registry.getSteps());
    update();
    return registry.subscribe(update);
  }, [registry]);

  // Reports after the commit that changed the steps or the holds, so a burst of registrations is
  // one report. The holds are read now rather than from `held`: a child's hold placed in this
  // commit's layout effects is not in the snapshot this render read.
  useLayoutEffect(() => {
    if (reportsSteps && settled) {
      reportStepCount(index, steps.length + 1, readiness.heldSlides([index]).length === 0);
    }
  }, [reportsSteps, settled, steps, held, index, reportStepCount, readiness]);

  const holdReady = useCallback(() => readiness.hold(index), [readiness, index]);
  const slide = useMemo<SlideContextValue>(
    () => ({
      index,
      id: entry.id,
      file: entry.file,
      frontmatter,
      isActive,
      state,
      direction,
      step,
      steps,
      registry,
      holdReady,
    }),
    [index, entry, frontmatter, isActive, state, direction, step, steps, registry, holdReady],
  );
  return (
    <section
      className="deck-slide"
      aria-label={title}
      aria-hidden={!isActive}
      inert={!isActive}
      data-slide-id={entry.id}
      data-slide-index={index}
      {...placementAttributes(state, direction, isActive)}
      data-transition={state === undefined ? undefined : transition}
      data-surface={frontmatter.surface ?? DEFAULT_SURFACE}
      data-deck-layout={frontmatter.layout}>
      <SlideContext value={slide}>
        <SlideErrorBoundary
          file={entry.file}
          resetKey={entry.module}
          settled={<Settled onChange={setSettled} />}>
          <Suspense fallback={<HeldWhileSuspended />}>
            <SlideContent entry={entry} />
            <Settled onChange={setSettled} />
          </Suspense>
        </SlideErrorBoundary>
      </SlideContext>
    </section>
  );
});

/**
 * The data attributes that say where a slide is mounted. Stage slides carry `data-slide-active`,
 * `data-slide-state` (`past`, `current`, `future`) and `data-direction` for transitions (and
 * `data-transition` when the move names its own); `SlideView` copies carry `data-slide-view`
 * instead, so tools that look for the slide on screen never pick a thumbnail.
 *
 * @param state - The stage slide's state, or `undefined` in a `SlideView`.
 * @param direction - Which way the deck moved last.
 * @param isActive - Whether the slide behaves as the one on screen.
 */
function placementAttributes(
  state: SlideState | undefined,
  direction: Direction,
  isActive: boolean,
): Record<string, string> {
  if (state === undefined) {
    return { 'data-slide-view': 'true' };
  }

  return {
    'data-slide-active': String(isActive),
    'data-slide-state': state,
    'data-direction': direction,
  };
}

/**
 * Marks the slide's content (or the error shown in its place) as committed for as long as it is
 * mounted. It renders after the content, so its layout effect runs after every step inside it has
 * registered; while the content suspends it is not mounted, so a half-loaded slide reports no step
 * count.
 */
function Settled({ onChange }: { onChange: (settled: boolean) => void }): null {
  useLayoutEffect(() => {
    onChange(true);
    return () => onChange(false);
  }, [onChange]);
  return null;
}

/**
 * The fallback while a slide's content suspends: nothing on screen, and a hold on `ready()`.
 */
function HeldWhileSuspended(): null {
  useReadyHold(true);
  return null;
}
