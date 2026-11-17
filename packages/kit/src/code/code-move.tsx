import type { KeyedTokensInfo } from '@shikijs/magic-move/types';

import { useReadyHold, useSlide, useStatic, useStep } from '@deckster/engine';
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';

import type { CompactKeyedState } from '#code/keyed-states.ts';
import type { MoveSource } from '#code/move-states.ts';

import { CodeFrame } from '#code/code-frame.tsx';
import { expandKeyed } from '#code/keyed-states.ts';
import { moveAts, moveIndexAt, moveSources } from '#code/move-states.ts';
import { StepMarks } from '#code/step-marks.tsx';
import { PROBE_PROPS, useCodeFit } from '#code/use-code-fit.ts';
import { checkComponentProps } from '#components/check-component-props.ts';

/**
 * The animation, loaded the first time a slide shows a `<CodeMove>`.
 */
const MagicMoveView = lazy(() => import('#code/magic-move-view.tsx'));

/**
 * Props of {@link CodeMove}.
 */
export type CodeMoveProps = {
  /**
   * The states, highlighted at build time as JSON. The build writes it for fenced blocks and
   * literal `<CodeStep>` children; do not set it by hand.
   */
  data?: string;

  /**
   * The states as a list of code strings or `{ code, lang }` objects, for TSX slides. They are
   * highlighted in the browser, which holds the slide's readiness until it is done.
   */
  steps?: readonly (string | MoveSource)[];

  /**
   * The states as `<CodeStep>` elements.
   */
  children?: ReactNode;

  /**
   * The language of every state that does not name its own.
   */
  lang?: string;

  /**
   * The file name in the title bar.
   */
  file?: string;

  /**
   * The language label in the title bar; `false` or an empty string hides it.
   */
  label?: string | false;

  /**
   * The step at which the second state appears; each further state comes one step later. Defaults
   * to 1.
   */
  at?: number;
};

/**
 * Animated transitions between states of the same code. The first state shows on arrival; each step
 * moves to the next, and tokens that stay slide to their new place while new ones fade in. Write
 * the states as fenced blocks inside the tag, or as `<CodeStep>`s:
 *
 * ```mdx
 * <CodeMove file="greet.ts">
 *
 * ```ts
 * const greet = (name) => `Hello ${name}`;
 * ```
 *
 * ```ts
 * const greet = (name: string): string => `Hello ${name}`;
 * ```
 *
 * </CodeMove> ``` The animation and Shiki's tokens for MDX slides are prepared at build time; only
 * the animation code loads in the browser, and only on a slide that uses it. The state shown always
 * follows the slide's step, and there is no motion in static mode.
 */
export function CodeMove(props: CodeMoveProps): ReactNode {
  checkComponentProps('CodeMove', props);
  const sources = useMemo(
    () => moveSources({ steps: props.steps, children: props.children }),
    [props.steps, props.children],
  );
  const states = useMoveStates(props.data, sources, props.lang);
  const ats = moveAts(states?.length ?? sources.length, props.at);
  const lastIndex = Math.max(0, (states?.length ?? 1) - 1);
  const index = Math.min(moveIndexAt(ats, useStep()), lastIndex);
  const areaRef = useRef<HTMLDivElement | null>(null);
  useCodeFit(areaRef);
  const isStatic = useStatic();
  const animate = useMoveAnimation(isStatic);
  const lines = tallestState(states);
  return (
    <CodeFrame
      file={props.file}
      lang={props.lang ?? sharedLang(states)}
      label={props.label}
      kind="move"
      lines={lines}>
      <MoveArea
        areaRef={areaRef}
        states={states}
        index={index}
        lines={lines}
        isStatic={isStatic}
        animate={animate}
      />
      <StepMarks ats={ats} />
    </CodeFrame>
  );
}

/**
 * Props of {@link MoveArea}.
 */
type MoveAreaProps = {
  /**
   * The code area's element, which the fit measures.
   */
  areaRef: RefObject<HTMLDivElement | null>;

  /**
   * The keyed states; `undefined` while the browser is still highlighting them.
   */
  states: KeyedTokensInfo[] | undefined;

  /**
   * The state to show.
   */
  index: number;

  /**
   * The most lines any state has; `undefined` before the states are known.
   */
  lines: number | undefined;

  /**
   * Whether the deck is in static mode.
   */
  isStatic: boolean;

  /**
   * Whether a change of state animates.
   */
  animate: boolean;
};

/**
 * The code area of a `CodeMove`: the animation, or the uncolored code while it loads, and a hidden
 * probe as wide as the widest line so the frame keeps its width as the states change.
 */
function MoveArea({ areaRef, states, index, lines, isStatic, animate }: MoveAreaProps): ReactNode {
  return (
    <div
      ref={areaRef}
      className="kit-code-area"
      data-motion={isStatic ? 'off' : 'on'}
      data-lines={lines}
      style={lines === undefined ? undefined : ({ '--kit-code-lines': lines } as CSSProperties)}>
      <Suspense fallback={<PendingMove code={states?.[index]?.code} />}>
        {states === undefined ? (
          <PendingMove code={undefined} />
        ) : (
          <MagicMoveView states={states} index={index} animate={animate} />
        )}
      </Suspense>
      <span className="kit-code-probe" aria-hidden="true" data-decorative="" {...PROBE_PROPS}>
        {'x'.repeat(widestLine(states))}
      </span>
    </div>
  );
}

/**
 * The keyed states of a `CodeMove`: parsed from the build's data, or highlighted in the browser.
 *
 * @param data - The compiled states as JSON.
 * @param sources - The states to highlight when there is no data.
 * @param lang - The language for sources that name none.
 * @returns The states; `undefined` while the browser is highlighting.
 */
function useMoveStates(
  data: string | undefined,
  sources: readonly MoveSource[],
  lang: string | undefined,
): KeyedTokensInfo[] | undefined {
  const compiled = useMemo(
    () =>
      data === undefined ? undefined : (JSON.parse(data) as CompactKeyedState[]).map(expandKeyed),
    [data],
  );
  const key = JSON.stringify([sources, lang ?? '']);
  const [loaded, setLoaded] = useState<{ key: string; states: KeyedTokensInfo[] }>();
  const needsLoad = compiled === undefined && sources.length > 0;
  useReadyHold(needsLoad && loaded?.key !== key);
  useEffect(() => {
    if (!needsLoad) {
      return undefined;
    }

    let live = true;
    const [wanted, language] = JSON.parse(key) as [MoveSource[], string];
    import('#code/runtime-highlighter.ts')
      .then((module) => module.keyStatesInBrowser(wanted, language === '' ? undefined : language))
      .then((states) => {
        if (live) {
          setLoaded({ key, states });
        }
      })
      .catch((error: unknown) => {
        console.error('Could not highlight <CodeMove>', error);
      });
    return () => {
      live = false;
    };
  }, [needsLoad, key]);
  if (compiled !== undefined) {
    return compiled;
  }

  return loaded?.key === key ? loaded.states : undefined;
}

/**
 * Whether a change of state animates: only while the slide has been on screen for at least one
 * frame, so arriving on a later step (a jump, a reload, the slide entering) shows that state at
 * once instead of replaying the moves during the entrance. Never in static mode, and never when the
 * viewer asked for reduced motion.
 *
 * @param isStatic - Whether the deck is in static mode.
 */
function useMoveAnimation(isStatic: boolean): boolean {
  const { isActive } = useSlide();
  const [settled, setSettled] = useState<boolean | undefined>(undefined);
  const wasActive = settled === true;
  if (settled !== isActive && settled !== undefined && !isActive) {
    setSettled(false);
  }

  useEffect(() => {
    if (isActive) {
      const frame = requestAnimationFrame(() => setSettled(true));
      return () => cancelAnimationFrame(frame);
    }

    return undefined;
  }, [isActive]);
  return !isStatic && isActive && wasActive && !prefersReducedMotion();
}

/**
 * Whether the viewer asked for reduced motion.
 */
function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The language every state is in, for the frame's label; `undefined` when they differ or are not
 * known yet.
 *
 * @param states - The keyed states.
 */
function sharedLang(states: readonly KeyedTokensInfo[] | undefined): string | undefined {
  const langs = new Set((states ?? []).map((state) => state.lang));
  const [only] = langs;
  return langs.size === 1 && only !== undefined && only !== '' ? only : undefined;
}

/**
 * The longest line over every state, in characters.
 *
 * @param states - The keyed states.
 */
function widestLine(states: readonly KeyedTokensInfo[] | undefined): number {
  return Math.max(
    0,
    ...(states ?? []).flatMap((state) => state.code.split('\n').map((line) => line.length)),
  );
}

/**
 * The most lines any state has, so the frame keeps one height as the states change.
 *
 * @param states - The keyed states.
 * @returns The line count; `undefined` before the states are known.
 */
function tallestState(states: readonly KeyedTokensInfo[] | undefined): number | undefined {
  if (states === undefined) {
    return undefined;
  }

  return Math.max(...states.map((state) => state.code.split('\n').length));
}

/**
 * Props of {@link PendingMove}.
 */
type PendingMoveProps = {
  /**
   * The code to show uncolored while the animation loads.
   */
  code: string | undefined;
};

/**
 * Stands in while the animation or the tokens load: holds the slide's readiness and shows the
 * state's code uncolored so the frame keeps its size.
 */
function PendingMove({ code }: PendingMoveProps): ReactNode {
  useReadyHold(true);
  return <pre className="kit-code-pre">{code}</pre>;
}
