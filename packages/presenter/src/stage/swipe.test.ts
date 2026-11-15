import { describe, expect, it } from 'vite-plus/test';

import { swipeDirection } from '#stage/swipe.ts';

describe('swipeDirection', () => {
  it('maps a left swipe to next and a right swipe to prev', () => {
    expect(swipeDirection({ dx: -120, dy: 10, durationMs: 200 })).toBe('next');
    expect(swipeDirection({ dx: 120, dy: -10, durationMs: 200 })).toBe('prev');
  });

  it('ignores short, slow and vertical gestures', () => {
    expect(swipeDirection({ dx: -30, dy: 0, durationMs: 100 })).toBeUndefined();
    expect(swipeDirection({ dx: -200, dy: 0, durationMs: 1200 })).toBeUndefined();
    expect(swipeDirection({ dx: -80, dy: 120, durationMs: 200 })).toBeUndefined();
  });
});
