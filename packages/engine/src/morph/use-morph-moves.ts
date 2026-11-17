import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type Dispatch,
  type RefObject,
} from 'react';
import { flushSync } from 'react-dom';

import {
  clearArrivals,
  morphNames,
  nameIncoming,
  nameOutgoing,
  clearMorphs,
  shownMorphs,
  stageSlide,
  type NamedMorphs,
} from '#morph/morph-elements.ts';
import { navigate, type NavigationAction, type NavigationState } from '#navigation/navigation.ts';

/**
 * The media query of viewers who ask for less motion; they get the plain slide transition.
 */
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * A view transition scoped to one element: `Element.startViewTransition`, which TypeScript's DOM
 * types do not describe yet. Chromium has it from version 140.
 */
type ScopedViewTransitionHost = {
  /**
   * Starts a view transition over the element's subtree.
   */
  startViewTransition: (update: () => void) => ViewTransition;
};

/**
 * A morph on its way: started, and waiting for its update to run or for its animation to end.
 */
type ActiveMorph = {
  /**
   * Whether the moves have been applied; until then more moves join {@link ActiveMorph.actions}.
   */
  applied: boolean;

  /**
   * The moves the morph applies, in order: the one that started it and any made before it ran.
   */
  actions: NavigationAction[];

  /**
   * The elements that carry the morph's transition names.
   */
  named: NamedMorphs;

  /**
   * The view transition, once started.
   */
  transition: ViewTransition | undefined;
};

/**
 * What {@link useMorphMoves} needs from the deck.
 */
export type MorphMovesOptions = {
  /**
   * Applies a navigation action.
   */
  dispatch: Dispatch<NavigationAction>;

  /**
   * The navigation state, to tell where a move goes before applying it.
   */
  state: NavigationState;

  /**
   * The deck's root element, which holds the canvas.
   */
  rootRef: RefObject<HTMLElement | null>;

  /**
   * Whether the deck runs in static mode, where nothing morphs.
   */
  isStatic: boolean;
};

/**
 * The deck's moves with morphs, and a way to finish a morph at once.
 */
export type MorphMoves = {
  /**
   * Applies a navigation action, as a morph when it moves to a neighbouring slide that shows an
   * element named like one on the slide on screen. A morph applies the move one frame later, inside
   * a view transition; a move made before then joins it.
   */
  move: Dispatch<NavigationAction>;

  /**
   * Finishes the morph on its way, if any: applies its moves now and ends its animation, so the
   * next move starts from where the deck really is.
   */
  settle: () => void;
};

/**
 * Moves the deck with morphs. Between two neighbouring slides, elements marked with the same
 * `data-morph` name on both fly from their place on the outgoing slide to their place on the
 * incoming one, while the slides run their own transition underneath. It uses a view transition
 * scoped to the canvas, so presenter panes and thumbnails outside it never take part, and names
 * only the one shown copy on each side while the old and the new state are captured.
 *
 * Nothing morphs in static mode, for viewers who ask for reduced motion, in a browser without
 * scoped view transitions, on a jump past a neighbour or a move between steps: those moves are
 * dispatched as they are. A move made while a morph is animating ends that animation first.
 *
 * @param options - The dispatcher, the state, the deck's root and whether it is static.
 * @returns `move`, for keys, clicks and the deck's controls, and `settle`, for moves that must
 *   apply at once (`window.__deck`).
 */
export function useMorphMoves(options: MorphMovesOptions): MorphMoves {
  const { dispatch, state, rootRef, isStatic } = options;
  const active = useRef<ActiveMorph | undefined>(undefined);
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);
  // Runs after every move between slides, before the morph that made it names its new elements.
  useLayoutEffect(() => {
    const canvas = stageCanvas(rootRef.current);
    if (canvas !== undefined) {
      clearArrivals(canvas);
    }
  }, [rootRef, state.position.slide]);
  const settle = useCallback(() => {
    const morph = active.current;
    if (morph === undefined) {
      return;
    }

    active.current = undefined;
    if (!morph.applied) {
      morph.applied = true;
      flushSync(() => applyAll(dispatch, morph.actions));
    }

    morph.transition?.skipTransition();
    clearMorphs(morph.named);
  }, [dispatch]);
  const move = useCallback(
    (action: NavigationAction) => {
      const pending = active.current;
      if (pending !== undefined && !pending.applied) {
        pending.actions.push(action);
        return;
      }

      settle();
      const canvas = morphCanvas(rootRef.current, isStatic);
      const outgoing = canvas === undefined ? undefined : outgoingMorphs(canvas, stateRef, action);
      if (canvas === undefined || outgoing === undefined) {
        dispatch(action);
        return;
      }

      active.current = startMorph({ canvas, outgoing, action, dispatch, active });
    },
    [dispatch, isStatic, rootRef, settle, stateRef],
  );
  return useMemo(() => ({ move, settle }), [move, settle]);
}

/**
 * What {@link startMorph} needs.
 */
type StartMorphInput = {
  /**
   * The canvas the view transition is scoped to.
   */
  canvas: HTMLElement & ScopedViewTransitionHost;

  /**
   * Each morph name's element on the slide on screen.
   */
  outgoing: ReadonlyMap<string, HTMLElement>;

  /**
   * The move that starts the morph.
   */
  action: NavigationAction;

  /**
   * Applies navigation actions.
   */
  dispatch: Dispatch<NavigationAction>;

  /**
   * Where the deck keeps the morph on its way, cleared when this one ends.
   */
  active: RefObject<ActiveMorph | undefined>;
};

/**
 * Names the outgoing elements and starts the view transition, whose update applies the moves
 * synchronously and names the incoming elements.
 *
 * @param input - The canvas, the outgoing elements, the move and the dispatcher.
 * @returns The morph, to keep as the one on its way.
 */
function startMorph(input: StartMorphInput): ActiveMorph {
  const { canvas, outgoing, action, dispatch, active } = input;
  const morph: ActiveMorph = {
    applied: false,
    actions: [action],
    named: nameOutgoing(outgoing),
    transition: undefined,
  };
  const transition = canvas.startViewTransition(() => {
    if (morph.applied) {
      return;
    }

    morph.applied = true;
    flushSync(() => applyAll(dispatch, morph.actions));
    nameIncoming(
      morph.named,
      canvas.querySelector(':scope > [data-slide-state="current"]') ?? undefined,
    );
  });
  morph.transition = transition;
  // A skipped transition rejects `ready`; the moves still apply, so there is nothing to report.
  transition.ready.catch(ignore);
  transition.finished.then(
    () => endMorph(active, morph),
    () => endMorph(active, morph),
  );
  return morph;
}

/**
 * Clears a morph's names once its animation has ended, and forgets it unless a later one has taken
 * its place.
 *
 * @param active - Where the deck keeps the morph on its way.
 * @param morph - The morph that ended.
 */
function endMorph(active: RefObject<ActiveMorph | undefined>, morph: ActiveMorph): void {
  if (active.current === morph) {
    active.current = undefined;
  }

  clearMorphs(morph.named);
}

/**
 * The canvas to scope a morph to, when one can play: not in static mode, not for reduced motion,
 * and only where the browser has scoped view transitions.
 *
 * @param root - The deck's root element.
 * @param isStatic - Whether the deck runs in static mode.
 */
function morphCanvas(
  root: HTMLElement | null,
  isStatic: boolean,
): (HTMLElement & ScopedViewTransitionHost) | undefined {
  if (isStatic || root === null || prefersReducedMotion()) {
    return undefined;
  }

  const canvas = stageCanvas(root);
  if (canvas === undefined || !hasScopedViewTransitions(canvas)) {
    return undefined;
  }

  return canvas;
}

/**
 * The stage's canvas: the one that holds the stage slides, since a `SlideView` has a canvas of its
 * own.
 *
 * @param root - The deck's root element.
 */
function stageCanvas(root: HTMLElement | null): HTMLElement | undefined {
  return root?.querySelector('.deck-slide[data-slide-state]')?.parentElement ?? undefined;
}

/**
 * The elements on the slide on screen that would morph on this move: the shown ones whose name the
 * neighbouring slide the move goes to also has. `undefined` when the move does not go to a
 * neighbour or no name is shared.
 *
 * @param canvas - The deck's canvas.
 * @param stateRef - The navigation state of the last commit.
 * @param action - The move.
 */
function outgoingMorphs(
  canvas: HTMLElement,
  stateRef: RefObject<NavigationState>,
  action: NavigationAction,
): ReadonlyMap<string, HTMLElement> | undefined {
  const state = stateRef.current;
  const from = state.position.slide;
  const to = navigate(state, action).position.slide;
  const outgoingSlide = stageSlide(canvas, from);
  const incomingSlide = stageSlide(canvas, to);
  if (Math.abs(to - from) !== 1 || outgoingSlide === undefined || incomingSlide === undefined) {
    return undefined;
  }

  const outgoing = shownMorphs(outgoingSlide, morphNames(incomingSlide));
  return outgoing.size === 0 ? undefined : outgoing;
}

/**
 * Applies navigation actions in order.
 *
 * @param dispatch - The deck's navigation dispatcher, which applies each action.
 * @param actions - The moves to apply, oldest first.
 */
function applyAll(
  dispatch: Dispatch<NavigationAction>,
  actions: readonly NavigationAction[],
): void {
  for (const action of actions) {
    dispatch(action);
  }
}

/**
 * Whether the viewer asks for reduced motion.
 */
function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Whether an element can host a view transition scoped to it.
 *
 * @param element - The element to test for `startViewTransition`, which a scoped transition needs.
 */
function hasScopedViewTransitions(
  element: HTMLElement,
): element is HTMLElement & ScopedViewTransitionHost {
  return 'startViewTransition' in element && typeof element.startViewTransition === 'function';
}

/**
 * Does nothing; for promise rejections that need no handling.
 */
function ignore(): void {}
