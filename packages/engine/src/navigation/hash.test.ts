import { describe, expect, it } from 'vite-plus/test';

import { formatHash, parseHash } from '#navigation/hash.ts';

const SLIDE_IDS = ['title', 'request-flow', 'closing'];

describe('formatHash', () => {
  it('writes a 1-based slide number and a 0-based step', () => {
    expect(formatHash({ slide: 0, step: 0 })).toBe('#/1/0');
    expect(formatHash({ slide: 11, step: 3 })).toBe('#/12/3');
  });
});

describe('parseHash', () => {
  it('reads what formatHash writes', () => {
    expect(parseHash(formatHash({ slide: 2, step: 4 }), SLIDE_IDS)).toEqual({ slide: 2, step: 4 });
  });

  it('treats a missing step as step 0', () => {
    expect(parseHash('#/2', SLIDE_IDS)).toEqual({ slide: 1, step: 0 });
    expect(parseHash('#/2/', SLIDE_IDS)).toEqual({ slide: 1, step: 0 });
  });

  it('accepts a slide id in place of the number', () => {
    expect(parseHash('#/request-flow/2', SLIDE_IDS)).toEqual({ slide: 1, step: 2 });
  });

  it('rejects empty, malformed and out-of-range hashes', () => {
    const invalid = ['', '#', '#/', '#/0', '#/4', '#/2/x', '#/missing', '#2/1', '#/2/-1'];
    for (const hash of invalid) {
      expect(parseHash(hash, SLIDE_IDS), hash).toBeUndefined();
    }
  });
});
