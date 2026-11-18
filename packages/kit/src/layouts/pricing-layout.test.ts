import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { fieldLimitBreaches, slideFieldLimits } from '@deckster/engine/layout';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  PLAN_FEATURE_MAX_CHARS_IN_FOUR,
  PLAN_PRICE_MAX_CHARS,
  pricingLayoutContract,
  pricingProblems,
} from '#layouts/pricing-layout.contract.ts';

/**
 * A complete plan.
 */
const PLAN = {
  name: 'Hub plan',
  price: '€2.90',
  period: 'a drop',
  description: 'For steady daily volume',
  features: ['€190 a month', '500 drops minimum'],
};

/**
 * Decodes frontmatter as the build does: the fields every slide has plus the pricing layout's.
 *
 * @param frontmatter - The slide's fields without `layout`.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...pricingLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'pricing', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the pricing layout contract', () => {
  it('takes two to four plans of two to four features', () => {
    expect(() => decode({ plans: [PLAN, PLAN] })).not.toThrow();
    expect(() => decode({ plans: [PLAN] })).toThrow('at least 2 plans');
    expect(() => decode({ plans: [PLAN, PLAN, PLAN, PLAN, PLAN] })).toThrow('at most 4 plans');
    expect(() => decode({ plans: [{ ...PLAN, features: ['One'] }, PLAN] })).toThrow(
      'at least 2 features',
    );
    expect(() => decode({ plans: [{ ...PLAN, features: Array(5).fill('x') }, PLAN] })).toThrow(
      'at most 4 features',
    );
  });

  it('takes a price as a number or as a figure of a few characters', () => {
    const plans = [
      { ...PLAN, price: 900 },
      { ...PLAN, price: 'Free' },
    ];
    expect(decode({ plans })).toMatchObject({ plans: [{ price: 900 }, { price: 'Free' }] });
    expect(() =>
      decode({ plans: [{ ...PLAN, price: 'x'.repeat(PLAN_PRICE_MAX_CHARS + 1) }, PLAN] }),
    ).toThrow(`at most ${PLAN_PRICE_MAX_CHARS} characters`);
  });

  it('badges the recommended plan "Recommended" unless the slide names its own badge', () => {
    const plans = [PLAN, { ...PLAN, recommended: true }];
    expect(decode({ plans })).toMatchObject({ badge: 'Recommended', reveal: false, chrome: true });
    expect(decode({ plans, badge: 'Most merchants' })).toMatchObject({ badge: 'Most merchants' });
  });

  it('recommends at most one plan', () => {
    const decoded = Schema.decodeUnknownSync(pricingLayoutContract.schema)({
      plans: [
        { ...PLAN, recommended: true },
        { ...PLAN, recommended: true },
      ],
    });
    expect(pricingLayoutContract.checks?.(decoded)).toHaveLength(1);
    expect(pricingProblems([PLAN, { ...PLAN, recommended: true }])).toEqual([]);
    expect(
      pricingProblems([
        { ...PLAN, recommended: true },
        { ...PLAN, recommended: true },
      ]),
    ).toEqual([expect.objectContaining({ path: 'plans' })]);
  });

  it('holds four plans to shorter features, on a variant the build checks', () => {
    const feature = 'x'.repeat(PLAN_FEATURE_MAX_CHARS_IN_FOUR + 1);
    const plans = Array.from({ length: 4 }, () => ({ ...PLAN, features: [feature, 'Short'] }));
    const limits = slideFieldLimits(pricingLayoutContract, { frontmatter: { plans }, filled: [] });
    expect(fieldLimitBreaches({ plans }, limits)).toHaveLength(4);
    const three = plans.slice(0, 3);
    expect(
      fieldLimitBreaches(
        { plans: three },
        slideFieldLimits(pricingLayoutContract, { frontmatter: { plans: three }, filled: [] }),
      ),
    ).toEqual([]);
  });

  it('maps to a PowerPoint title-only slide with the title and the line of context', () => {
    expect(pricingLayoutContract.pptx).toMatchObject({
      type: 'title-only',
      placeholders: [{ kind: 'title' }, { kind: 'body' }],
    });
  });
});
