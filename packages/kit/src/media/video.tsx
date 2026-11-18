import { useBrand } from '@deckster/brand/runtime';
import { useReadyHold, useSlide, useStatic, useStep } from '@deckster/engine';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { FocalPoint } from '#media/focal-point.ts';

import { StepMarks } from '#code/step-marks.tsx';
import { checkComponentProps } from '#components/check-component-props.ts';
import { focalStyle } from '#media/focal-point.ts';
import { useMediaFrame } from '#media/media-frame.ts';
import {
  assertValidCues,
  cueAts,
  posterAt,
  reachedEnd,
  seekTarget,
  segmentBounds,
  segmentIndex,
  type CueSegment,
} from '#media/video-cues.ts';
import { useHeldByStep } from '#motion/still-motion.ts';

/**
 * Props of {@link Video}.
 */
export type VideoProps = {
  /**
   * The video file, MP4 or WebM. In MDX a relative path is resolved at build time.
   */
  src: string;

  /**
   * A still frame, required: it is what static mode, `deck shot` and exports show, and what the
   * video shows before it can play.
   */
  poster: string;

  /**
   * One still per part of a cued video (one more than the steps its `cues` add), each the frame at
   * the end of its part: static mode, `deck shot --steps` and exports show the one for the current
   * step. Without them every step shows `poster`, and `deck lint` warns (`video-cue-posters`).
   */
  posters?: readonly string[];

  /**
   * What the video shows, for people who cannot see it.
   */
  alt: string;

  /**
   * Play again from the start when it ends; defaults to `false`.
   */
  loop?: boolean;

  /**
   * Keep the sound off; defaults to `true`, which browsers need to start playing by themselves.
   */
  muted?: boolean;

  /**
   * Start playing when the slide appears; defaults to `true`. With `false` the viewer starts it
   * with the controls.
   */
  autoPlay?: boolean;

  /**
   * Show the browser's controls. They are marked interactive, so clicks on them do not move the
   * deck. Defaults to `false`.
   */
  controls?: boolean;

  /**
   * Times in seconds that cut the video into parts played step by step: with `[0, 4.2, 9]` the
   * video plays from 0 to 4.2 when the slide appears and pauses, plays 4.2 to 9 at the first step,
   * and 9 to the end at the second.
   */
  cues?: readonly number[];

  /**
   * The step of the second cue; each further cue is one step later. Defaults to 1.
   */
  at?: number;

  /**
   * How the video fills its frame: `cover` (default) or `contain`.
   */
  fit?: 'cover' | 'contain';

  /**
   * The subject's position, so cropping keeps it in view.
   */
  focal?: FocalPoint;

  /**
   * The frame's width over height. Without it the frame takes the room its container gives it.
   */
  ratio?: number;

  /**
   * A caption under the video.
   */
  caption?: ReactNode;
};

/**
 * The empty list of cues, kept stable between renders.
 */
const NO_CUES: readonly number[] = [];

/**
 * A video that plays when its slide is on screen and pauses when the deck moves away. It starts
 * muted so browsers allow it, and can be cut into parts with `cues` that advance with steps;
 * stepping back plays a part again from its start, and coming back to the slide starts it over. In
 * static mode, `deck shot` and exports it shows the poster (the part's own with `posters`), never a
 * frame of the video. The slide's `ready()` is held until the video's metadata has loaded.
 *
 * ```mdx
 * <Video
 *   src="../assets/pour.mp4"
 *   poster="../assets/pour.jpg"
 *   alt="Pouring tea"
 *   cues={[0, 4.2, 9]}
 * />
 * ```
 */
export function Video(props: VideoProps): ReactNode {
  checkComponentProps('Video', props);
  const { cues = NO_CUES, at } = props;
  assertValidCues(cues);
  const ats = cueAts(cues, at);
  const index = segmentIndex(ats, useStep());
  const segment = segmentBounds(cues, index);
  const isStatic = useStatic();
  const { brand } = useBrand();
  const frame = useMediaFrame();
  const plan = brand.imagery.treatments[frame?.treatment ?? brand.imagery.default];
  const radius = plan?.type === 'rounded' && frame?.rounded !== false ? plan.radius : 0;
  const parts = ats.length + 1;
  const controls = props.controls === true;
  return (
    <figure
      className="kit-video"
      data-controls={controls}
      data-static={isStatic}
      data-video-parts={parts}
      data-video-posters={props.posters?.length ?? 0}>
      <div
        className="kit-video-frame"
        style={{ aspectRatio: props.ratio, borderRadius: radius }}
        {...(controls ? { 'data-deck-interactive': '' } : {})}>
        {isStatic ? (
          <Poster {...props} poster={posterAt(props.poster, props.posters, index)} />
        ) : (
          <Player {...props} segment={segment} />
        )}
      </div>
      {props.caption === undefined ? null : (
        <figcaption className="kit-video-caption kit-type-caption">{props.caption}</figcaption>
      )}
      <StepMarks ats={ats} />
    </figure>
  );
}

/**
 * The poster alone: what static mode, screenshots and exports show. The slide's `ready()` waits for
 * it to decode.
 */
function Poster({ poster, alt, fit: ownFit, focal }: VideoProps): ReactNode {
  const frame = useMediaFrame();
  const fit = ownFit ?? frame?.fit ?? 'cover';
  const ref = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  useReadyHold(!loaded);
  useEffect(() => {
    const image = ref.current;
    if (image === null) {
      return undefined;
    }

    let live = true;
    /**
     * Releases the readiness hold, whether the poster decoded or failed.
     */
    const done = (): void => {
      if (live) {
        setLoaded(true);
      }
    };
    image.decode().then(done, done);
    return () => {
      live = false;
    };
  }, [poster]);
  return (
    <img
      ref={ref}
      className="kit-video-media"
      src={poster}
      alt={alt}
      draggable={false}
      style={{ objectFit: fit, ...focalStyle(focal) }}
    />
  );
}

/**
 * Props of {@link Player}.
 */
type PlayerProps = VideoProps & {
  /**
   * The part of the video to play at the current step.
   */
  segment: CueSegment;
};

/**
 * The playing video: starts when the slide becomes the one on screen (inside a `<Step>`, when the
 * step reveals it), pauses when it leaves, and plays the part the current step names.
 */
function Player(props: PlayerProps): ReactNode {
  const { src, poster, alt, segment, loop = false, muted = true, autoPlay = true } = props;
  const { isActive } = useSlide();
  const held = useHeldByStep();
  const frame = useMediaFrame();
  // Inside a `<Step>` the video waits for its step, so it starts from the top as it appears.
  const playing = isActive && !held;
  const ref = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  useReadyHold(isActive && !ready);
  useEffect(() => {
    const video = ref.current;
    if (video === null) {
      return undefined;
    }

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      setReady(true);
      return undefined;
    }

    return listenForMetadata(video, () => setReady(true));
  }, [src]);
  const { from, to } = segment;
  const wasActive = useRef(false);
  useEffect(() => {
    const video = ref.current;
    if (video === null || !ready) {
      return undefined;
    }

    if (!playing) {
      wasActive.current = false;
      video.pause();
      return undefined;
    }

    const entering = !wasActive.current;
    wasActive.current = true;
    return playSegment(video, { from, to }, { autoPlay, entering });
  }, [playing, ready, from, to, autoPlay]);
  return (
    // Silent by default, so there is no sound to caption; a deck can add a track in TSX.
    // oxlint-disable-next-line jsx-a11y/media-has-caption
    <video
      ref={ref}
      className="kit-video-media"
      src={src}
      poster={poster}
      aria-label={alt}
      muted={muted}
      loop={loop && to === undefined}
      controls={props.controls === true}
      playsInline
      preload="metadata"
      style={{
        objectFit: props.fit ?? frame?.fit ?? 'cover',
        ...focalStyle(props.focal),
      }}
    />
  );
}

/**
 * Listens for the video's metadata loading or failing to load, so the slide is not held waiting for
 * a video that cannot play.
 *
 * @param video - The element.
 * @param onReady - Called each time one of the two events fires.
 * @returns Stops listening.
 */
function listenForMetadata(video: HTMLVideoElement, onReady: () => void): () => void {
  video.addEventListener('loadedmetadata', onReady);
  video.addEventListener('error', onReady);
  return () => {
    video.removeEventListener('loadedmetadata', onReady);
    video.removeEventListener('error', onReady);
  };
}

/**
 * Plays a segment of a video and pauses at its end, seeking first where {@link seekTarget} says: to
 * the segment's start when the slide arrives, when the video has ended, or when the playhead is
 * outside the segment.
 *
 * @param video - The element.
 * @param segment - What to play.
 * @param start - Whether to start by itself, and whether the slide just arrived.
 * @returns Stops watching for the end of the segment.
 */
function playSegment(
  video: HTMLVideoElement,
  segment: CueSegment,
  start: { autoPlay: boolean; entering: boolean },
): () => void {
  const target = seekTarget(segment, {
    time: video.currentTime,
    ended: video.ended,
    entering: start.entering,
  });
  if (target !== undefined) {
    video.currentTime = target;
  }

  if (start.autoPlay || segment.from > 0) {
    video.play().catch(() => undefined);
  }

  let frame = 0;
  /**
   * Pauses at the end of the segment, otherwise checks again on the next frame.
   */
  const watch = (): void => {
    if (reachedEnd(segment, video.currentTime)) {
      video.pause();
      return;
    }

    frame = requestAnimationFrame(watch);
  };
  frame = requestAnimationFrame(watch);
  return () => cancelAnimationFrame(frame);
}
