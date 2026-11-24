import { defineLayout, useStepAt, type LayoutProps } from '@deckster/engine';
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';

import type { imageRevealLayoutContract } from '#layouts/image-reveal-layout.contract.ts';

import { TreatedMedia } from '#foundation/media-treatment.tsx';
import { Eyebrow, FittedText, Frame } from '#foundation/slide-parts.tsx';
import { treatmentProps } from '#layouts/layout-fields.ts';
import { cssDurationMs } from '#motion/css-duration.ts';
import { useEnter } from '#motion/enter.ts';
import { useStillMotion } from '#motion/still-motion.ts';
import '#layouts/display-align.css';
import '#layouts/image-reveal-layout.css';

/**
 * The slide canvas width, in canvas pixels.
 */
const CANVAS_WIDTH = 1920;

/**
 * The slide canvas height, in canvas pixels.
 */
const CANVAS_HEIGHT = 1080;

/**
 * The most lines the cover title takes on step 0 before stepping down.
 */
const COVER_TITLE_MAX_LINES = 3;

/**
 * The most lines the docked bar title takes on step 1 before stepping down.
 */
const BAR_TITLE_MAX_LINES = 2;

/**
 * Fallback reveal animation duration, in milliseconds, when brand motion tokens are absent.
 */
const DEFAULT_DURATION_MS = 560;

/**
 * Fallback easing curve when brand motion tokens are absent.
 */
const DEFAULT_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * Subtle image scale at the start of the reveal, settling gently to 1.
 */
const STAGE_START_SCALE = 1.025;

/**
 * Measured geometry of one element in normalized 1920×1080 canvas coordinates.
 */
type CanvasBox = {
  /**
   * Distance from the slide's left edge, in canvas pixels.
   */
  left: number;

  /**
   * Distance from the slide's top edge, in canvas pixels.
   */
  top: number;

  /**
   * Width, in canvas pixels.
   */
  width: number;

  /**
   * Height, in canvas pixels.
   */
  height: number;

  /**
   * Computed font size, in canvas pixels.
   */
  fontSize: number;
};

/**
 * Snapshot of the movable elements captured before a step change.
 */
type RevealSnapshot = {
  /**
   * The panel box (full canvas on step 0, docked bar on step 1).
   */
  panel: CanvasBox | undefined;

  /**
   * The eyebrow box, when rendered.
   */
  eyebrow: CanvasBox | undefined;

  /**
   * The title box.
   */
  title: CanvasBox | undefined;

  /**
   * The subtitle box, when rendered.
   */
  subtitle: CanvasBox | undefined;
};

/**
 * Custom properties written on the layout elements for focal point and optional bar overrides.
 */
type ImageRevealStyle = CSSProperties & Record<`--${string}`, string>;

/**
 * The `image-reveal` layout: step 0 looks like a title slide over the slide's surface and optional
 * `background:`; step 1 animates the title and subtitle smoothly into a full-width header (`dock:
 * top`) or footer (`dock: bottom`) bar with its own surface background and edge border, revealing
 * the `<Media>` image across the rest of the slide.
 */
function ImageRevealLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof imageRevealLayoutContract>): ReactNode {
  const revealed = useStepAt(1) !== 'hidden';
  const still = useStillMotion();
  const coverEnter = useEnter(0);
  const { dock, align, barSurface, barBackground, barBorder, fit, focal, treatment } = frontmatter;

  const panelRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const eyebrowRef = useRef<HTMLDivElement | null>(null);
  const titleWrapRef = useRef<HTMLDivElement | null>(null);
  const subtitleRef = useRef<HTMLDivElement | null>(null);
  const prevRevealedRef = useRef(revealed);
  const snapshotRef = useRef<RevealSnapshot | undefined>(undefined);
  const animationsRef = useRef<Animation[]>([]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const stage = stageRef.current;
    const frame = panel?.closest<HTMLElement>('.kit-frame') ?? null;

    for (const animation of animationsRef.current) {
      animation.cancel();
    }

    animationsRef.current = [];

    const after = captureSnapshot(frame, {
      panel,
      eyebrow: eyebrowRef.current,
      title: titleWrapRef.current?.firstElementChild ?? null,
      subtitle: subtitleRef.current,
    });
    const before = snapshotRef.current;
    const changed = prevRevealedRef.current !== revealed;
    prevRevealedRef.current = revealed;
    snapshotRef.current = after;

    if (!changed || still || before === undefined || panel === null || prefersReducedMotion()) {
      return;
    }

    const timing = readRevealTiming(panel);
    const running: Animation[] = [];
    let panelOffset = 0;
    if (revealed && after.panel !== undefined) {
      panelOffset = dock === 'bottom' ? after.panel.height : -after.panel.height;
    }

    if (panelOffset !== 0) {
      startAnimation(
        running,
        panel,
        [{ transform: `translateY(${panelOffset}px)` }, { transform: 'translateY(0px)' }],
        timing,
      );
    }

    flipText(
      running,
      eyebrowRef.current,
      before.eyebrow,
      after.eyebrow,
      align,
      panelOffset,
      timing,
    );
    flipText(
      running,
      titleWrapRef.current?.firstElementChild ?? null,
      before.title,
      after.title,
      align,
      panelOffset,
      timing,
    );
    flipText(
      running,
      subtitleRef.current,
      before.subtitle,
      after.subtitle,
      align,
      panelOffset,
      timing,
    );

    if (stage !== null) {
      if (revealed) {
        startAnimation(
          running,
          stage,
          [
            { opacity: 0, transform: `scale(${STAGE_START_SCALE})` },
            { opacity: 1, transform: 'scale(1)' },
          ],
          timing,
        );
      } else {
        startAnimation(
          running,
          stage,
          [
            { opacity: 0.85, visibility: 'visible', transform: 'scale(1)' },
            { opacity: 0, visibility: 'hidden', transform: `scale(${STAGE_START_SCALE})` },
          ],
          timing,
        );
      }
    }

    animationsRef.current = running;
  }, [revealed, still, dock, align]);

  const effectiveTreatment = treatment ?? (fit === 'contain' ? 'plain' : undefined);
  const stageStyle: ImageRevealStyle = { '--kit-focal': focal ?? 'center' };
  const panelStyle: ImageRevealStyle | undefined =
    revealed && (barBackground !== undefined || barBorder !== undefined)
      ? {
          ...(barBackground === undefined ? {} : { '--kit-image-reveal-bar-bg': barBackground }),
          ...(barBorder === undefined ? {} : { '--kit-image-reveal-bar-border': barBorder }),
        }
      : undefined;

  const stageNode = (
    <div
      ref={stageRef}
      className="kit-image-reveal-stage"
      style={stageStyle}
      aria-hidden={!revealed || undefined}>
      <TreatedMedia
        className="kit-image-reveal-frame"
        rounded={false}
        fit={fit}
        {...treatmentProps(effectiveTreatment)}>
        {slots.media}
      </TreatedMedia>
    </div>
  );

  const panelNode = (
    <div
      ref={panelRef}
      className="kit-image-reveal-panel"
      data-surface={revealed ? barSurface : undefined}
      style={panelStyle}>
      <div className="kit-image-reveal-copy" {...coverEnter}>
        {frontmatter.eyebrow === undefined ? null : (
          <div ref={eyebrowRef} className="kit-image-reveal-eyebrow">
            <Eyebrow text={frontmatter.eyebrow} />
          </div>
        )}
        <div ref={titleWrapRef} className="kit-image-reveal-title-wrap">
          <FittedText
            as="h1"
            className={`kit-image-reveal-title kit-heading ${
              revealed ? 'kit-type-title' : 'kit-type-display'
            }`}
            maxLines={revealed ? BAR_TITLE_MAX_LINES : COVER_TITLE_MAX_LINES}
            boundary=".kit-image-reveal-panel">
            {frontmatter.title}
          </FittedText>
        </div>
        {slots.body === undefined ? null : (
          <div
            ref={subtitleRef}
            className={`kit-image-reveal-subtitle kit-prose${revealed ? ' kit-type-small' : ''}`}
            data-text={revealed ? undefined : 'lead'}>
            {slots.body}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Frame
      layout="image-reveal"
      variant={{
        'data-revealed': String(revealed),
        'data-dock': dock,
        'data-align': align,
        'data-fit': fit,
        'data-motion': still ? 'off' : 'on',
      }}>
      {dock === 'top' ? (
        <>
          {panelNode}
          {stageNode}
        </>
      ) : (
        <>
          {stageNode}
          {panelNode}
        </>
      )}
    </Frame>
  );
}

/**
 * Measures the animated elements in normalized 1920×1080 canvas coordinates.
 *
 * @param frame - The slide frame used to remove viewport scaling.
 * @param elements - The panel and text elements to measure.
 */
function captureSnapshot(
  frame: HTMLElement | null,
  elements: {
    panel: Element | null;
    eyebrow: Element | null;
    title: Element | null;
    subtitle: Element | null;
  },
): RevealSnapshot {
  if (frame === null) {
    return { panel: undefined, eyebrow: undefined, title: undefined, subtitle: undefined };
  }

  const frameRect = frame.getBoundingClientRect();
  const scaleX = frameRect.width > 0 ? frameRect.width / CANVAS_WIDTH : 1;
  const scaleY = frameRect.height > 0 ? frameRect.height / CANVAS_HEIGHT : 1;

  return {
    panel: measureBox(elements.panel, frameRect, scaleX, scaleY),
    eyebrow: measureBox(elements.eyebrow, frameRect, scaleX, scaleY),
    title: measureBox(elements.title, frameRect, scaleX, scaleY),
    subtitle: measureBox(elements.subtitle, frameRect, scaleX, scaleY),
  };
}

/**
 * Converts one element's viewport bounding box into canvas coordinates.
 *
 * @param element - The element to measure, or `null` when absent.
 * @param frameRect - The enclosing slide frame's viewport rect.
 * @param scaleX - Horizontal viewport-to-canvas scale factor.
 * @param scaleY - Vertical viewport-to-canvas scale factor.
 */
function measureBox(
  element: Element | null,
  frameRect: DOMRect,
  scaleX: number,
  scaleY: number,
): CanvasBox | undefined {
  if (element === null) {
    return undefined;
  }

  const rect = element.getBoundingClientRect();
  const fontSize = Number.parseFloat(getComputedStyle(element).fontSize) || 0;
  return {
    left: (rect.left - frameRect.left) / scaleX,
    top: (rect.top - frameRect.top) / scaleY,
    width: rect.width / scaleX,
    height: rect.height / scaleY,
    fontSize,
  };
}

/**
 * Animates a text block from its prior cover/bar box to its new box using uniform font-ratio
 * scaling, cancelling the parent panel's vertical slide so the text glides along a straight path.
 *
 * @param running - Active animations list to append to.
 * @param element - The DOM element to animate.
 * @param before - Box captured before the step change.
 * @param after - Box captured after the step change.
 * @param align - Horizontal text alignment (`left` or `center`).
 * @param panelOffset - Vertical offset applied to the enclosing panel at `t = 0`.
 * @param timing - Shared duration and easing options.
 */
function flipText(
  running: Animation[],
  element: Element | null,
  before: CanvasBox | undefined,
  after: CanvasBox | undefined,
  align: 'left' | 'center',
  panelOffset: number,
  timing: KeyframeAnimationOptions,
): void {
  if (element === null || before === undefined || after === undefined) {
    return;
  }

  const dx =
    align === 'center'
      ? before.left + before.width / 2 - (after.left + after.width / 2)
      : before.left - after.left;
  const dy = before.top - after.top - panelOffset;
  const scale = before.fontSize > 0 && after.fontSize > 0 ? before.fontSize / after.fontSize : 1;
  const origin = align === 'center' ? 'center top' : 'left top';

  startAnimation(
    running,
    element,
    [
      { transformOrigin: origin, transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
      { transformOrigin: origin, transform: 'translate(0px, 0px) scale(1)' },
    ],
    timing,
  );
}

/**
 * Starts a Web Animation when the environment supports it and tracks it for clean cancellation.
 *
 * @param running - Active animations list to append to.
 * @param element - Target element.
 * @param keyframes - Animation keyframes.
 * @param timing - Duration and easing options.
 */
function startAnimation(
  running: Animation[],
  element: Element,
  keyframes: Keyframe[],
  timing: KeyframeAnimationOptions,
): void {
  if (typeof element.animate !== 'function') {
    return;
  }

  const animation = element.animate(keyframes, timing);
  // Cancelling a running Web Animation rejects its `finished` promise by spec.
  void animation.finished?.catch(() => undefined);
  running.push(animation);
}

/**
 * Reads the brand's slow duration and emphasized easing tokens from the slide's computed style.
 *
 * @param element - Element inside the themed brand root.
 */
function readRevealTiming(element: Element): KeyframeAnimationOptions {
  const styles = getComputedStyle(element);
  const duration =
    cssDurationMs(styles.getPropertyValue('--brand-duration-slow')) ?? DEFAULT_DURATION_MS;
  const easing = styles.getPropertyValue('--brand-ease-emphasized').trim() || DEFAULT_EASING;
  return { duration, easing };
}

/**
 * Whether the viewer asks for reduced motion.
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * The `image-reveal` layout's component. Both the docked bar and the full-bleed image touch every
 * edge, so the chrome moves off all of them.
 */
export const imageRevealLayout = defineLayout<typeof imageRevealLayoutContract>({
  name: 'image-reveal',
  component: ImageRevealLayout,
  bleed: () => ['left', 'right', 'top', 'bottom'],
});
