/**
 * The part of a video one step plays: from a time to the next cue, or to the end.
 */
export type CueSegment = {
  /**
   * Where playback starts, in seconds.
   */
  from: number;

  /**
   * Where playback pauses, in seconds; `undefined` plays to the end.
   */
  to: number | undefined;
};

/**
 * Checks a list of cues.
 *
 * @param cues - Times in seconds.
 * @throws RangeError when a cue is negative or not a number, or the list does not ascend.
 */
export function assertValidCues(cues: readonly number[]): void {
  cues.forEach((cue, index) => {
    const previous = cues[index - 1];
    if (!Number.isFinite(cue) || cue < 0 || (previous !== undefined && cue <= previous)) {
      throw new RangeError(
        `The video cues [${cues.join(', ')}] are not valid. Give times in seconds that ascend ` +
          'from 0, for example `cues={[0, 4.2, 9]}`.',
      );
    }
  });
}

/**
 * The slide steps a cue list registers: one per cue after the first, since the first cue is where
 * the video starts when the slide arrives.
 *
 * @param cues - The cue times.
 * @param first - The step of the second cue; defaults to 1.
 */
export function cueAts(cues: readonly number[], first: number = 1): number[] {
  return Array.from({ length: Math.max(0, cues.length - 1) }, (_, index) => first + index);
}

/**
 * The index of the segment to play at a slide step: how many of the video's steps have been
 * reached.
 *
 * @param ats - The video's steps, from {@link cueAts}.
 * @param current - The slide's current step value, 0 before any step.
 */
export function segmentIndex(ats: readonly number[], current: number): number {
  return ats.filter((at) => at <= current).length;
}

/**
 * The part of the video a segment plays. With no cues the whole video is one segment.
 *
 * @param cues - The cue times.
 * @param index - The segment, from {@link segmentIndex}.
 */
export function segmentBounds(cues: readonly number[], index: number): CueSegment {
  const clamped = Math.min(Math.max(index, 0), Math.max(cues.length - 1, 0));
  return { from: cues[clamped] ?? 0, to: cues[clamped + 1] };
}

/**
 * Whether playback has reached the end of its segment and should pause.
 *
 * @param segment - The segment being played.
 * @param time - The video's current time in seconds.
 */
export function reachedEnd(segment: CueSegment, time: number): boolean {
  return segment.to !== undefined && time >= segment.to;
}

/**
 * How far from a segment's start the playhead may be, in seconds, and still count as at the start.
 */
export const SEEK_TOLERANCE_S = 0.05;

/**
 * What a video knows when it starts playing a segment.
 */
export type PlayheadState = {
  /**
   * The video's current time in seconds.
   */
  time: number;

  /**
   * Whether the video has played to its end.
   */
  ended: boolean;

  /**
   * Whether the slide just arrived on screen, rather than its step changing.
   */
  entering: boolean;
};

/**
 * Where to seek before playing a segment, or `undefined` to play on from where the video is. A
 * video seeks to the segment's start when the slide arrives (so coming back to step 0 plays from
 * the beginning), when it has ended, and whenever the playhead is outside the segment (stepping
 * back plays that part again). Moving forward from the end of one segment into the next does not
 * seek, so the parts join without a jump.
 *
 * @param segment - The segment about to play.
 * @param state - The playhead and why the segment starts.
 */
export function seekTarget(segment: CueSegment, state: PlayheadState): number | undefined {
  const atStart = Math.abs(state.time - segment.from) <= SEEK_TOLERANCE_S;
  if (atStart) {
    return undefined;
  }

  const outside =
    state.time < segment.from || (segment.to !== undefined && state.time >= segment.to);
  return state.entering || state.ended || outside ? segment.from : undefined;
}

/**
 * The still static mode shows at a segment: its own poster when the video has one per part, else
 * the one poster.
 *
 * @param poster - The video's poster.
 * @param posters - One poster per part, or `undefined`.
 * @param index - The segment, from {@link segmentIndex}.
 */
export function posterAt(
  poster: string,
  posters: readonly string[] | undefined,
  index: number,
): string {
  return posters?.[Math.min(index, posters.length - 1)] ?? poster;
}
