import { it } from '@effect/vitest';
import { Effect } from 'effect';
import { describe, expect } from 'vite-plus/test';

import { pageSlide } from '#browser/fake-deck.fixture.ts';
import { hiddenLeftOut, selectSlides } from '#export/export-targets.ts';

/**
 * Five slides; the second and fourth are hidden.
 */
const SLIDES = [
  pageSlide(0, 'cover'),
  pageSlide(1, 'backup', { hidden: true }),
  pageSlide(2, 'plan'),
  pageSlide(3, 'appendix', { hidden: true }),
  pageSlide(4, 'close'),
];

/**
 * The ids a selection picks.
 *
 * @param selection - The `--slides` value.
 * @param includeHidden - Whether `--include-hidden` was given.
 */
const ids = (selection: string | undefined, includeHidden: boolean) =>
  selectSlides(SLIDES, selection, includeHidden).pipe(
    Effect.map((slides) => slides.map((slide) => slide.id)),
  );

describe('selectSlides', () => {
  it.effect('leaves hidden slides out by default and keeps them with --include-hidden', () =>
    Effect.gen(function* () {
      expect(yield* ids(undefined, false)).toEqual(['cover', 'plan', 'close']);
      expect(yield* ids(undefined, true)).toEqual(['cover', 'backup', 'plan', 'appendix', 'close']);
    }),
  );

  it.effect('keeps a hidden slide that --slides names, by id, number or range', () =>
    Effect.gen(function* () {
      expect(yield* ids('backup,close', false)).toEqual(['backup', 'close']);
      expect(yield* ids('4', false)).toEqual(['appendix']);
      expect(yield* ids('1-3', false)).toEqual(['cover', 'backup', 'plan']);
    }),
  );
});

describe('hiddenLeftOut', () => {
  it('counts the hidden slides an export leaves out without being asked', () => {
    expect(hiddenLeftOut(SLIDES, undefined, false)).toBe(2);
    expect(hiddenLeftOut(SLIDES, undefined, true)).toBe(0);
    expect(hiddenLeftOut(SLIDES, '1,3', false)).toBe(0);
    expect(
      hiddenLeftOut(
        SLIDES.filter((slide) => !slide.hidden),
        undefined,
        false,
      ),
    ).toBe(0);
  });
});
