import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  ASK_AMOUNT_MAX_CHARS,
  askLayoutContract,
  fundsProblems,
} from '#layouts/ask-layout.contract.ts';
import { LIMIT_CASES } from '#layouts/limit-cases.ts';

/**
 * An ask with two milestones, complete.
 */
const ASK = {
  amount: '$2.4M',
  milestones: [
    { text: '1,600 street trees planted', by: 'Autumn 2027' },
    { text: 'Canopy up from 9% to 14%', by: 2029 },
  ],
};

/**
 * Decodes frontmatter as the build does: the fields every slide has plus the ask layout's.
 *
 * @param frontmatter - The slide's fields without `layout`.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...askLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'ask', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the ask layout contract', () => {
  it('takes one amount and two to four milestones, a date as text or a year', () => {
    expect(decode(ASK)).toMatchObject({ reveal: false, milestones: [{}, { by: 2029 }] });
    expect(() => decode({ ...ASK, milestones: ASK.milestones.slice(0, 1) })).toThrow(
      'at least 2 milestones',
    );
    expect(() =>
      decode({ ...ASK, milestones: [...ASK.milestones, ...ASK.milestones, {}] }),
    ).toThrow('milestones');
    expect(() => decode({ milestones: ASK.milestones })).toThrow('amount');
  });

  it('holds the amount to one figure of a few characters', () => {
    expect(() => decode({ ...ASK, amount: '$1.8M to $2.4M' })).toThrow(
      `at most ${ASK_AMOUNT_MAX_CHARS} characters`,
    );
  });

  it('takes two to five allocations, each a share in percent', () => {
    const funds = [
      { label: 'Crews', share: 60 },
      { label: 'Stock', share: 40 },
    ];
    expect(() => decode({ ...ASK, funds })).not.toThrow();
    expect(() => decode({ ...ASK, funds: funds.slice(0, 1) })).toThrow('at least 2 allocations');
    expect(() => decode({ ...ASK, funds: [{ label: 'Crews', share: 0 }, funds[1]] })).toThrow(
      'share in percent',
    );
  });

  it('wants the shares to add up to 100, allowing for rounding', () => {
    expect(fundsProblems(undefined)).toEqual([]);
    const thirds = [1, 2, 3].map((index) => ({ label: `Part ${index}`, share: 33.3 }));
    expect(fundsProblems(thirds)).toEqual([]);
    const short = [
      { label: 'Crews', share: 50 },
      { label: 'Stock', share: 40 },
    ];
    const [problem] = fundsProblems(short);
    expect(problem?.path).toBe('funds');
    expect(problem?.message).toBe('The shares add up to 90, not 100.');
    expect(problem?.fix).toContain('add up to 100');
  });

  it('holds its limit cases to their own checks', () => {
    const cases = LIMIT_CASES['ask'] ?? [];
    expect(cases.length).toBeGreaterThan(0);
    for (const limit of cases) {
      const frontmatter = decode({ title: 'Limits', ...limit.frontmatter }) as {
        funds?: Parameters<typeof fundsProblems>[0];
      };
      expect(fundsProblems(frontmatter.funds)).toEqual([]);
    }
  });
});
