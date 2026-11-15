import { Effect } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import { resolveBrand } from '#resolve/resolve-brand.ts';
import { tokenProblems } from '#resolve/token-checks.ts';
import { testBrand } from '#test-brand.fixture.ts';

describe('tokenProblems', () => {
  it('passes the tokens of a valid brand', () => {
    const { tokens } = Effect.runSync(resolveBrand(testBrand()));
    expect(tokenProblems(tokens)).toEqual([]);
  });

  it('names every number that is not finite and every color that is not hex', () => {
    const problems = tokenProblems({
      typography: { scale: { body: { size: Number.POSITIVE_INFINITY } } },
      gradients: { dawn: { angle: Number.NaN, stops: [{ color: '#NaNNaNNaN', at: 0 }] } },
      chrome: { footer: { text: '#1 in the market' } },
    });
    expect(problems.map((problem) => problem.path)).toEqual([
      'typography.scale.body.size',
      'gradients.dawn.angle',
      'gradients.dawn.stops[0].color',
    ]);
  });
});
