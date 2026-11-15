import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  defineLayoutContract,
  matchingVariants,
  slideBudget,
  variantApplies,
} from '#contract/layout-contract.ts';

const contract = defineLayoutContract({
  name: 'split',
  description: 'Text beside media.',
  schema: Schema.Struct({
    ratio: Schema.String,
    items: Schema.optionalKey(Schema.Array(Schema.Number)),
  }),
  slots: { aside: { description: 'A fact.', accepts: ['text'] } },
  budget: { body: { maxWords: 60, maxBullets: 4, maxLines: 9 } },
  variants: [
    { name: 'narrow', when: { fields: { ratio: '5:7' } }, budget: { body: { maxWords: 30 } } },
    {
      name: 'with aside',
      when: { filled: ['aside'] },
      budget: { body: { maxWords: 40, maxLines: 7 } },
    },
    { name: 'three items', when: { counts: { items: 3 } }, budget: { aside: { maxWords: 10 } } },
  ],
  example: { frontmatter: { ratio: '1:1' }, body: 'x\n' },
});

describe('variantApplies', () => {
  it('holds when every field, count and filled slot it names holds', () => {
    const slide = { frontmatter: { ratio: '5:7', items: [1, 2, 3] }, filled: ['aside'] };
    expect(
      variantApplies({ fields: { ratio: '5:7' }, counts: { items: 3 }, filled: ['aside'] }, slide),
    ).toBe(true);
    expect(variantApplies({ fields: { ratio: '1:1' } }, slide)).toBe(false);
    expect(variantApplies({ counts: { items: 2 } }, slide)).toBe(false);
    expect(variantApplies({ filled: ['caption'] }, slide)).toBe(false);
    expect(variantApplies({}, slide)).toBe(true);
  });

  it('holds for a count range when the list length is within it, ends included', () => {
    const slide = { frontmatter: { items: [1, 2, 3] }, filled: [] };
    expect(variantApplies({ counts: { items: { min: 3, max: 5 } } }, slide)).toBe(true);
    expect(variantApplies({ counts: { items: { min: 1, max: 3 } } }, slide)).toBe(true);
    expect(variantApplies({ counts: { items: { min: 4 } } }, slide)).toBe(false);
    expect(variantApplies({ counts: { items: { max: 2 } } }, slide)).toBe(false);
  });
});

describe('slideBudget', () => {
  it('is the base budget when no variant matches', () => {
    const slide = { frontmatter: { ratio: '1:1' }, filled: [] };
    expect(slideBudget(contract, 'body', slide)).toEqual({
      maxWords: 60,
      maxBullets: 4,
      maxLines: 9,
    });
    expect(matchingVariants(contract, slide)).toEqual([]);
  });

  it('takes the tightest limit of every matching variant', () => {
    const slide = { frontmatter: { ratio: '5:7' }, filled: ['aside'] };
    expect(slideBudget(contract, 'body', slide)).toEqual({
      maxWords: 30,
      maxBullets: 4,
      maxLines: 7,
    });
    expect(matchingVariants(contract, slide).map((variant) => variant.name)).toEqual([
      'narrow',
      'with aside',
    ]);
  });

  it('budgets a slot only a variant names', () => {
    const slide = { frontmatter: { ratio: '1:1', items: [1, 2, 3] }, filled: [] };
    expect(slideBudget(contract, 'aside', slide)).toEqual({ maxWords: 10 });
    expect(slideBudget(contract, 'caption', slide)).toEqual({});
  });
});
