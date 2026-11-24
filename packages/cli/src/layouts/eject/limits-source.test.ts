import { describe, expect, it } from '@effect/vitest';

import { limitsSource } from '#layouts/eject/limits-source.ts';

/**
 * The lines of a printed `limits.ts` from its default export on.
 *
 * @param source - The module's text.
 */
function exportLines(source: string): string[] {
  const lines = source.split('\n');
  return lines.slice(lines.findIndex((line) => line.startsWith('export default')));
}

describe('limitsSource', () => {
  it('prints short cases on one line and imports only the type', () => {
    const source = limitsSource([{ name: 'full-body', frontmatter: {}, filled: [] }]);
    expect(source.startsWith("import type { LimitCase } from '@deckster/kit/limit-cases';\n")).toBe(
      true,
    );
    expect(exportLines(source)).toEqual([
      "export default [{ name: 'full-body', frontmatter: {}, filled: [] }] satisfies readonly LimitCase[];",
      '',
    ]);
  });

  it('prints an empty list for a layout without cases', () => {
    expect(exportLines(limitsSource([]))).toEqual([
      'export default [] satisfies readonly LimitCase[];',
      '',
    ]);
  });

  it('breaks lists of objects, quotes as the formatter does and moves long strings down', () => {
    const long = 'x'.repeat(90);
    const source = limitsSource([
      {
        name: 'one',
        frontmatter: { 'data-x': "it's", say: '"hi"', lines: 'a\nb', photo: long, alt: long },
        filled: ['media'],
        body: false,
      },
      { name: 'two', frontmatter: { count: 3, on: true, none: null }, filled: [] },
    ]);
    expect(exportLines(source)).toEqual([
      'export default [',
      '  {',
      "    name: 'one',",
      '    frontmatter: {',
      `      'data-x': "it's",`,
      `      say: '"hi"',`,
      "      lines: 'a\\nb',",
      '      photo:',
      `        '${long}',`,
      `      alt: '${long}',`,
      '    },',
      "    filled: ['media'],",
      '    body: false,',
      '  },',
      "  { name: 'two', frontmatter: { count: 3, on: true, none: null }, filled: [] },",
      '] satisfies readonly LimitCase[];',
      '',
    ]);
  });
});
