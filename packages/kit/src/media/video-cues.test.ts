import { describe, expect, it } from 'vite-plus/test';

import {
  assertValidCues,
  cueAts,
  posterAt,
  reachedEnd,
  seekTarget,
  segmentBounds,
  segmentIndex,
} from '#media/video-cues.ts';

describe('assertValidCues', () => {
  it('accepts ascending times from zero, and none', () => {
    expect(() => assertValidCues([0, 4.2, 9])).not.toThrow();
    expect(() => assertValidCues([])).not.toThrow();
  });

  it('rejects negative, repeated and descending times', () => {
    expect(() => assertValidCues([-1, 2])).toThrow(RangeError);
    expect(() => assertValidCues([0, 3, 3])).toThrow(/ascend/);
    expect(() => assertValidCues([5, 2])).toThrow(RangeError);
    expect(() => assertValidCues([Number.NaN])).toThrow(RangeError);
  });
});

describe('cueAts', () => {
  it('registers one step per cue after the first', () => {
    expect(cueAts([0, 4.2, 9])).toEqual([1, 2]);
    expect(cueAts([0, 4.2, 9], 3)).toEqual([3, 4]);
    expect(cueAts([0])).toEqual([]);
    expect(cueAts([])).toEqual([]);
  });
});

describe('segmentIndex and segmentBounds', () => {
  const cues = [0, 4.2, 9];
  const ats = cueAts(cues);

  it('plays up to the second cue on arrival', () => {
    expect(segmentBounds(cues, segmentIndex(ats, 0))).toEqual({ from: 0, to: 4.2 });
  });

  it('plays from each cue to the next as steps are reached', () => {
    expect(segmentBounds(cues, segmentIndex(ats, 1))).toEqual({ from: 4.2, to: 9 });
  });

  it('plays the last part to the end, however far the deck steps', () => {
    expect(segmentBounds(cues, segmentIndex(ats, 2))).toEqual({ from: 9, to: undefined });
    expect(segmentBounds(cues, segmentIndex(ats, 50))).toEqual({ from: 9, to: undefined });
  });

  it('plays the whole video when there are no cues', () => {
    expect(segmentBounds([], 0)).toEqual({ from: 0, to: undefined });
  });
});

describe('reachedEnd', () => {
  it('pauses at the end of a segment but never in an open one', () => {
    expect(reachedEnd({ from: 0, to: 4.2 }, 4.1)).toBe(false);
    expect(reachedEnd({ from: 0, to: 4.2 }, 4.2)).toBe(true);
    expect(reachedEnd({ from: 9, to: undefined }, 100)).toBe(false);
  });
});

describe('seekTarget', () => {
  const first = { from: 0, to: 3 };
  const second = { from: 3, to: 6 };

  it('plays on from the end of one part into the next without a jump', () => {
    expect(seekTarget(second, { time: 3.01, ended: false, entering: false })).toBeUndefined();
  });

  it('seeks back to the start of a part when stepping back to it', () => {
    expect(seekTarget(first, { time: 4.6, ended: false, entering: false })).toBe(0);
    expect(seekTarget(second, { time: 6, ended: false, entering: false })).toBe(3);
  });

  it('starts again from the beginning when the slide comes back at step 0', () => {
    expect(seekTarget(first, { time: 3, ended: false, entering: true })).toBe(0);
    expect(seekTarget({ from: 0, to: undefined }, { time: 8, ended: false, entering: true })).toBe(
      0,
    );
  });

  it('seeks a video that has ended, and leaves one at its start alone', () => {
    expect(seekTarget({ from: 0, to: undefined }, { time: 9, ended: true, entering: false })).toBe(
      0,
    );
    expect(seekTarget(first, { time: 0.02, ended: false, entering: true })).toBeUndefined();
  });
});

describe('posterAt', () => {
  it('shows the poster of each part when there is one per part, else the one poster', () => {
    expect(posterAt('p.jpg', ['a.jpg', 'b.jpg', 'c.jpg'], 1)).toBe('b.jpg');
    expect(posterAt('p.jpg', ['a.jpg'], 2)).toBe('a.jpg');
    expect(posterAt('p.jpg', undefined, 2)).toBe('p.jpg');
  });
});
