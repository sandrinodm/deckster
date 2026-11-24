import { Result } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import { testBrand } from '#test-brand.fixture.ts';
import { decodeBrand } from '#validate/decode-brand.ts';

function problemsOf(input: unknown) {
  const decoded = decodeBrand(input);
  if (Result.isSuccess(decoded)) {
    throw new Error('Expected the brand to fail decoding.');
  }

  return decoded.failure;
}

describe('decodeBrand', () => {
  it('accepts a valid brand', () => {
    expect(Result.isSuccess(decodeBrand(testBrand()))).toBe(true);
  });

  it('names the field, the expected value, what was given and the fix', () => {
    const problems = problemsOf(testBrand({ 'color.roles.fg': 'dark gray' }));
    expect(problems).toEqual([
      {
        path: 'color.roles.fg',
        message:
          'Expected a color such as "#1f2937" or "oklch(0.62 0.19 259)", or a palette ' +
          'reference such as "ink.900" or "ink.900/12", got "dark gray".',
        fix:
          'Write a color such as "#1f2937" or "oklch(0.62 0.19 259)", or a palette reference ' +
          'such as "ink.900".',
      },
    ]);
  });

  it('suggests the closest field for a misspelled key', () => {
    const problems = problemsOf(testBrand({ 'typography.scale.body.lineHieght': 1.4 }));
    expect(problems).toContainEqual({
      path: 'typography.scale.body.lineHieght',
      message: '"lineHieght" is not a field of typography.scale.body.',
      fix: 'Rename it to "lineHeight".',
    });
  });

  it('lists the fields when an unknown key is not close to any', () => {
    const [problem] = problemsOf(testBrand({ theme: 'dark' }));
    expect(problem?.message).toBe('"theme" is not a field of a brand.');
    expect(problem?.fix).toContain('Fields of a brand: name, label, color, gradients');
  });

  it('reports missing fields and every problem at once', () => {
    const problems = problemsOf(
      testBrand({ 'typography.scale.stat': undefined, 'typography.scale.body.size': 12 }),
    );
    expect(problems.map((problem) => problem.path)).toEqual([
      'typography.scale.body.size',
      'typography.scale.stat',
    ]);
    expect(problems[0]?.message).toBe('Expected a size of at least 20 canvas pixels, got 12.');
    expect(problems[1]?.message).toBe('This field is required.');
  });

  it('explains a gradient or font source whose kind it does not know', () => {
    const problems = problemsOf(
      testBrand({
        gradients: { glow: { type: 'conic', stops: ['blue.600', 'gray.0'] } },
        'typography.families.body.source': { kind: 'google', family: 'Inter' },
      }),
    );
    expect(problems.map(({ path, message }) => ({ path, message }))).toEqual([
      {
        path: 'gradients.glow',
        message:
          'Expected a gradient whose type is "linear", "radial" or "mesh", got a set of fields.',
      },
      {
        path: 'typography.families.body.source',
        message:
          'Expected a font source whose kind is "fontsource", "files", "system" or ' +
          '"unavailable", got a set of fields.',
      },
    ]);
  });
});

describe('decodeBrand map keys', () => {
  it('says what a palette step must look like instead of listing no fields', () => {
    const problems = problemsOf(testBrand({ 'color.palette.gray': { A100: '#ffffff' } }));
    expect(problems).toEqual([
      {
        path: 'color.palette.gray.A100',
        message: '"A100" is not a valid name in color.palette.gray.',
        fix: 'Rename it. Expected a palette step such as "50", "500" or "base".',
      },
    ]);
  });

  it('rejects an oklch lightness above 1', () => {
    const [problem] = problemsOf(testBrand({ 'color.roles.accent': 'oklch(1.5 0.2 250)' }));
    expect(problem?.path).toBe('color.roles.accent');
  });

  it('rejects numbers that are not finite or are outside their range in every numeric field', () => {
    for (const [path, value] of [
      ['typography.scale.body.size', Number.POSITIVE_INFINITY],
      ['typography.scale.body.size', 5000],
      ['typography.scale.body.lineHeight', Number.NaN],
      ['typography.scale.body.weight', Number.NaN],
      ['typography.scale.body.axes', { wght: Number.POSITIVE_INFINITY }],
      ['shape.radius.md', Number.POSITIVE_INFINITY],
      ['shape.shadow.md', [{ y: Number.NaN, blur: 4, color: 'gray.900' }]],
      ['shape.shadow.md', [{ x: Number.POSITIVE_INFINITY, y: 1, blur: 4, color: 'gray.900' }]],
      ['shape.shadow.md', [{ y: 1, blur: 4, spread: Number.NEGATIVE_INFINITY, color: 'gray.900' }]],
      ['gradients', { dawn: { type: 'linear', angle: Number.NaN, stops: ['gray.0', 'gray.900'] } }],
      [
        'gradients',
        {
          dawn: { type: 'linear', angle: Number.POSITIVE_INFINITY, stops: ['gray.0', 'gray.900'] },
        },
      ],
      ['spacing.margin.x', Number.POSITIVE_INFINITY],
      ['spacing.grid.rows', 0],
      ['spacing.grid.rows', 13],
      ['spacing.grid.rows', 4.5],
      ['spacing.grid.rows', Number.NaN],
      ['logo.variants.primary.aspect', Number.POSITIVE_INFINITY],
      ['logo.clearSpace', Number.POSITIVE_INFINITY],
      ['motion.easings.standard', [0.2, Number.NaN, 0, 1]],
      ['motion.easings.standard', [0.2, Number.POSITIVE_INFINITY, 0, 1]],
      ['chrome.progress.thickness', Number.POSITIVE_INFINITY],
    ] as const) {
      const problems = problemsOf(testBrand({ [path]: value }));
      expect(problems.length, path).toBeGreaterThan(0);
    }
  });

  it('accepts an optional integer spacing.grid.rows in 1..12 and explains invalid values', () => {
    expect(Result.isSuccess(decodeBrand(testBrand({ 'spacing.grid.rows': 1 })))).toBe(true);
    expect(Result.isSuccess(decodeBrand(testBrand({ 'spacing.grid.rows': 8 })))).toBe(true);
    expect(Result.isSuccess(decodeBrand(testBrand({ 'spacing.grid.rows': 12 })))).toBe(true);

    for (const invalid of [0, 13, 4.5]) {
      const [problem] = problemsOf(testBrand({ 'spacing.grid.rows': invalid }));
      expect(problem?.path).toBe('spacing.grid.rows');
      expect(problem?.fix).toContain('rows: 6');
    }
  });
});
