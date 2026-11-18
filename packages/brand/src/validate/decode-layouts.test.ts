import { describe, expect, it } from '@effect/vitest';
import { Result } from 'effect';

import { TEST_LAYOUTS } from '#test-brand.fixture.ts';
import { decodeLayouts } from '#validate/decode-layouts.ts';

/**
 * The problems decoding the input fails with, or an empty list when it decodes.
 */
function problemsOf(input: unknown) {
  const decoded = decodeLayouts(input);
  return Result.isFailure(decoded) ? decoded.failure : [];
}

/**
 * The first fixture layout with fields replaced.
 */
function layout(overrides: Readonly<Record<string, unknown>>): unknown {
  return [{ ...structuredClone(TEST_LAYOUTS[2]), ...overrides }];
}

describe('decodeLayouts', () => {
  it('decodes the fixture layouts', () => {
    expect(Result.isSuccess(decodeLayouts(TEST_LAYOUTS))).toBe(true);
  });

  it('decodes an empty list', () => {
    expect(Result.isSuccess(decodeLayouts([]))).toBe(true);
  });

  it('names the layout, region and field of a bad box', () => {
    const [problem] = problemsOf(
      layout({ regions: [{ bind: { slot: 'body' }, box: [0, 0, 100] }] }),
    );
    expect(problem?.path).toBe('layouts[0].regions[0].box');
    expect(problem?.fix).toContain('[x, y, width, height]');
  });

  it('reports a missing field with its fix', () => {
    const { fallback: _fallback, ...rest } = structuredClone(TEST_LAYOUTS[2]);
    const input: unknown = [rest];
    const problem = problemsOf(input).find((found) => found.path === 'layouts[0].fallback');
    expect(problem?.message).toBe('This field is required.');
    expect(problem?.fix).toContain('kit layout');
  });

  it('rejects an unknown field and suggests the closest one', () => {
    const [problem] = problemsOf(layout({ regionz: [] }));
    expect(problem?.path).toBe('layouts[0].regionz');
    expect(problem?.fix).toBe('Rename it to "regions".');
  });

  it('rejects an unknown field of a region', () => {
    const [problem] = problemsOf(
      layout({ regions: [{ bind: { slot: 'body' }, box: [0, 0, 100, 100], colour: 'fg' }] }),
    );
    expect(problem?.path).toBe('layouts[0].regions[0].colour');
    expect(problem?.fix).toBe('Rename it to "color".');
  });

  it('rejects a type step and a role that do not exist', () => {
    const problems = problemsOf(
      layout({ title: { box: [0, 0, 100, 100], type: 'huge', color: 'red' } }),
    );
    expect(problems.map((problem) => problem.path)).toEqual([
      'layouts[0].title.type',
      'layouts[0].title.color',
    ]);
  });

  it('rejects a name that is not kebab-case and an empty description', () => {
    const paths = problemsOf(layout({ name: 'Two Up', description: '' })).map(
      (problem) => problem.path,
    );
    expect(paths).toEqual(['layouts[0].name', 'layouts[0].description']);
  });

  it('accepts a title of false', () => {
    expect(Result.isSuccess(decodeLayouts(layout({ title: false })))).toBe(true);
  });

  it('rejects a field binding that is not lowerCamel', () => {
    const [problem] = problemsOf(
      layout({ regions: [{ bind: { field: 'By-line' }, box: [0, 0, 100, 100] }] }),
    );
    expect(problem?.path).toContain('layouts[0].regions[0]');
  });

  it('rejects more than 12 regions and more than 64 layouts', () => {
    const region = { bind: { slot: 'body' }, box: [0, 0, 100, 100] };
    expect(problemsOf(layout({ regions: Array.from({ length: 13 }, () => region) }))).not.toEqual(
      [],
    );
    const many = Array.from({ length: 65 }, () => structuredClone(TEST_LAYOUTS[2]));
    expect(problemsOf(many)[0]?.message).toContain('at most 64');
  });

  it('rejects an export that is not a list', () => {
    expect(problemsOf({ name: 'x' })[0]?.path).toBe('layouts');
  });

  it('takes camelCase slot names and rejects kebab-case ones', () => {
    const region = (slot: string) => [{ bind: { slot }, box: [0, 0, 100, 100] }];
    expect(Result.isSuccess(decodeLayouts(layout({ regions: region('quoteSource') })))).toBe(true);
    expect(problemsOf(layout({ regions: region('quote-source') }))).not.toEqual([]);
    expect(
      Result.isSuccess(decodeLayouts(layout({ budget: { quoteSource: { maxWords: 5 } } }))),
    ).toBe(true);
  });

  it('rejects a fields entry that is not lowerCamel', () => {
    expect(problemsOf(layout({ fields: ['Focal'] }))[0]?.path).toBe('layouts[0].fields[0]');
  });
});
