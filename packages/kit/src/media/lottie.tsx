import type { AnimationItem } from 'lottie-web';

import { useReadyHold, useSlide, useStatic } from '@deckster/engine';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { IconRole } from '#icons/icon.tsx';

import { checkComponentProps } from '#components/check-component-props.ts';
import { staticFrame, type StaticFrame } from '#media/lottie-frame.ts';

/**
 * Props of {@link Lottie}.
 */
export type LottieProps = {
  /**
   * The animation file (Lottie JSON). In MDX a relative path is resolved at build time. The file
   * and the player load only when the slide is shown.
   */
  src: string;

  /**
   * What the animation shows, for people who cannot see it.
   */
  alt: string;

  /**
   * Play again from the start when it ends; defaults to `false`.
   */
  loop?: boolean;

  /**
   * The frame static mode, `deck shot` and exports show: a frame number, `'first'` or `'last'` (the
   * default).
   */
  frame?: StaticFrame;

  /**
   * The frame's width over height. Without it the frame takes the room its container gives it.
   */
  ratio?: number;

  /**
   * How wide the animation is: `sm`, `md` or `lg` take a width from the brand's spacing scale and
   * `full` (the default) fills its container.
   */
  size?: 'sm' | 'md' | 'lg' | 'full';

  /**
   * Draws every stroke and fill in a color role of the slide's surface, such as `accent` or `fg`,
   * whatever colors the file has. Without it the file keeps its own colors, which `deck lint`
   * reports when they are not brand colors.
   */
  role?: IconRole;
};

/**
 * A Lottie animation made by a designer, drawn as SVG. The player and the file load the first time
 * the slide is on screen, and the slide's `ready()` waits for them. The animation plays while the
 * slide is on screen and pauses when the deck moves on; static mode, `deck shot` and exports show
 * one frame (the last unless `frame` says otherwise). A Lottie file carries its own colors; `role`
 * redraws them in a color of the slide's surface, so the animation follows the brand.
 *
 * ```mdx
 * <Lottie src="../assets/check.json" alt="A check mark drawing itself" frame="last" />
 * ```
 */
export function Lottie(props: LottieProps): ReactNode {
  checkComponentProps('Lottie', props);
  const { src, alt, loop = false, frame, ratio = 1, size = 'full', role } = props;
  const isStatic = useStatic();
  const { isActive } = useSlide();
  const container = useRef<HTMLDivElement | null>(null);
  const [animation, setAnimation] = useState<AnimationItem>();
  const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(false);
  const onScreen = isActive || isStatic;
  if (onScreen && !started) {
    setStarted(true);
  }

  useReadyHold(onScreen && animation === undefined && !failed);
  useEffect(() => {
    const element = container.current;
    if (!started || element === null) {
      return undefined;
    }

    let live = true;
    let created: AnimationItem | undefined;
    loadAnimation(element, src, loop)
      .then((item) => {
        created = item;
        if (live) {
          setAnimation(item);
        } else {
          item.destroy();
        }
      })
      .catch(() => {
        if (live) {
          setFailed(true);
        }
      });
    return () => {
      live = false;
      created?.destroy();
    };
  }, [started, src, loop]);
  useEffect(() => {
    if (animation === undefined) {
      return;
    }

    if (isStatic) {
      animation.goToAndStop(staticFrame(frame, animation.totalFrames), true);
    } else if (isActive) {
      animation.goToAndPlay(0, true);
    } else {
      animation.pause();
    }
  }, [animation, isActive, isStatic, frame]);
  return (
    <figure
      className="kit-lottie"
      aria-label={alt}
      data-size={size}
      data-role={role}
      data-status={failed ? 'error' : 'ok'}>
      <div ref={container} className="kit-lottie-frame" style={{ aspectRatio: ratio }} />
      {failed ? (
        <div className="kit-image-missing kit-type-caption">Animation not found: {src}</div>
      ) : null}
    </figure>
  );
}

/**
 * Loads the player and the animation file and draws the animation in an element, paused at the
 * start.
 *
 * @param element - Where to draw.
 * @param src - The animation file URL.
 * @param loop - Whether it repeats.
 */
async function loadAnimation(
  element: HTMLElement,
  src: string,
  loop: boolean,
): Promise<AnimationItem> {
  const [{ default: player }, response] = await Promise.all([
    import('lottie-web/build/player/lottie_light'),
    fetch(src),
  ]);
  if (!response.ok) {
    throw new Error(`Could not load ${src}: ${response.status}`);
  }

  const animationData: unknown = await response.json();
  return player.loadAnimation({
    container: element,
    renderer: 'svg',
    loop,
    autoplay: false,
    animationData,
    rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
  });
}
