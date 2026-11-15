import { Effect } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import { resolveBrand } from '#resolve/resolve-brand.ts';
import { typeScaleFacts } from '#resolve/type-scale-facts.ts';
import { testBrand } from '#test-brand.fixture.ts';
import { decodeBrand } from '#validate/decode-brand.ts';

describe('chart tokens', () => {
  it('default every chart style from the roles, strokes and type scale', () => {
    const { tokens } = Effect.runSync(resolveBrand(testBrand()));
    expect(tokens.charts).toEqual({
      grid: { show: true, color: 'border', stroke: 1, dash: 'solid' },
      axis: { show: true, color: 'muted', stroke: 1, dash: 'solid', ticks: false },
      labels: {
        axis: 'caption',
        value: 'small',
        legend: 'caption',
        annotation: 'caption',
        color: 'muted',
      },
      numbers: {
        locale: 'en-US',
        notation: 'compact',
        currency: 'USD',
        maximumFractionDigits: 1,
        signDisplay: 'exceptZero',
      },
      stat: { step: 'stat', label: 'caption', color: 'heading' },
      table: { header: 'label', body: 'small', emphasis: 'fill', rule: 1, zebra: false },
    });
    expect(Object.keys(tokens.surfaces.default!.charts)).toEqual([
      'grid',
      'axis',
      'label',
      'value',
      'stat',
      'emphasis',
      'emphasis-fg',
      'zebra',
    ]);
  });

  it('take the brand’s choices and resolve their roles on each surface', () => {
    const { tokens } = Effect.runSync(
      resolveBrand(
        testBrand({
          charts: {
            grid: { color: 'muted', stroke: 'bold', dash: 'dotted' },
            numbers: { locale: 'de-DE', currency: 'EUR', notation: 'standard' },
            table: { emphasis: 'text' },
          },
        }),
      ),
    );
    expect(tokens.charts.grid).toEqual({ show: true, color: 'muted', stroke: 4, dash: 'dotted' });
    expect(tokens.charts.numbers).toMatchObject({ locale: 'de-DE', currency: 'EUR' });
    expect(tokens.surfaces.default?.charts.grid).toBe(tokens.surfaces.default?.roles.muted);
  });

  it('reject a locale Intl does not know and a currency that is not ISO 4217', () => {
    const decoded = decodeBrand(
      testBrand({ charts: { numbers: { locale: 'not a locale', currency: 'usd' } } }),
    );
    expect(decoded._tag).toBe('Failure');
    const problems = decoded._tag === 'Failure' ? decoded.failure : [];
    expect(problems.map((problem) => problem.path)).toEqual([
      'charts.numbers.locale',
      'charts.numbers.currency',
    ]);
  });
});

describe('typeScaleFacts', () => {
  it('lists the minimum, the large-text sizes and the brand’s scale', () => {
    const { tokens } = Effect.runSync(resolveBrand(testBrand()));
    const facts = typeScaleFacts(tokens.typography.scale);
    expect(facts.minimum).toBe(20);
    expect(facts.largeText).toEqual({ size: 24, boldSize: 18.66, boldWeight: 700 });
    expect(facts.smallest).toEqual({ step: 'caption', size: 20 });
    expect(facts.sizes).toEqual([20, 24, 26, 32, 38, 48, 60, 80, 140, 160]);
    expect(facts.steps.label).toEqual({ size: 20, weight: 600, large: false });
    expect(facts.steps.small).toEqual({ size: 24, weight: 400, large: true });
  });
});
