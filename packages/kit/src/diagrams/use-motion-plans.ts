import { useEffect, useRef, type RefObject } from 'react';

/**
 * One animation to run on an element of a diagram, found by its `data-motion` attribute.
 */
export type MotionPlan = {
  /**
   * The element's `data-motion` value.
   */
  target: string;

  /**
   * The keyframes, as the Web Animations API takes them.
   */
  keyframes: Keyframe[];

  /**
   * Duration, delay, iterations and fill.
   */
  timing: KeyframeAnimationOptions;
};

/**
 * Runs a diagram's animations with the Web Animations API: creates one animation per plan on the
 * element it names, plays them while `playing` is true and pauses them otherwise (the slide is off
 * screen, the deck is in static mode or the viewer asked for reduced motion), and cancels them when
 * the plans change. Coming back to a slide starts its animations from the beginning.
 *
 * @param root - The diagram's root element.
 * @param plans - The animations; a new array replaces them all.
 * @param playing - Whether they should run now.
 */
export function useMotionPlans(
  root: RefObject<HTMLElement | null>,
  plans: readonly MotionPlan[],
  playing: boolean,
): void {
  const animations = useRef<Animation[]>([]);
  useEffect(() => {
    const element = root.current;
    if (element === null || plans.length === 0) {
      return undefined;
    }

    const created = createAnimations(element, plans);
    animations.current = created;
    return () => {
      for (const animation of created) {
        animation.cancel();
      }

      animations.current = [];
    };
  }, [root, plans]);
  useEffect(() => {
    for (const animation of animations.current) {
      if (playing) {
        animation.cancel();
        animation.play();
      } else {
        animation.pause();
      }
    }
  }, [playing, plans]);
  useEffect(() => {
    if (!playing || typeof document === 'undefined') {
      return undefined;
    }

    /**
     * Pauses the animations while the tab is in the background and resumes them where they were
     * when it comes back, so a looping packet is not mid-way through a jump on return.
     */
    const follow = (): void => {
      for (const animation of animations.current) {
        if (document.hidden) {
          animation.pause();
        } else if (animation.playState === 'paused') {
          animation.play();
        }
      }
    };
    document.addEventListener('visibilitychange', follow);
    return () => document.removeEventListener('visibilitychange', follow);
  }, [playing, plans]);
}

/**
 * Creates each plan's animation, paused, on the element it names. A plan whose element is not in
 * the diagram creates nothing.
 *
 * @param element - The diagram's root.
 * @param plans - The animations.
 * @returns The animations, in the order of the plans that found their element.
 */
function createAnimations(element: HTMLElement, plans: readonly MotionPlan[]): Animation[] {
  return plans.flatMap((plan) => {
    const target = element.querySelector(`[data-motion="${CSS.escape(plan.target)}"]`);
    if (target === null) {
      return [];
    }

    const animation = target.animate(plan.keyframes, plan.timing);
    animation.pause();
    return [animation];
  });
}
