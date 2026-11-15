import { afterEach, describe, expect, it } from 'vite-plus/test';

import { clearSlideBadges, currentBadges, setSlideBadges } from '#badges/slide-badges.ts';

describe('slide badges', () => {
  afterEach(() => {
    clearSlideBadges('comments');
    clearSlideBadges('review');
  });

  it('collects the badges of every source for a slide', () => {
    setSlideBadges('comments', { intro: [{ label: '3' }] });
    setSlideBadges('review', {
      intro: [{ label: 'new', tone: 'accent' }],
      other: [{ label: '1' }],
    });
    expect(currentBadges('intro').map((badge) => badge.label)).toEqual(['3', 'new']);
    expect(currentBadges('other').map((badge) => badge.label)).toEqual(['1']);
    expect(currentBadges('missing')).toEqual([]);
  });

  it('replaces what a source set before and drops it when cleared', () => {
    setSlideBadges('comments', { intro: [{ label: '2' }] });
    setSlideBadges('comments', { intro: [{ label: '5' }] });
    expect(currentBadges('intro').map((badge) => badge.label)).toEqual(['5']);
    clearSlideBadges('comments');
    expect(currentBadges('intro')).toEqual([]);
  });
});
