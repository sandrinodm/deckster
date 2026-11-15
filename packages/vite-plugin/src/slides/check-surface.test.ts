import { Effect } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import { checkSurface, withLayoutSurface } from '#slides/check-surface.ts';

const REF = {
  file: '/workspace/decks/demo/slides/intro.mdx',
  displayPath: 'decks/demo/slides/intro.mdx',
};
const BRAND = { name: 'nocturne', surfaces: ['default', 'inverse', 'accent', 'gradient'] };

describe('checkSurface', () => {
  it('accepts a surface the brand has, no surface, or no brand to check against', () => {
    expect(() =>
      Effect.runSync(checkSurface({ layout: 'default', surface: 'inverse' }, BRAND, REF)),
    ).not.toThrow();
    expect(() => Effect.runSync(checkSurface({ layout: 'default' }, BRAND, REF))).not.toThrow();
    expect(() =>
      Effect.runSync(checkSurface({ layout: 'default', surface: 'dusk' }, undefined, REF)),
    ).not.toThrow();
  });

  it('names the brand, suggests the closest surface and lists them otherwise', () => {
    expect(() =>
      Effect.runSync(checkSurface({ layout: 'default', surface: 'invers' }, BRAND, REF)),
    ).toThrow(
      [
        'Invalid frontmatter in decks/demo/slides/intro.mdx:',
        '  - surface: The nocturne brand has no "invers" surface.',
        '    Fix: Use "inverse".',
      ].join('\n'),
    );
    expect(() =>
      Effect.runSync(checkSurface({ layout: 'default', surface: 'spotlight' }, BRAND, REF)),
    ).toThrow("Fix: Use one of the nocturne brand's surfaces: default, inverse, accent, gradient.");
  });
});

describe('withLayoutSurface', () => {
  it('gives a slide without a surface the surface its layout asks for', () => {
    expect(withLayoutSurface({ layout: 'section' }, 'accent', BRAND)).toEqual({
      layout: 'section',
      surface: 'accent',
    });
  });

  it('keeps the slide’s own surface over the layout’s', () => {
    const frontmatter = { layout: 'section', surface: 'inverse' };
    expect(withLayoutSurface(frontmatter, 'accent', BRAND)).toBe(frontmatter);
  });

  it('leaves the slide on the default surface when the brand lacks the layout’s or is unknown', () => {
    const frontmatter = { layout: 'section' };
    expect(withLayoutSurface(frontmatter, 'spotlight', BRAND)).toBe(frontmatter);
    expect(withLayoutSurface(frontmatter, 'accent', undefined)).toBe(frontmatter);
    expect(withLayoutSurface(frontmatter, undefined, BRAND)).toBe(frontmatter);
  });
});
