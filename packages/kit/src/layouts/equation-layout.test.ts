import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import catalog from '#catalog.ts';
import {
  EQUATION_LABEL_MAX_CHARS,
  equationLayoutContract,
  equationProblems,
} from '#layouts/equation-layout.contract.ts';
import { LIMIT_CASES } from '#layouts/limit-cases.ts';

/**
 * Two terms and a result, complete.
 */
const EQUATION = {
  terms: [
    { value: '41,800', label: 'street trees' },
    { value: '$96', label: 'a tree a year', op: 'times' },
  ],
  result: { value: '$4.0M', label: 'a year' },
};

/**
 * Decodes frontmatter as the build does: the fields every slide has plus the equation layout's.
 *
 * @param frontmatter - The slide's fields without `layout`.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...equationLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'equation', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the equation layout contract', () => {
  it('takes two to four terms and a result', () => {
    const [first, second] = EQUATION.terms;
    expect(() => decode(EQUATION)).not.toThrow();
    expect(() => decode({ ...EQUATION, terms: [first] })).toThrow('at least 2 terms');
    expect(() => decode({ ...EQUATION, terms: [first, second, second, second, second] })).toThrow(
      'at most 4 terms',
    );
    expect(() => decode({ terms: EQUATION.terms })).toThrow('result');
  });

  it('names operators in words and takes figures as numbers or text', () => {
    expect(
      decode({ ...EQUATION, terms: [{ value: 600, label: 'trees' }, EQUATION.terms[1]] }),
    ).toMatchObject({ reveal: false, terms: [{ value: 600 }, { op: 'times' }] });
    expect(() =>
      decode({ ...EQUATION, terms: [EQUATION.terms[0], { value: 2, label: 'x', op: '×' }] }),
    ).toThrow('op');
  });

  it('holds a term label to three lines of the narrowest term', () => {
    const label = 'x'.repeat(EQUATION_LABEL_MAX_CHARS + 1);
    expect(() => decode({ ...EQUATION, terms: [{ value: 1, label }, EQUATION.terms[1]] })).toThrow(
      `at most ${EQUATION_LABEL_MAX_CHARS} characters`,
    );
  });

  it('wants an operator on every term but the first', () => {
    expect(equationProblems(EQUATION.terms as never)).toEqual([]);
    const problems = equationProblems([
      { value: 1, label: 'a', op: 'plus' },
      { value: 2, label: 'b' },
      { value: 3, label: 'c', op: 'divide' },
    ]);
    expect(problems.map((problem) => problem.path)).toEqual(['terms[0].op', 'terms[1].op']);
    expect(problems[1]?.fix).toContain('op: times');
  });

  it('says when to use it, with an example that decodes and has notes', () => {
    expect(equationLayoutContract.description.length).toBeGreaterThan(200);
    expect(equationLayoutContract.description).toMatch(/\buse\b/iu);
    expect(() => decode(equationLayoutContract.example.frontmatter)).not.toThrow();
    expect(equationLayoutContract.example.body).toContain('<Notes>');
    expect(equationLayoutContract.example.body).not.toMatch(/src=["'{]/u);
  });

  it('rejects a field it does not have', () => {
    expect(() => decode({ ...EQUATION, colour: 'red' })).toThrow('Expected no excess property');
  });

  it('follows stats in the catalog, maps to PowerPoint and has limit cases', () => {
    const names = catalog.layouts.map((layout) => layout.name);
    expect(names[names.indexOf('stats') + 1]).toBe('equation');
    expect(equationLayoutContract.pptx?.placeholders.length ?? 0).toBeGreaterThan(0);
    const cases = LIMIT_CASES['equation'] ?? [];
    expect(cases.map((limit) => limit.name)).toEqual(['2-terms', '3-terms', '4-terms']);
    for (const limit of cases) {
      const frontmatter = decode({ title: 'Limits', ...limit.frontmatter }) as {
        terms: Parameters<typeof equationProblems>[0];
      };
      expect(equationProblems(frontmatter.terms)).toEqual([]);
    }
  });
});
