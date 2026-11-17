import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { fieldLimitBreaches, slideFieldLimits } from '@deckster/engine/layout';
import { BODY_SLOT } from '@deckster/engine/slots';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import catalog from '#catalog.ts';
import {
  COLUMN_ITEM_MAX_CHARS_IN_FOUR,
  columnsLayoutContract,
} from '#layouts/columns-layout.contract.ts';
import { LIMIT_CASES } from '#layouts/limit-cases.ts';

/**
 * Three columns, each complete.
 */
const COLUMNS = [
  { title: 'Now', note: 'Q1 2027', items: ['Plant the last 300 trees'] },
  { title: 'Next', items: ['Sign up 400 wardens', 'Map every tree'] },
  { title: 'Later', note: '2028', items: ['Extend to Northgate'] },
];

/**
 * Decodes frontmatter as the build does: the fields every slide has plus the columns layout's.
 *
 * @param frontmatter - The slide's fields without `layout`.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...columnsLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'columns', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the columns layout contract', () => {
  it('takes two to four columns of one to four items', () => {
    expect(() => decode({ columns: COLUMNS })).not.toThrow();
    expect(() => decode({ columns: COLUMNS.slice(0, 1) })).toThrow('at least 2 columns');
    expect(() => decode({ columns: [...COLUMNS, ...COLUMNS] })).toThrow('at most 4 columns');
    expect(() => decode({ columns: [{ title: 'Now', items: [] }, ...COLUMNS] })).toThrow(
      'at least 1 item',
    );
    const five = ['a', 'b', 'c', 'd', 'e'];
    expect(() => decode({ columns: [{ title: 'Now', items: five }, ...COLUMNS] })).toThrow(
      'at most 4 items',
    );
  });

  it('marks the current column by number and refuses one past the end', () => {
    expect(decode({ columns: COLUMNS, current: 2 })).toMatchObject({ current: 2, reveal: false });
    expect(() => decode({ columns: COLUMNS, current: 0 })).toThrow('the number of a column');
    expect(columnsLayoutContract.checks?.({ columns: COLUMNS, current: 3 } as never)).toEqual([]);
    expect(columnsLayoutContract.checks?.({ columns: COLUMNS, current: 4 } as never)).toEqual([
      expect.objectContaining({ path: 'current' }),
    ]);
  });

  it('holds the items of a board of four to a quarter of the row', () => {
    const long = 'x'.repeat(COLUMN_ITEM_MAX_CHARS_IN_FOUR + 1);
    const three = [{ title: 'Now', items: [long] }, ...COLUMNS.slice(1)];
    const four = [...three, { title: 'Done', items: ['short'] }];
    const limits = (columns: readonly unknown[]) =>
      slideFieldLimits(columnsLayoutContract, { frontmatter: { columns }, filled: [] });
    expect(fieldLimitBreaches({ columns: three }, limits(three))).toEqual([]);
    expect(
      fieldLimitBreaches({ columns: four }, limits(four)).map((breach) => breach.path),
    ).toEqual(['columns[0].items[0]']);
  });

  it('is listed in the catalog after cards, with an example, notes and limit cases', () => {
    const names = catalog.layouts.map((contract) => contract.name);
    expect(names.indexOf('columns')).toBe(names.indexOf('cards') + 1);
    expect(() => decode(columnsLayoutContract.example.frontmatter)).not.toThrow();
    expect(columnsLayoutContract.example.body).toContain('<Notes>');
    expect(columnsLayoutContract.description.length).toBeGreaterThan(200);
    expect(LIMIT_CASES['columns']?.length).toBe(3);
    expect(Object.keys(columnsLayoutContract.slots)).toEqual(['footnote']);
    expect(columnsLayoutContract.slots).not.toHaveProperty(BODY_SLOT);
  });
});
