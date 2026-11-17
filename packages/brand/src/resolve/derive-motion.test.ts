import { Effect } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import type { Brand } from '#schema/brand-schema.ts';

import { compileBrand } from '#compile/compile-brand.ts';
import {
  completeMotion,
  MOTION_DURATION_NAMES,
  MOTION_EASING_NAMES,
} from '#resolve/derive-motion.ts';
import { resolveBrand } from '#resolve/resolve-brand.ts';
import { MAX_DURATION_MS } from '#schema/presentation-schema.ts';
import { testBrand } from '#test-brand.fixture.ts';

/**
 * A motion section with the given easings and durations and a transition that names `easing` and
 * `duration`.
 */
function motion(
  easings: Brand['motion']['easings'],
  durations: Brand['motion']['durations'],
  names: { easing: string; duration: string } = { easing: 'standard', duration: 'base' },
): Brand['motion'] {
  return { easings, durations, transition: { kind: 'fade', ...names } };
}

describe('completeMotion', () => {
  it('derives emphasized and exit from standard, and fast and slow from base', () => {
    const complete = completeMotion(motion({ standard: [0.22, 1, 0.36, 1] }, { base: 250 }));
    expect(complete.easings).toEqual({
      standard: [0.22, 1, 0.36, 1],
      emphasized: [0.22, 1, 0.36, 1],
      exit: [0.22, 1, 0.36, 1],
    });
    expect(complete.durations).toEqual({ fast: 125, base: 250, slow: 425 });
  });

  it('keeps every value the brand defines and its own other names after the kit names', () => {
    const complete = completeMotion(
      motion(
        { snappy: [0.2, 0.8, 0.2, 1], emphasized: [0.3, 0, 0, 1], standard: [0.2, 0, 0, 1] },
        { base: 280, fast: 160, slow: 480, pause: 1200 },
      ),
    );
    expect(complete.easings['emphasized']).toEqual([0.3, 0, 0, 1]);
    expect(Object.keys(complete.easings)).toEqual(['standard', 'emphasized', 'exit', 'snappy']);
    expect(complete.durations).toEqual({ fast: 160, base: 280, slow: 480, pause: 1200 });
    expect(Object.keys(complete.durations)).toEqual(['fast', 'base', 'slow', 'pause']);
  });

  it('falls back to the default transition when the brand has no standard or base', () => {
    const complete = completeMotion(
      motion(
        { smooth: [0.4, 0, 0.2, 1] },
        { medium: 400 },
        { easing: 'smooth', duration: 'medium' },
      ),
    );
    expect(complete.easings['standard']).toEqual([0.4, 0, 0.2, 1]);
    expect(complete.durations).toMatchObject({ fast: 200, base: 400, slow: 680 });
  });

  it('keeps a derived slow duration within the schema limit', () => {
    const complete = completeMotion(motion({ standard: [0.2, 0, 0, 1] }, { base: 2500 }));
    expect(complete.durations['slow']).toBe(MAX_DURATION_MS);
  });

  it('never takes a value a plain object inherits, such as constructor', () => {
    const complete = completeMotion(
      motion({}, {}, { easing: 'constructor', duration: 'constructor' }),
    );
    expect(complete.easings['standard']).toEqual([0.25, 0.1, 0.25, 1]);
    expect(complete.durations['base']).toBe(300);
  });
});

describe('compiled motion tokens', () => {
  it('declares every easing and duration the kit reads for a brand that defines only some', () => {
    // The test brand defines only `standard` and `base`, as an imported brand may.
    const { tokens } = Effect.runSync(resolveBrand(testBrand()));
    const { css } = compileBrand(tokens, []);
    for (const name of MOTION_EASING_NAMES) {
      expect(css).toContain(`  --brand-ease-${name}: cubic-bezier(0.2, 0, 0, 1);`);
    }

    for (const name of MOTION_DURATION_NAMES) {
      expect(css).toMatch(new RegExp(`  --brand-duration-${name}: \\d+ms;`, 'u'));
    }

    expect(css).toContain('  --brand-duration-slow: 510ms;');
  });
});
