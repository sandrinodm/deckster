import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { matchingVariants, slideBudget } from '@deckster/engine/layout';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import { LIMIT_CASES } from '#layouts/limit-cases.ts';
import {
  GIANT_STATEMENT_MAX_WORDS,
  statementLayoutContract,
} from '#layouts/statement-layout.contract.ts';

/**
 * Decodes frontmatter as the build does: the fields every slide has plus the statement layout's.
 *
 * @param frontmatter - The slide's fields without `layout`.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...statementLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'statement', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('a giant statement', () => {
  it('is asked for with size: giant, and is otherwise left out', () => {
    expect(decode({})).not.toHaveProperty('size');
    expect(decode({ size: 'giant', align: 'center' })).toMatchObject({ size: 'giant' });
    expect(() => decode({ size: 'huge' })).toThrow('"giant"');
  });

  it('holds the statement to a handful of words, naming the option to drop for more', () => {
    const giant = { frontmatter: { size: 'giant', align: 'left' }, filled: [] };
    expect(slideBudget(statementLayoutContract, 'body', giant)).toEqual({
      maxWords: GIANT_STATEMENT_MAX_WORDS,
    });
    expect(matchingVariants(statementLayoutContract, giant)[0]?.name).toContain('leave `size` out');
    const plain = { frontmatter: { align: 'left' }, filled: [] };
    expect(slideBudget(statementLayoutContract, 'body', plain)).toEqual({ maxWords: 24 });
  });

  it('has limit cases from the left and centred', () => {
    const names = (LIMIT_CASES['statement'] ?? []).map((limitCase) => limitCase.name);
    expect(names).toEqual(expect.arrayContaining(['giant-left', 'giant-center']));
  });
});
