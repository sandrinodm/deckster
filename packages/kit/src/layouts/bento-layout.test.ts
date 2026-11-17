import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { fieldLimitBreaches, slideFieldLimits } from '@deckster/engine/layout';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  bentoLayoutContract,
  bentoProblems,
  tileKind,
  TILE_LABEL_MAX_CHARS_CROWDED,
} from '#layouts/bento-layout.contract.ts';

/**
 * A figure, a text and a picture tile, each complete.
 */
const TILES = [
  { value: '−2.8 °C', label: 'cooler at 3 p.m.' },
  { icon: 'trees', title: '1,240 trees', text: 'Planted on 38 blocks.' },
  { src: 'assets/square.jpg', alt: 'Benches under plane trees' },
];

/**
 * Decodes frontmatter as the build does: the fields every slide has plus the bento layout's.
 *
 * @param frontmatter - The slide's fields without `layout`.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...bentoLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'bento', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the bento layout contract', () => {
  it('takes three to five tiles', () => {
    expect(() => decode({ tiles: TILES })).not.toThrow();
    expect(() => decode({ tiles: TILES.slice(0, 2) })).toThrow('at least 3 tiles');
    expect(() => decode({ tiles: [...TILES, ...TILES] })).toThrow('at most 5 tiles');
  });

  it('tells a tile kind from the field it sets', () => {
    expect(TILES.map((tile) => tileKind(tile))).toEqual(['figure', 'text', 'picture']);
  });

  it('holds each tile to one kind with the fields that kind needs', () => {
    expect(bentoProblems(TILES)).toEqual([]);
    const problems = bentoProblems([
      { value: '38%' },
      { title: 'Shade', src: 'assets/a.jpg' },
      { src: 'assets/a.jpg' },
      { title: 'Shade', label: 'a figure label' },
      {},
    ]);
    expect(problems.map((problem) => problem.path)).toEqual([
      'tiles[0].label',
      'tiles[1]',
      'tiles[2].alt',
      'tiles[3].label',
      'tiles[4]',
    ]);
    expect(problems[1]?.message).toContain('more than one');
    expect(problems[4]?.message).toContain('none');
  });

  it('takes a treatment on a picture tile and refuses it on the other kinds', () => {
    const screenshot = { src: 'assets/screen.png', alt: 'The dispatch screen', treatment: 'plain' };
    expect(() => decode({ tiles: [...TILES.slice(0, 2), screenshot] })).not.toThrow();
    expect(bentoProblems([...TILES.slice(0, 2), screenshot])).toEqual([]);
    const problems = bentoProblems([{ ...TILES[1], treatment: 'plain' }, ...TILES.slice(1)]);
    expect(problems.map((problem) => problem.path)).toEqual(['tiles[0].treatment']);
  });

  it('runs its checks on the decoded frontmatter', () => {
    expect(
      bentoLayoutContract.checks?.({
        tiles: [{ value: 1 }, ...TILES],
        reveal: false,
        chrome: true,
      }),
    ).toEqual([expect.objectContaining({ path: 'tiles[0].label' })]);
  });

  it('holds labels to the narrow tiles once four tiles share the slide', () => {
    const label = 'x'.repeat(TILE_LABEL_MAX_CHARS_CROWDED + 1);
    const three = [{ value: '1', label }, ...TILES.slice(1)];
    const four = [...three, { value: '2', label: 'short' }];
    const limits = (tiles: readonly unknown[]) =>
      slideFieldLimits(bentoLayoutContract, { frontmatter: { tiles }, filled: [] });
    expect(fieldLimitBreaches({ tiles: three }, limits(three))).toEqual([]);
    expect(fieldLimitBreaches({ tiles: four }, limits(four)).map((breach) => breach.path)).toEqual([
      'tiles[0].label',
    ]);
  });

  it('stays on the default surface, with the lead on the accent surface it paints itself', () => {
    expect(bentoLayoutContract.surface).toBeUndefined();
    expect(decode({ tiles: TILES })).toMatchObject({ reveal: false, chrome: true });
  });
});
