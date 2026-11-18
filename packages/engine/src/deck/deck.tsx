import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';

import type { DeckManifest } from '#contract/manifest.ts';
import type { DeckPlugin } from '#plugins/deck-plugin.ts';
import type { SlideState } from '#steps/slide-context.ts';

import { Canvas } from '#canvas/canvas.tsx';
import { DeckContext, type DeckControls, type MoveActions } from '#deck/deck-context.ts';
import { DeckRuntimeContext, type DeckRuntimeValue } from '#deck/deck-runtime.ts';
import { SlideFrame } from '#deck/slide-frame.tsx';
import { resolveSlideIndex, summarizeSlides } from '#deck/slide-summary.ts';
import { stageTransition } from '#deck/stage-transitions.ts';
import { useHashSync } from '#deck/use-hash-sync.ts';
import { useKeyboardNavigation } from '#deck/use-keyboard-navigation.ts';
import { usePointerNavigation } from '#deck/use-pointer-navigation.ts';
import { EmbedControls } from '#embed/embed-controls.tsx';
import { embedPlugins } from '#embed/embed-plugins.ts';
import { useMorphMoves } from '#morph/use-morph-moves.ts';
import { parseHash } from '#navigation/hash.ts';
import {
  createNavigationState,
  currentPosition,
  isStepPending,
  navigate,
  UNRESOLVED_LAST_STEP,
  type NavigationAction,
  type NavigationState,
  type Position,
} from '#navigation/navigation.ts';
import { hiddenSlides, neighbourShownSlide } from '#navigation/shown-slides.ts';
import { composePlugins, type DeckRuntime } from '#plugins/compose-plugins.ts';
import { createReadinessRegistry } from '#readiness/readiness-registry.ts';
import { useDeckApi } from '#runtime/deck-api.ts';
import { StaticModeContext } from '#static/static-mode.ts';
import '#deck/deck.css';

/**
 * How many slides on each side of the current one stay mounted outside static mode.
 */
const MOUNTED_NEIGHBOURS = 1;

/**
 * The plugin list when none are passed, kept stable so the composed runtime is not rebuilt on every
 * render.
 */
const NO_PLUGINS: readonly DeckPlugin[] = [];

/**
 * Props for {@link Deck}.
 */
export type DeckProps = {
  /**
   * The deck to render, usually the default export of `virtual:deck`.
   */
  manifest: DeckManifest;

  /**
   * Layouts, components, chrome, overlays and key handlers, merged in order.
   */
  plugins?: readonly DeckPlugin[];

  /**
   * Static mode: every slide mounts and motion primitives render their end state.
   */
  isStatic?: boolean;

  /**
   * Embed mode, for a deck in an iframe: plugins keep only their slide parts (no stage wrappers,
   * overlays, or key and click handlers, so no presenter tools), and a small previous/next control
   * with a link to the whole deck is shown instead.
   */
  isEmbed?: boolean;
};

/**
 * Renders a deck full-window: the scaled canvas with the current slide and its neighbours mounted,
 * plugin chrome and overlays, mouse navigation on the stage (left click forward, right click back,
 * unless the deck config turns it off), and the window-level parts only one deck per page can own:
 * keyboard navigation, the `#/<slide>/<step>` URL hash and `window.__deck`. In static mode every
 * slide mounts, so step counts are known for all of them once `window.__deck.ready()` resolves. To
 * show a slide anywhere else (a thumbnail, the presenter's next slide), render a `SlideView` inside
 * it.
 */
export function Deck({
  manifest,
  plugins = NO_PLUGINS,
  isStatic = false,
  isEmbed = false,
}: DeckProps): ReactNode {
  const slideIds = useMemo(() => manifest.slides.map((slide) => slide.id), [manifest]);
  const hidden = useMemo(() => hiddenSlides(manifest), [manifest]);
  const [state, dispatch] = useReducer(navigate, manifest, initialState);
  useEffect(() => {
    dispatch({ type: 'hidden', hidden });
  }, [hidden]);
  const position = useMemo(() => currentPosition(state), [state]);
  const runtime = useMemo(
    () => composePlugins(isEmbed ? embedPlugins(plugins) : plugins),
    [plugins, isEmbed],
  );
  const [readiness] = useState(createReadinessRegistry);
  const reportStepCount = useCallback(
    (slide: number, count: number, final: boolean) =>
      dispatch({ type: 'step-count', slide, count, final }),
    [],
  );
  const deckRuntime = useMemo<DeckRuntimeValue>(
    () => ({ manifest, runtime, isStatic, readiness, reportStepCount }),
    [manifest, runtime, isStatic, readiness, reportStepCount],
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const { move, settle } = useMorphMoves({ dispatch, state, rootRef, isStatic });
  const controls = useDeckControls({ manifest, slideIds, state, position, move, isStatic });
  const immediate = useMemo(() => moveActions(slideIds, dispatch), [slideIds, dispatch]);
  useHashSync(position, slideIds, dispatch);
  useKeyboardNavigation(controls, runtime.keyHandlers, move);
  usePointerNavigation(stageRef, {
    enabled: manifest.mouseNavigation ?? true,
    controls,
    pointerHandlers: runtime.pointerHandlers,
    dispatch: move,
  });
  useDeckApi({
    controls,
    immediate,
    settle,
    rootRef,
    readiness,
    stepPending: isStepPending(state),
  });

  return (
    <StaticModeContext value={isStatic}>
      <DeckRuntimeContext value={deckRuntime}>
        <DeckContext value={controls}>
          <div
            ref={rootRef}
            className="deck-viewport"
            data-brand={manifest.brand}
            data-static={isStatic}
            data-embed={isEmbed}
            data-slide={position.slide}
            data-step={controls.position.step}>
            <div ref={stageRef} className="deck-main">
              {wrapStage(
                runtime.stages,
                <Canvas>
                  <MountedSlides manifest={manifest} state={state} isStatic={isStatic} />
                  {runtime.chrome.map((Chrome, index) => (
                    <Chrome key={index} />
                  ))}
                </Canvas>,
              )}
            </div>
            {runtime.overlays.map((Overlay, index) => (
              <Overlay key={index} />
            ))}
            {isEmbed ? <EmbedControls /> : null}
          </div>
        </DeckContext>
      </DeckRuntimeContext>
    </StaticModeContext>
  );
}

/**
 * Puts the canvas inside the plugins' stage wrappers, the first plugin's outermost.
 *
 * @param stages - The wrappers, outermost first.
 * @param canvas - The scaled canvas with the slides and chrome.
 */
function wrapStage(stages: DeckRuntime['stages'], canvas: ReactNode): ReactNode {
  return stages.reduceRight<ReactNode>(
    (inner, Stage, index) => <Stage key={index}>{inner}</Stage>,
    canvas,
  );
}

/**
 * Props of {@link MountedSlides}.
 */
type MountedSlidesProps = {
  /**
   * The deck whose slides are mounted.
   */
  manifest: DeckManifest;

  /**
   * The navigation state, for the current position and the last move's direction.
   */
  state: NavigationState;

  /**
   * Whether every slide mounts instead of the current one and its neighbours.
   */
  isStatic: boolean;
};

/**
 * The current slide and its neighbours, or every slide in static mode, each with the transition it
 * moves with (none in static mode, where nothing moves).
 */
function MountedSlides({ manifest, state, isStatic }: MountedSlidesProps) {
  const current = state.position.slide;
  const stageInput = {
    current,
    previousSlide: state.previousSlide,
    hidden: state.hidden,
    transitionOf: (index: number) =>
      manifest.slides[index]?.module.slideMeta.frontmatter.transition,
  };
  const mounted = isStatic ? undefined : mountedSlides(state);
  return manifest.slides.map((entry, index) => {
    if (mounted !== undefined && !mounted.has(index)) {
      return null;
    }

    return (
      <SlideFrame
        key={entry.id}
        entry={entry}
        index={index}
        step={frameStep(index, state)}
        isActive={index === current}
        state={slideState(index, current)}
        direction={state.direction}
        transition={isStatic ? undefined : stageTransition(index, stageInput)}
        reportsSteps
      />
    );
  });
}

/**
 * The indexes of the slides that stay mounted outside static mode: the current slide and, on each
 * side, the next {@link MOUNTED_NEIGHBOURS} shown slides, so a hidden slide between two shown ones
 * is not mounted and the neighbour a move lands on always is.
 *
 * @param state - The navigation state.
 */
function mountedSlides(state: NavigationState): ReadonlySet<number> {
  const mounted = new Set([state.position.slide]);
  for (const side of ['backward', 'forward'] as const) {
    let index = state.position.slide;
    for (let count = 0; count < MOUNTED_NEIGHBOURS; count += 1) {
      const neighbour = neighbourShownSlide(state.hidden, index, side);
      if (neighbour === undefined) {
        break;
      }

      mounted.add(neighbour);
      index = neighbour;
    }
  }

  return mounted;
}

/**
 * The navigation state at start-up: the position the URL hash names, else the first shown slide.
 *
 * @param manifest - The deck.
 */
function initialState(manifest: DeckManifest): NavigationState {
  const slideIds = manifest.slides.map((slide) => slide.id);
  return createNavigationState(
    slideIds.length,
    parseHash(window.location.hash, slideIds),
    hiddenSlides(manifest),
  );
}

/**
 * What {@link useDeckControls} builds the controls from.
 */
type DeckControlsInput = {
  /**
   * The deck being shown.
   */
  manifest: DeckManifest;

  /**
   * Slide ids in manifest order, for resolving `goto` by id.
   */
  slideIds: readonly string[];

  /**
   * The navigation state.
   */
  state: NavigationState;

  /**
   * The current position, derived from `state`.
   */
  position: Position;

  /**
   * Sends navigation actions, as morphs where a move between slides has one.
   */
  move: Dispatch<NavigationAction>;

  /**
   * Whether the deck runs in static mode.
   */
  isStatic: boolean;
};

/**
 * The deck's state and controls, memoized so consumers re-render only when something they read
 * changes.
 *
 * @param input - The deck, its navigation state and the moves that change it.
 */
function useDeckControls(input: DeckControlsInput): DeckControls {
  const { manifest, slideIds, state, position, move, isStatic } = input;
  const slides = useMemo(
    () => summarizeSlides(manifest, state.stepCounts),
    [manifest, state.stepCounts],
  );
  const actions = useMemo(() => moveActions(slideIds, move), [slideIds, move]);
  return useMemo(
    () => ({
      manifest,
      slides,
      isStatic,
      stepCount: state.stepCounts[position.slide],
      position: settled(position),
      ...actions,
    }),
    [manifest, slides, isStatic, state.stepCounts, position, actions],
  );
}

/**
 * The deck's moves, sent through `send`: the raw dispatcher for `window.__deck`, which applies them
 * at once, or the morphing one for keys, clicks and the deck's controls.
 *
 * @param slideIds - Slide ids in manifest order, for resolving `goto` by id.
 * @param send - Where the actions go.
 */
function moveActions(slideIds: readonly string[], send: Dispatch<NavigationAction>): MoveActions {
  return {
    next: () => send({ type: 'next' }),
    prev: () => send({ type: 'prev' }),
    first: () => send({ type: 'first' }),
    last: () => send({ type: 'last' }),
    goto: (slide: number | string, step = 0) => {
      const target = { slide: resolveSlideIndex(slideIds, slide), step };
      send({ type: 'goto', position: target });
    },
  };
}

/**
 * The position to report while the slide's step count may still be unknown: the "last step" marker
 * reads as 0 until the slide registers its steps.
 */
function settled(position: Position): Position {
  if (position.step !== UNRESOLVED_LAST_STEP) {
    return position;
  }

  return { slide: position.slide, step: 0 };
}

/**
 * Where a slide on the stage stands relative to the one on screen.
 *
 * @param index - The slide's index.
 * @param current - The index of the slide on screen.
 */
function slideState(index: number, current: number): SlideState {
  if (index === current) {
    return 'current';
  }

  return index < current ? 'past' : 'future';
}

/**
 * The step a mounted slide shows: the current slide shows the deck's step, slides before it show
 * their last step (so going back lands there), and slides after it show step 0.
 */
function frameStep(index: number, state: NavigationState): number {
  const { slide, step } = state.position;
  if (index === slide) {
    return step;
  }

  return index < slide ? UNRESOLVED_LAST_STEP : 0;
}
