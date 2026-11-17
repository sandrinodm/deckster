import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import { LIMIT_CASES } from '#layouts/limit-cases.ts';
import {
  CALLOUT_LABEL_MAX_CHARS,
  MAX_CALLOUTS,
  screenLayoutContract,
  screenProblems,
} from '#layouts/screen-layout.contract.ts';

/**
 * A screen with a file and a description.
 */
const SCREEN = { src: 'assets/screens/map.png', alt: 'The planting map' };

/**
 * A callout in the middle of the picture.
 */
const CALLOUT = { x: 50, y: 50, label: 'Each pin is a request' };

/**
 * The screen's frontmatter, decoded.
 */
type Decoded = Parameters<typeof screenProblems>[0];

/**
 * Decodes frontmatter as the build does: the fields every slide has plus the screen layout's.
 *
 * @param frontmatter - The slide's fields without `layout`.
 */
function decode(frontmatter: Record<string, unknown>): Decoded {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...screenLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'screen', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the screen layout contract', () => {
  it('needs a picture with a description, in a browser by default', () => {
    expect(decode(SCREEN)).toMatchObject({ frame: 'browser', reveal: false });
    expect(() => decode({ src: SCREEN.src })).toThrow('alt');
    expect(() => decode({ alt: SCREEN.alt })).toThrow('src');
    expect(() => decode({ ...SCREEN, frame: 'tablet' })).toThrow('Expected "browser"');
  });

  it('takes up to four callouts, each a point in percent with a short label', () => {
    const four = Array.from({ length: MAX_CALLOUTS }, () => CALLOUT);
    expect(() => decode({ ...SCREEN, callouts: four })).not.toThrow();
    expect(() => decode({ ...SCREEN, callouts: [...four, CALLOUT] })).toThrow(
      `at most ${MAX_CALLOUTS} callouts`,
    );
    expect(() => decode({ ...SCREEN, callouts: [{ ...CALLOUT, x: 120 }] })).toThrow(
      'from 0 to 100',
    );
    expect(() => decode({ ...SCREEN, callouts: [{ ...CALLOUT, y: -1 }] })).toThrow('from 0 to 100');
    expect(() =>
      decode({
        ...SCREEN,
        callouts: [{ ...CALLOUT, label: 'x'.repeat(CALLOUT_LABEL_MAX_CHARS + 1) }],
      }),
    ).toThrow(`at most ${CALLOUT_LABEL_MAX_CHARS} characters`);
  });

  it('shows an address only in the browser bar, and reveals only callouts', () => {
    const address = 'trees.larkfield.example/map';
    expect(screenProblems(decode({ ...SCREEN, address }))).toEqual([]);
    expect(screenProblems(decode({ ...SCREEN, address, frame: 'phone' }))).toMatchObject([
      { path: 'address' },
    ]);
    expect(screenProblems(decode({ ...SCREEN, reveal: true }))).toMatchObject([{ path: 'reveal' }]);
    expect(screenProblems(decode({ ...SCREEN, reveal: true, callouts: [CALLOUT] }))).toEqual([]);
  });

  it('has an example and limit cases that decode with no problems', () => {
    expect(screenProblems(decode(screenLayoutContract.example.frontmatter))).toEqual([]);
    const cases = LIMIT_CASES.screen ?? [];
    expect(cases.map((limit) => limit.name)).toEqual(['browser', 'phone', 'laptop', 'none']);
    for (const limit of cases) {
      expect(screenProblems(decode(limit.frontmatter))).toEqual([]);
    }
  });

  it('puts the screen on the gradient surface and maps to a PowerPoint title-only slide', () => {
    expect(screenLayoutContract.surface).toBe('gradient');
    expect(screenLayoutContract.pptx?.type).toBe('title-only');
  });
});
