import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  QUADRANTS_HIGHLIGHT_LABEL_MAX_CHARS,
  QUADRANT_ITEM_MAX_CHARS,
  QUADRANT_TITLE_MAX_CHARS,
  quadrantsLayoutContract,
} from '#layouts/quadrants-layout.contract.ts';

/**
 * A box whose content can be varied independently by each test.
 */
const BOX = { title: 'Keep', items: ['Water for three summers'] };

/**
 * A complete board in reading order.
 */
const BOXES = [
  BOX,
  { ...BOX, title: 'Stop' },
  { ...BOX, title: 'Start' },
  { ...BOX, title: 'Try' },
];

/**
 * Decodes the slide fields and the layout fields together, rejecting excess properties.
 *
 * @param frontmatter - The fields without a layout name.
 */
function decode(frontmatter: Record<string, unknown>) {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...quadrantsLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'quadrants', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the quadrants layout contract', () => {
  it('requires exactly four boxes with one to four bullets each', () => {
    expect(() => decode({ quadrants: BOXES })).not.toThrow();
    expect(() => decode({ quadrants: BOXES.slice(0, 3) })).toThrow('exactly 4 quadrants');
    expect(() => decode({ quadrants: [...BOXES, BOX] })).toThrow('exactly 4 quadrants');
    expect(() => decode({ quadrants: [{ ...BOX, items: [] }, ...BOXES.slice(1)] })).toThrow(
      'at least 1 item',
    );
    expect(() =>
      decode({ quadrants: [{ ...BOX, items: Array(5).fill('One') }, ...BOXES.slice(1)] }),
    ).toThrow('at most 4 items');
    expect(() =>
      decode({ quadrants: BOXES.map((box) => ({ ...box, items: Array(4).fill('One') })) }),
    ).not.toThrow();
  });

  it('limits headings and bullets at the schema boundary', () => {
    const atLimit = {
      title: 'x'.repeat(QUADRANT_TITLE_MAX_CHARS),
      items: ['x'.repeat(QUADRANT_ITEM_MAX_CHARS)],
    };
    expect(() => decode({ quadrants: [atLimit, ...BOXES.slice(1)] })).not.toThrow();
    expect(() =>
      decode({ quadrants: [{ ...atLimit, title: atLimit.title + 'x' }, ...BOXES.slice(1)] }),
    ).toThrow(`at most ${QUADRANT_TITLE_MAX_CHARS} characters`);
    expect(() =>
      decode({
        quadrants: [
          { ...BOX, items: ['x'.repeat(QUADRANT_ITEM_MAX_CHARS + 1)] },
          ...BOXES.slice(1),
        ],
      }),
    ).toThrow(`at most ${QUADRANT_ITEM_MAX_CHARS} characters`);
  });

  it('accepts a per-box highlight and rejects the former slide-level number', () => {
    expect(decode({ quadrants: [{ ...BOX, highlight: true }, ...BOXES.slice(1)] })).toMatchObject({
      quadrants: [expect.objectContaining({ highlight: true }), ...BOXES.slice(1)],
    });
    expect(() => decode({ quadrants: [{ ...BOX, highlight: 2 }, ...BOXES.slice(1)] })).toThrow(
      'boolean',
    );
    expect(() => decode({ quadrants: BOXES, highlight: 2 })).toThrow('Expected no excess property');
    expect(() => decode({ quadrants: BOXES, badge: 'Focus' })).toThrow(
      'Expected no excess property',
    );
  });

  it('reports multiple highlighted boxes through the contract checks', () => {
    const decodeFields = Schema.decodeUnknownSync(quadrantsLayoutContract.schema);
    const check = (quadrants: unknown) =>
      quadrantsLayoutContract.checks?.(decodeFields({ quadrants }));
    expect(check(BOXES)).toEqual([]);
    expect(check(BOXES.map((box) => ({ ...box, highlight: false })))).toEqual([]);

    for (let chosen = 0; chosen < BOXES.length; chosen += 1) {
      expect(check(BOXES.map((box, index) => ({ ...box, highlight: index === chosen })))).toEqual(
        [],
      );
    }

    expect(check(BOXES.map((box) => ({ ...box, highlight: true })))).toEqual([
      expect.objectContaining({
        path: 'quadrants',
        message: expect.stringContaining('at most one'),
      }),
    ]);
  });

  it('accepts brand icons and explicit sets but refuses invalid icon names', () => {
    for (const icon of ['leaf', 'tabler:leaf']) {
      expect(() => decode({ quadrants: [{ ...BOX, icon }, ...BOXES.slice(1)] })).not.toThrow();
    }

    expect(() =>
      decode({ quadrants: [{ ...BOX, icon: '../leaf.svg' }, ...BOXES.slice(1)] }),
    ).toThrow('an icon name');
  });

  it('shows chrome and all boxes by default and accepts a reveal', () => {
    expect(decode({ quadrants: BOXES })).toMatchObject({ reveal: false, chrome: true });
    expect(decode({ quadrants: BOXES, reveal: true, chrome: false })).toMatchObject({
      reveal: true,
      chrome: false,
    });
    expect(() => decode({ quadrants: BOXES, current: 2 })).toThrow('Expected no excess property');
  });

  it('demonstrates a highlight and consistently omits icons in the catalog example', () => {
    const { frontmatter } = quadrantsLayoutContract.example;
    const fields = Schema.decodeUnknownSync(quadrantsLayoutContract.schema)(frontmatter);
    expect(fields.quadrants.filter((box) => box.highlight === true)).toHaveLength(1);
    expect(fields.quadrants.every((box) => box.icon === undefined)).toBe(true);
    expect(quadrantsLayoutContract.description).toContain('Four named lists');
    expect(() => decode(frontmatter)).not.toThrow();
  });

  it('keeps the English highlight prefix when labels is omitted', () => {
    expect(decode({ quadrants: BOXES }).labels).toEqual({ highlight: 'Highlighted' });
    expect(decode({ quadrants: BOXES, labels: {} }).labels).toEqual({ highlight: 'Highlighted' });
  });

  it('accepts a highlight label at its limit and refuses one over, naming the limit', () => {
    const limit = QUADRANTS_HIGHLIGHT_LABEL_MAX_CHARS;
    expect(decode({ quadrants: BOXES, labels: { highlight: 'Priorität' } }).labels).toEqual({
      highlight: 'Priorität',
    });
    expect(() =>
      decode({ quadrants: BOXES, labels: { highlight: 'x'.repeat(limit) } }),
    ).not.toThrow();
    expect(() =>
      decode({ quadrants: BOXES, labels: { highlight: 'x'.repeat(limit + 1) } }),
    ).toThrow(`at most ${limit} characters`);
    expect(() => decode({ quadrants: BOXES, labels: { highlight: '' } })).toThrow('highlight');
  });

  it('refuses a label key that does not exist', () => {
    expect(() => decode({ quadrants: BOXES, labels: { keep: 'Behalten' } })).toThrow('keep');
  });

  it('maps to native PowerPoint title and context placeholders', () => {
    expect(quadrantsLayoutContract.pptx).toMatchObject({
      type: 'title-only',
      placeholders: [{ kind: 'title' }, { kind: 'body' }],
    });
  });
});
