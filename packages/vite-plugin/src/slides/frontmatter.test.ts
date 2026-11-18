import { defineLayoutContract } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import type { DeckBuildError } from '#errors.ts';
import type { LayoutCatalogIndex } from '#layouts/load-layout-catalog.ts';

import { TEST_CATALOG } from '#layouts/test-catalog.fixture.ts';
import { readMdxFrontmatter, validateFrontmatter } from '#slides/frontmatter.ts';

const REF = {
  file: '/workspace/decks/demo/slides/intro.mdx',
  displayPath: 'decks/demo/slides/intro.mdx',
};

/**
 * The error an effect fails with; throws when it succeeds.
 */
function failure(effect: Effect.Effect<unknown, DeckBuildError>): DeckBuildError {
  return Effect.runSync(Effect.flip(effect));
}

/**
 * Validates frontmatter against the test catalog.
 */
function validate(data: unknown) {
  return validateFrontmatter(data, TEST_CATALOG, REF);
}

describe('readMdxFrontmatter', () => {
  it('reads no fields from a slide without frontmatter', () => {
    const source = '# Hello\n';
    expect(Effect.runSync(readMdxFrontmatter(source, REF))).toEqual({ data: {}, body: source });
  });

  it('parses the fields and blanks the frontmatter lines so MDX line numbers still match', () => {
    const source = '---\nlayout: split\ntitle: Request flow\nbudget: 1m30s\n---\n# Hello';
    const { data, body } = Effect.runSync(readMdxFrontmatter(source, REF));
    expect(data).toEqual({ layout: 'split', title: 'Request flow', budget: '1m30s' });
    expect(body.split('\n')).toEqual(['', '', '', '', '', '# Hello']);
  });

  it('accepts an empty frontmatter block', () => {
    expect(Effect.runSync(readMdxFrontmatter('---\n---\n# Hi', REF)).data).toEqual({});
  });

  it('names the file and the fix for an unclosed block', () => {
    const error = failure(readMdxFrontmatter('---\nlayout: split\n# Hello', REF));
    expect(error.message).toContain('decks/demo/slides/intro.mdx');
    expect(error.message).toContain('never closed');
    expect(error.message).toContain('Fix: Add a line containing only ---');
  });

  it('reports invalid YAML with its line in the file', () => {
    const error = failure(readMdxFrontmatter('---\nlayout: split\ntitle: [unclosed\n---\n', REF));
    expect(error.message).toMatch(/Line \d+ is not valid YAML/);
    expect(error.message).toContain('Fix: Write one "key: value" field per line');
  });
});

describe('readMdxFrontmatter hostile input', () => {
  it('reports an alias without an anchor as a build error with its line, not a defect', () => {
    const error = failure(readMdxFrontmatter('---\nlayout: split\ntitle: *nope\n---\n', REF));
    expect(error.message).toContain('Line 3 is not valid YAML');
    expect(error.message).toContain('nope');
  });

  it('reports an alias bomb as a build error', () => {
    const rows = ['a: &a [x,x,x,x,x,x,x,x,x,x]'];
    const names = ['a', 'b', 'c', 'd'];
    for (const [i, name] of names.slice(1).entries()) {
      const prev = names[i] ?? 'a';
      rows.push(`${name}: &${name} [${Array(10).fill(`*${prev}`).join(',')}]`);
    }

    const error = failure(
      readMdxFrontmatter(
        `---\n${rows.join('\n')}\ne: [*d,*d,*d,*d,*d,*d,*d,*d,*d,*d,*d]\n---\n`,
        REF,
      ),
    );
    expect(error.message).toContain('not valid YAML');
  });

  it('refuses an own __proto__ key, at any depth', () => {
    const top = failure(readMdxFrontmatter('---\n__proto__:\n  x: 1\n---\n', REF));
    expect(top.message).toContain('__proto__');
    const nested = failure(
      readMdxFrontmatter('---\ntitle: t\nitems:\n  - __proto__: 1\n---\n', REF),
    );
    expect(nested.message).toContain('__proto__');
  });

  it('refuses frontmatter beyond the size cap', () => {
    const big = `---\ntitle: ${'x'.repeat(70 * 1024)}\n---\n`;
    expect(failure(readMdxFrontmatter(big, REF)).message).toContain('more than');
  });
});

describe('validateFrontmatter with names that exist on every object', () => {
  it('treats constructor and toString as unknown fields with a plain fix', () => {
    for (const key of ['constructor', 'toString', 'hasOwnProperty']) {
      const error = failure(validate({ [key]: 'x' }));
      expect(error.message, key).toContain(key);
      expect(error.message, key).not.toContain('function');
      expect(error.message, key).not.toContain('Object]');
    }
  });
});

describe('validateFrontmatter', () => {
  it('applies the default layout and decodes the fields of the layout a slide names', () => {
    expect(Effect.runSync(validate({})).frontmatter).toEqual({ layout: 'default' });
    const split = Effect.runSync(validate({ layout: 'split', ratio: '2:1', title: 'Two' }));
    expect(split.frontmatter).toEqual({ layout: 'split', ratio: '2:1', title: 'Two' });
    expect(split.layout.contract.name).toBe('split');
  });

  it('names an unknown layout and suggests the closest one', () => {
    const error = failure(validate({ layout: 'splitt' }));
    expect(error.message).toBe(
      [
        'Invalid frontmatter in decks/demo/slides/intro.mdx:',
        '  - layout: There is no "splitt" layout.',
        '    Fix: Use "split". Run `pnpm deck layouts` to see what each layout is for.',
      ].join('\n'),
    );
    expect(failure(validate({ layout: 'timeline' })).message).toContain(
      'Fix: Use one of: default, split.',
    );
  });

  it('rejects a field of another layout and says which layouts have it', () => {
    const error = failure(validate({ ratio: '2:1' }));
    expect(error.problems).toEqual([
      {
        message: '"ratio" is not a frontmatter field.',
        fix: 'Remove it, or switch to a layout that has it: split.',
      },
    ]);
  });

  it("reports a layout field's invalid value with the layout's hint", () => {
    const error = failure(validate({ layout: 'split', ratio: '3:1' }));
    expect(error.problems[0]?.fix).toBe('Use `ratio: 1:1` or `ratio: 2:1`.');
  });

  it('suggests the field an unknown key was meant to be', () => {
    const error = failure(validate({ layuot: 'split' }));
    expect(error.message).toBe(
      [
        'Invalid frontmatter in decks/demo/slides/intro.mdx:',
        '  - "layuot" is not a frontmatter field.',
        '    Fix: Rename it to "layout".',
      ].join('\n'),
    );
  });

  it('lists the known fields for an unknown key with no close match', () => {
    const error = failure(validate({ colour: 'red' }));
    expect(error.message).toContain(
      'Fix: Remove it. Known fields: layout, title, surface, background, budget, transition, hidden.',
    );
  });

  it('reports the value given and the field fix for invalid values', () => {
    const error = failure(validate({ layout: 'Split View', budget: 'ninety' }));
    expect(error.problems).toEqual([
      {
        message:
          'layout: Expected a layout name in kebab-case, such as "request-flow", got "Split View".',
        fix: 'Name a layout from `pnpm deck layouts` in kebab-case, for example `layout: default`.',
      },
      {
        message: 'budget: Expected a duration such as "90s", "2m" or "1m30s", got "ninety".',
        fix:
          'Write the speaking time as minutes and seconds, ' +
          'for example `budget: 90s` or `1m30s`.',
      },
    ]);
  });

  it('takes hidden as a boolean and names the fix for any other value', () => {
    expect(Effect.runSync(validate({ hidden: true })).frontmatter.hidden).toBe(true);
    expect(Effect.runSync(validate({})).frontmatter.hidden).toBeUndefined();
    const [problem] = failure(validate({ hidden: 'yes' })).problems;
    expect(problem?.message).toContain('hidden: Expected');
    expect(problem?.fix).toBe(
      'Write `hidden: true` to skip the slide in a talk, or leave the key out.',
    );
  });

  it('takes a transition kind and names the kinds for any other value', () => {
    expect(Effect.runSync(validate({ transition: 'push' })).frontmatter.transition).toBe('push');
    const [problem] = failure(validate({ transition: 'dissolve' })).problems;
    expect(problem?.message).toContain('transition: Expected');
    expect(problem?.fix).toContain('"none", "fade", "slide", "rise", "push", "cover", "wipe" or');
  });

  it('reports wrong types and every problem in one error', () => {
    const error = failure(validate({ title: 42, surfce: 'inverse', budget: '' }));
    expect(error.problems.map((problem) => problem.message)).toEqual([
      '"surfce" is not a frontmatter field.',
      'title: Expected string, got 42.',
      'budget: Expected a duration such as "90s", "2m" or "1m30s", got "".',
    ]);
  });

  it('rejects frontmatter that is not a set of fields', () => {
    const error = failure(validate(['layout', 'split']));
    expect(error.message).toContain('Frontmatter must be a set of fields, got a list.');
  });
});

describe('validateFrontmatter with a layout title contract and nested fields', () => {
  const statsContract = defineLayoutContract({
    name: 'figures',
    description: 'Numbers.',
    schema: Schema.Struct({
      items: Schema.Array(
        Schema.Struct({ value: Schema.String, tone: Schema.optionalKey(Schema.String) }),
      ),
    }),
    title: { required: true, maxChars: 20 },
    slots: {},
    budget: {},
    example: { frontmatter: { title: 'Two', items: [] }, body: 'x\n' },
  });
  const catalog: LayoutCatalogIndex = new Map([
    ...TEST_CATALOG,
    ['figures', { contract: statsContract, source: 'test' }],
  ]);
  const check = (data: unknown) => validateFrontmatter(data, catalog, REF);

  it('requires a title when the layout says so', () => {
    const error = failure(check({ layout: 'figures', items: [] }));
    expect(error.message).toContain('title is required');
  });

  it('rejects a title longer than the layout sets', () => {
    const error = failure(check({ layout: 'figures', title: 'x'.repeat(21), items: [] }));
    expect(error.message).toContain('at most 20 characters, got 21');
  });

  it('rejects a key a nested item does not define, naming its path', () => {
    const items = [{ value: '9%', tones: 'positive' }];
    const error = failure(check({ layout: 'figures', title: 'Two', items }));
    expect(error.message).toContain('items[0].tones is not a field of items[0]');
  });

  it('accepts a slide that keeps to the contract', () => {
    const items = [{ value: '9%', tone: 'positive' }];
    expect(() => Effect.runSync(check({ layout: 'figures', title: 'Two', items }))).not.toThrow();
  });
});

describe('validateFrontmatter on a brand layout', () => {
  const brandLayout = defineLayoutContract({
    name: 'brand-split',
    description: 'A brand layout.',
    schema: Schema.Struct({}),
    slots: { left: { description: 'Left.', accepts: ['bullets'] } },
    budget: {},
    example: { frontmatter: {}, body: '<Left>\n- a\n</Left>\n' },
  });
  const catalog = new Map(TEST_CATALOG).set('brand-split', {
    contract: brandLayout,
    source: 'brand:demo',
    fallback: 'split',
  });

  it('tells the author to accept a field its fallback has in the brand’s layouts.ts', () => {
    const error = failure(
      validateFrontmatter({ layout: 'brand-split', ratio: '2:1' }, catalog, REF),
    );
    const [problem] = error.problems;
    expect(problem?.message).toBe('"ratio" is not a frontmatter field.');
    expect(problem?.fix).toContain("fields: ['ratio']");
    expect(problem?.fix).toContain('brands/demo/layouts.ts');
  });

  it('keeps the usual fix for a field the fallback lacks too', () => {
    const error = failure(
      validateFrontmatter({ layout: 'brand-split', colour: 'red' }, catalog, REF),
    );
    expect(error.problems[0]?.fix).not.toContain('layouts.ts');
  });
});
