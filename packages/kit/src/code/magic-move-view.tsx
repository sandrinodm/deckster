import type { KeyedTokensInfo, MagicMoveRenderOptions } from '@shikijs/magic-move/types';

import { ShikiMagicMovePrecompiled } from '@shikijs/magic-move/react';
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { cssDurationMs } from '#motion/css-duration.ts';

/**
 * Props of {@link MagicMoveView}.
 */
type MagicMoveViewProps = {
  /**
   * Every state of the sequence, keyed so tokens can be paired between neighbours.
   */
  states: KeyedTokensInfo[];

  /**
   * The state to show.
   */
  index: number;

  /**
   * Whether to animate to a new state; `false` jumps straight to it.
   */
  animate: boolean;
};

/**
 * The measurements the animation needs from the page.
 */
type Measured = {
  /**
   * The duration in milliseconds.
   */
  duration: number;

  /**
   * The easing as a CSS timing function.
   */
  easing: string;

  /**
   * The factor the slide canvas is scaled by.
   */
  scale: number;
};

/**
 * How long tokens that stay wait before they glide, as a share of the duration.
 */
const MOVE_DELAY = 0.15;

/**
 * How long new tokens wait before they fade in, as a share of the duration: after the moves.
 */
const ENTER_DELAY = 0.55;

/**
 * The smallest change in canvas scale worth measuring again.
 */
const SCALE_EPSILON = 0.001;

/**
 * Duration used before the brand's has been read.
 */
const FALLBACK_DURATION_MS = 480;

/**
 * Renders a sequence of code states with Shiki Magic Move: tokens that stay move to their new
 * place, new ones fade in, removed ones fade out. Duration and easing are the brand's slow duration
 * and emphasized easing. The animation measures positions on the page, so it is told the factor the
 * canvas is scaled by. This module is loaded only on slides that use `<CodeMove>`.
 */
export default function MagicMoveView({ states, index, animate }: MagicMoveViewProps): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<Measured>({
    duration: FALLBACK_DURATION_MS,
    easing: 'ease',
    scale: 1,
  });
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) {
      return undefined;
    }

    /**
     * Measures again and keeps the result when it changed.
     */
    const read = (): void => setMeasured((current) => measure(element, current));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const options = useMemo(
    (): MagicMoveRenderOptions => ({
      duration: measured.duration,
      easing: measured.easing,
      globalScale: measured.scale,
      containerStyle: false,
      animateContainer: false,
      delayMove: MOVE_DELAY,
      delayEnter: ENTER_DELAY,
      delayLeave: 0,
      stagger: 0,
    }),
    [measured],
  );
  return (
    <div ref={ref} className="kit-code-move">
      <ShikiMagicMovePrecompiled steps={states} step={index} animate={animate} options={options} />
    </div>
  );
}

/**
 * Reads the brand's duration and easing and the canvas scale around an element.
 *
 * @param element - An element inside the canvas.
 * @param previous - The measurements so far; returned itself when nothing changed.
 */
function measure(element: HTMLElement, previous: Measured): Measured {
  const style = getComputedStyle(element);
  const duration = cssDurationMs(style.getPropertyValue('--brand-duration-slow'));
  const easing = style.getPropertyValue('--brand-ease-emphasized').trim();
  const scale =
    element.offsetWidth === 0 ? 1 : element.getBoundingClientRect().width / element.offsetWidth;
  const next: Measured = {
    duration: duration !== undefined && duration > 0 ? duration : previous.duration,
    easing: easing === '' ? previous.easing : easing,
    scale: Number.isFinite(scale) && scale > 0 ? scale : previous.scale,
  };
  const same =
    next.duration === previous.duration &&
    next.easing === previous.easing &&
    Math.abs(next.scale - previous.scale) < SCALE_EPSILON;
  return same ? previous : next;
}
