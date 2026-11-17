import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  SLIDE_FRONTMATTER_HINTS,
  SlideFrontmatter,
  TRANSITION_KINDS,
} from '#contract/slide-frontmatter.ts';

/**
 * Decodes frontmatter as the build does, refusing unknown keys, or gives the failure message.
 */
function decode(input: unknown): unknown {
  try {
    return Schema.decodeUnknownSync(SlideFrontmatter)(input, { onExcessProperty: 'error' });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe('SlideFrontmatter background', () => {
  it('takes none, a path or an image with its options', () => {
    expect(decode({ background: 'none' })).toEqual({ layout: 'default', background: 'none' });
    expect(decode({ background: 'assets/hall.jpg' })).toEqual({
      layout: 'default',
      background: 'assets/hall.jpg',
    });
    const image = {
      src: 'assets/hall.jpg',
      fit: 'contain',
      focal: { x: 30, y: 60 },
      opacity: 0.8,
      tint: { role: 'bg', opacity: 0.5 },
      layers: 'over',
    };
    expect(decode({ background: image })).toEqual({ layout: 'default', background: image });
  });

  it('refuses a tint in a palette color, a focal point off the image and unknown options', () => {
    for (const background of [
      { src: 'a.jpg', tint: { role: 'ink.900', opacity: 0.5 } },
      { src: 'a.jpg', focal: { x: 120, y: 50 } },
      { src: 'a.jpg', blur: 4 },
      { fit: 'cover' },
      '',
    ]) {
      expect(typeof decode({ background }), JSON.stringify(background)).toBe('string');
    }
  });
});

describe('SlideFrontmatter transition', () => {
  it('takes every transition kind the brand schema takes', () => {
    for (const transition of TRANSITION_KINDS) {
      expect(decode({ transition })).toEqual({ layout: 'default', transition });
    }
  });

  it('refuses a kind it does not know, and the hint names every kind', () => {
    expect(typeof decode({ transition: 'dissolve' })).toBe('string');
    for (const kind of TRANSITION_KINDS) {
      expect(SLIDE_FRONTMATTER_HINTS.transition).toContain(`"${kind}"`);
    }
  });
});
