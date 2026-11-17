import { useSlide, type SlideInfo } from '@deckster/engine';
import { useContext, useEffect, useMemo, useState, type RefObject } from 'react';

import type { RevealState } from '#charts/frame/chart-step.tsx';
import type { CountValue } from '#motion/count-up.ts';

import { prefersReducedMotion } from '#diagrams/diagram-tokens.ts';
import { countText, parseCount } from '#motion/count-up.ts';
import { RevealContext, useStillMotion } from '#motion/still-motion.ts';

/**
 * How long a count runs, as a multiple of the brand's slow duration: long enough to read as
 * counting, short enough to finish with the entrance of the figures after it.
 */
const COUNT_DURATION_SHARE = 1.5;

/**
 * When a count that plays with the slide waits for, as a share of the slide transition, when no
 * entrance animation around the figure says when it appears; the kit's entrance starts there.
 */
const TRANSITION_DELAY_SHARE = 0.35;

/**
 * The kit's entrance animation, whose delay says when an entering figure appears.
 */
const ENTER_ANIMATION = 'kit-enter';

/**
 * The easing a count uses when the brand's emphasized easing is not one the browser takes.
 */
const FALLBACK_EASING = 'ease-out';

/**
 * What started a count: the slide arriving going forward, or the step around the figure being
 * revealed.
 */
type CountCause = 'enter' | 'reveal';

/**
 * One run of a count: what started it, and a number that changes with every run.
 */
type CountRun = {
  /**
   * What started it.
   */
  cause: CountCause;

  /**
   * Increases with each run, so a run that starts again restarts the animation.
   */
  id: number;
};

/**
 * What the count last saw of the slide and its step.
 */
type Seen = {
  /**
   * Whether the slide was on screen.
   */
  active: boolean;

  /**
   * The reveal state of the step around the figure, if any.
   */
  reveal: RevealState | undefined;

  /**
   * The latest run, or `undefined` before the first.
   */
  run: CountRun | undefined;
};

/**
 * The timing of a run, read from the brand's tokens around the figure.
 */
type CountTiming = {
  /**
   * Milliseconds before the count starts.
   */
  delay: number;

  /**
   * Milliseconds the count runs.
   */
  duration: number;

  /**
   * The easing, as CSS writes it (`cubic-bezier(0.3, 0, 0, 1)`).
   */
  easing: string;
};

/**
 * Counts a stat's number up from zero when the live deck moves forward onto its slide, or onto the
 * step that reveals it, over the brand's slow duration with its emphasized easing, starting when
 * the figure's entrance starts. It returns the text to show over the figure while the count runs,
 * and `undefined` otherwise: the final value stays in the layout throughout, so fitting and
 * measurement only ever see it, and it stays the text assistive technology reads.
 *
 * Nothing counts in static mode, in a `SlideView` copy, going backward, when the slide is opened
 * directly, with reduced motion, or for a number that is not a plain figure (see `parseCount`).
 *
 * @param number - The number part of the stat, as `splitStat` gives it.
 * @param ref - An element of the figure, for reading the brand's tokens and its entrance.
 * @returns The text to show while counting, or `undefined` when the figure shows as it is.
 * @throws Error when called outside a slide.
 */
export function useCountUp(number: string, ref: RefObject<HTMLElement | null>): string | undefined {
  const count = useMemo(() => parseCount(number), [number]);
  const run = useCountRun(count !== undefined);
  const [live, setLive] = useState<{ run: CountRun | undefined; text: string | undefined }>({
    run,
    text: undefined,
  });
  if (live.run !== run) {
    // A new run shows zero from the first frame, before the effect schedules the rest.
    const text = count === undefined || prefersReducedMotion() ? undefined : countText(count, 0);
    setLive({ run, text });
  }

  useEffect(() => {
    const element = ref.current;
    const plays = run !== undefined && count !== undefined && element !== null;
    if (!plays || prefersReducedMotion()) {
      return undefined;
    }

    return playCount(count, countTiming(element, run.cause), (text) => setLive({ run, text }));
  }, [run, count, ref]);
  return live.text;
}

/**
 * The latest run of a count, started when the slide arrives going forward with the figure shown, or
 * when the step around the figure is revealed going forward, while the deck is live.
 *
 * @param countable - Whether the figure counts at all.
 */
function useCountRun(countable: boolean): CountRun | undefined {
  const slide = useSlide();
  const still = useStillMotion();
  const reveal = useContext(RevealContext);
  const [seen, setSeen] = useState<Seen>({ active: slide.isActive, reveal, run: undefined });
  if (seen.active !== slide.isActive || seen.reveal !== reveal) {
    const cause = countable && !still ? causeOf(seen, slide, reveal) : undefined;
    const run = cause === undefined ? seen.run : { cause, id: (seen.run?.id ?? 0) + 1 };
    setSeen({ active: slide.isActive, reveal, run });
  }

  return seen.run;
}

/**
 * What starts a count after a change of the slide or its step, if anything does.
 *
 * @param before - What the count saw before.
 * @param slide - The slide now.
 * @param reveal - The reveal state of the step around the figure now.
 */
function causeOf(
  before: Seen,
  slide: SlideInfo,
  reveal: RevealState | undefined,
): CountCause | undefined {
  if (slide.direction !== 'forward') {
    return undefined;
  }

  if (before.reveal === 'hidden' && reveal === 'play') {
    return 'reveal';
  }

  const arrived = !before.active && slide.isActive;
  return arrived && reveal !== 'hidden' ? 'enter' : undefined;
}

/**
 * Runs a count frame by frame and reports the text of each frame, then `undefined` once it ends.
 * The clock is an animation with no target or keyframes, so the browser applies the brand's easing
 * exactly as it does in the stylesheet, and it pauses with the page.
 *
 * @param count - The figure.
 * @param timing - The delay, duration and easing.
 * @param show - Called with each frame's text.
 * @returns Stops the count.
 */
function playCount(
  count: CountValue,
  timing: CountTiming,
  show: (text: string | undefined) => void,
): () => void {
  const effect = new KeyframeEffect(null, null, { ...timing, fill: 'both' });
  const clock = new Animation(effect, document.timeline);
  clock.play();
  let frame = 0;
  /**
   * Shows one frame and asks for the next, until the count has run.
   */
  const tick = (): void => {
    if (clock.playState === 'finished') {
      show(undefined);
      return;
    }

    show(countText(count, effect.getComputedTiming().progress ?? 0));
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    clock.cancel();
  };
}

/**
 * The timing of a run from the brand's tokens around the figure: the slow duration and emphasized
 * easing, and a start that waits for the figure's own entrance when the slide arrives.
 *
 * @param element - An element of the figure.
 * @param cause - What started the run.
 */
function countTiming(element: HTMLElement, cause: CountCause): CountTiming {
  const style = getComputedStyle(element);
  const slow = Number.parseFloat(style.getPropertyValue('--brand-duration-slow'));
  const transition = Number.parseFloat(style.getPropertyValue('--brand-transition-duration'));
  return {
    delay: cause === 'enter' ? enterDelay(element, transition) : 0,
    duration: Number.isFinite(slow) ? slow * COUNT_DURATION_SHARE : 0,
    easing: readEasing(style.getPropertyValue('--brand-ease-emphasized')),
  };
}

/**
 * When an entering figure appears: the delay of the kit's entrance animation on the nearest element
 * that takes part in it, else a share of the slide transition.
 *
 * @param element - An element of the figure.
 * @param transition - The slide transition's duration in milliseconds, `NaN` when unknown.
 */
function enterDelay(element: HTMLElement, transition: number): number {
  const entering = element.closest('[data-kit-enter]');
  const animation = entering
    ?.getAnimations()
    .find(
      (candidate) =>
        candidate instanceof CSSAnimation && candidate.animationName === ENTER_ANIMATION,
    );
  const delay = animation?.effect?.getTiming().delay;
  if (delay !== undefined) {
    return delay;
  }

  return Number.isFinite(transition) ? transition * TRANSITION_DELAY_SHARE : 0;
}

/**
 * An easing token's value when the browser takes it as an animation easing, else
 * {@link FALLBACK_EASING}.
 *
 * @param css - The computed value of an easing token, such as `cubic-bezier(0.3, 0, 0, 1)`.
 */
function readEasing(css: string): string {
  const easing = css.trim();
  try {
    // The constructor throws a TypeError for an easing it cannot parse, such as an empty value.
    new KeyframeEffect(null, null, { easing });
    return easing;
  } catch {
    return FALLBACK_EASING;
  }
}
