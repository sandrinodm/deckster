import { describe, expect, it } from '@effect/vitest';
import { Result } from 'effect';

import type { BrandLayoutSpec } from '#schema/layout-schema.ts';

import { checkBoxBounds, checkLayouts, type LayoutNames } from '#checks/layout-checks.ts';
import { TEST_LAYOUTS } from '#test-brand.fixture.ts';
import { decodeLayouts } from '#validate/decode-layouts.ts';

/**
 * The names the fixture layouts refer to.
 */
const NAMES: LayoutNames = {
  surfaces: ['default', 'inverse', 'accent', 'gradient'],
  treatments: ['plain', 'duotone'],
  gradients: ['aurora'],
};

/**
 * Decodes layouts built from the third fixture layout with fields replaced.
 */
function decoded(...overrides: Readonly<Record<string, unknown>>[]): readonly BrandLayoutSpec[] {
  const input = overrides.map((override) => ({ ...structuredClone(TEST_LAYOUTS[2]), ...override }));
  const result = decodeLayouts(input);
  if (Result.isFailure(result)) {
    throw new Error(result.failure.map((problem) => problem.message).join('\n'));
  }

  return result.success;
}

/**
 * The errors of one layout.
 */
function errorsOf(override: Readonly<Record<string, unknown>>) {
  return checkLayouts(decoded(override), NAMES).errors;
}

describe('checkLayouts', () => {
  it('passes the fixture layouts', () => {
    const result = decodeLayouts(TEST_LAYOUTS);
    if (Result.isFailure(result)) {
      throw new Error('fixture does not decode');
    }

    expect(checkLayouts(result.success, NAMES)).toEqual({ errors: [], warnings: [] });
  });

  it('rejects a repeated name', () => {
    const { errors } = checkLayouts(decoded({}, {}), NAMES);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe('layouts[1].name');
    expect(errors[0]?.message).toContain('layouts[0]');
  });

  it('rejects boxes outside the canvas', () => {
    const regions = [{ bind: { slot: 'body' }, box: [1900, 0, 100, 100] }];
    expect(errorsOf({ regions })[0]?.path).toBe('layouts[0].regions[0].box');
    expect(
      errorsOf({ regions: [{ bind: { slot: 'body' }, box: [-1, 0, 100, 100] }] }),
    ).toHaveLength(1);
    expect(
      errorsOf({ regions: [{ bind: { slot: 'body' }, box: [0, 1000, 100, 100] }] }),
    ).toHaveLength(1);
  });

  it('accepts a box that fills the canvas', () => {
    expect(errorsOf({ regions: [{ bind: { slot: 'body' }, box: [0, 0, 1920, 1080] }] })).toEqual(
      [],
    );
  });

  it('rejects a box under 40 pixels', () => {
    const [problem] = errorsOf({ regions: [{ bind: { slot: 'body' }, box: [0, 0, 39, 100] }] });
    expect(problem?.message).toContain('at least 40x40');
  });

  it('rejects a binding that appears twice', () => {
    const regions = [
      { bind: { slot: 'body' }, box: [0, 0, 100, 100] },
      { bind: { slot: 'body' }, box: [200, 0, 100, 100] },
    ];
    const [problem] = errorsOf({ regions });
    expect(problem?.path).toBe('layouts[0].regions[1].bind');
  });

  it('rejects a field region that is not text', () => {
    const regions = [{ bind: { field: 'byline' }, box: [0, 0, 100, 100], kind: 'media' }];
    expect(errorsOf({ regions })[0]?.path).toBe('layouts[0].regions[0].kind');
  });

  it('rejects fit and treatment off a media region and type and color off a media region', () => {
    const regions = [
      { bind: { slot: 'body' }, box: [0, 0, 100, 100], fit: 'cover', treatment: 'plain' },
      {
        bind: { slot: 'media' },
        box: [200, 0, 100, 100],
        kind: 'media',
        type: 'body',
        color: 'fg',
      },
    ];
    expect(errorsOf({ regions }).map((problem) => problem.path)).toEqual([
      'layouts[0].regions[0].fit',
      'layouts[0].regions[0].treatment',
      'layouts[0].regions[1].type',
      'layouts[0].regions[1].color',
    ]);
  });

  it('rejects a treatment the brand does not have and suggests one', () => {
    const regions = [
      { bind: { slot: 'media' }, box: [0, 0, 100, 100], kind: 'media', treatment: 'duotne' },
    ];
    const [problem] = errorsOf({ regions });
    expect(problem?.path).toBe('layouts[0].regions[0].treatment');
    expect(problem?.fix).toContain('Use "duotone"');
  });

  it('rejects a surface, a background key, a gradient and a layer treatment the brand lacks', () => {
    const background = {
      sepia: [{ type: 'gradient', gradient: 'sunrise' }],
      default: [
        { type: 'image', file: 'backgrounds/a.png', treatment: 'nope' },
        { type: 'gradient', gradient: 'aurora' },
      ],
    };
    const paths = errorsOf({ surface: 'night', background }).map((problem) => problem.path);
    expect(paths).toEqual([
      'layouts[0].surface',
      'layouts[0].background.sepia',
      'layouts[0].background.sepia[0].gradient',
      'layouts[0].background.default[0].treatment',
    ]);
  });

  it('checks the keys of an unkeyed background by their own path', () => {
    const background = [{ type: 'gradient', gradient: 'sunrise' }];
    expect(errorsOf({ background })[0]?.path).toBe('layouts[0].background[0].gradient');
  });

  it('rejects a layout with no title and no regions', () => {
    expect(errorsOf({ title: false, regions: [] })[0]?.path).toBe('layouts[0]');
  });

  it('accepts a layout with only regions or only a title', () => {
    expect(errorsOf({ title: false })).toEqual([]);
    expect(errorsOf({ regions: [] })).toEqual([]);
  });

  it('warns about overlapping text boxes but not touching ones or media', () => {
    const overlapping = checkLayouts(
      decoded({
        title: { box: [0, 0, 500, 200] },
        regions: [{ bind: { slot: 'body' }, box: [400, 100, 500, 200] }],
      }),
      NAMES,
    );
    expect(overlapping.errors).toEqual([]);
    expect(overlapping.warnings.map((warning) => warning.path)).toEqual([
      'layouts[0].regions[0].box',
    ]);
    const quiet = checkLayouts(
      decoded({
        title: { box: [0, 0, 500, 200] },
        regions: [
          { bind: { slot: 'body' }, box: [500, 0, 500, 200] },
          { bind: { slot: 'media' }, box: [0, 0, 900, 900], kind: 'media' },
        ],
      }),
      NAMES,
    );
    expect(quiet.warnings).toEqual([]);
  });

  it('rejects a fields entry that is repeated or that a region binds', () => {
    const regions = [{ bind: { field: 'byline' }, box: [0, 0, 100, 100] }];
    const paths = errorsOf({ regions, fields: ['treatment', 'treatment', 'byline'] }).map(
      (problem) => problem.path,
    );
    expect(paths).toEqual(['layouts[0].fields[1]', 'layouts[0].fields[2]']);
    expect(errorsOf({ fields: ['treatment', 'focal'] })).toEqual([]);
  });
});

describe('checkBoxBounds', () => {
  it('accepts boxes within the canvas and at least 40x40', () => {
    expect(checkBoxBounds([0, 0, 40, 40])).toEqual([]);
    expect(checkBoxBounds([0, 0, 1920, 1080])).toEqual([]);
    expect(checkBoxBounds([120, 200, 800, 400])).toEqual([]);
  });

  it('reports too-small for boxes below 40x40 or with non-finite size', () => {
    for (const box of [
      [0, 0, 39, 100],
      [0, 0, 100, 39],
      [0, 0, -10, 100],
      [0, 0, Number.NaN, 100],
    ] as const) {
      const [problem] = checkBoxBounds(box);
      expect(problem?.kind).toBe('too-small');
      expect(problem?.message).toContain('at least 40x40');
    }
  });

  it('reports out-of-bounds for boxes extending past the 1920x1080 canvas', () => {
    for (const box of [
      [-1, 0, 100, 100],
      [0, -1, 100, 100],
      [1881, 0, 40, 100],
      [0, 1041, 100, 40],
      [Number.POSITIVE_INFINITY, 0, 100, 100],
    ] as const) {
      const [problem] = checkBoxBounds(box);
      expect(problem?.kind).toBe('out-of-bounds');
      expect(problem?.message).toContain('1920x1080');
    }
  });
});
