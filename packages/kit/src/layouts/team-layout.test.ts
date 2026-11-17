import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  MAX_FOUNDERS,
  MEMBER_EDGE_MAX_CHARS,
  teamLayoutContract,
} from '#layouts/team-layout.contract.ts';

/**
 * The team layout's frontmatter with the fields every slide has.
 */
const TeamFrontmatter = Schema.Struct({
  ...SlideFrontmatter.fields,
  ...teamLayoutContract.schema.fields,
});

/**
 * Decodes a team as the build does.
 *
 * @param members - The people.
 */
function decode(members: readonly unknown[]): typeof TeamFrontmatter.Type {
  return Schema.decodeUnknownSync(TeamFrontmatter)(
    { layout: 'team', members },
    { onExcessProperty: 'error' },
  );
}

describe('the team layout for founders', () => {
  const FOUNDER = {
    name: 'Dana Okafor',
    role: 'Programme lead',
    edge: 'Ran street works for twelve years',
    previously: [{ name: 'Larkfield City Council', src: 'assets/larkfield.svg' }],
  };
  const PLAIN = { name: 'Lin Zhou', role: 'Crew lead' };

  it('takes two people with an edge and up to three past organisations', () => {
    expect(() => decode([FOUNDER, FOUNDER])).not.toThrow();
    const four = Array.from({ length: 4 }, () => FOUNDER.previously[0]);
    expect(() => decode([{ ...FOUNDER, previously: four }, FOUNDER])).toThrow(
      'at most 3 organisations',
    );
    expect(() =>
      decode([{ ...FOUNDER, edge: 'x'.repeat(MEMBER_EDGE_MAX_CHARS + 1) }, PLAIN]),
    ).toThrow(`at most ${MEMBER_EDGE_MAX_CHARS} characters`);
  });

  it('reports an edge or past organisations on a team too large to show them', () => {
    const four = [FOUNDER, PLAIN, PLAIN, PLAIN];
    expect(four).toHaveLength(MAX_FOUNDERS);
    expect(teamLayoutContract.checks?.(decode(four))).toEqual([]);
    expect(teamLayoutContract.checks?.(decode([...four, PLAIN]))).toMatchObject([
      { path: 'members[0].edge' },
      { path: 'members[0].previously' },
    ]);
  });
});
