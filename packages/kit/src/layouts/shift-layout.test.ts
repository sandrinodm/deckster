import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import { shiftLayoutContract, SHIFT_HEADING_MAX_CHARS } from '#layouts/shift-layout.contract.ts';

/**
 * Decodes frontmatter as the build does: the fields every slide has plus the shift layout's.
 *
 * @param frontmatter - The slide's fields without `layout`.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...shiftLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'shift', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the shift layout contract', () => {
  it('needs both states, each with a heading', () => {
    expect(() => decode({ from: { title: 'Pears' }, to: { title: 'Planes' } })).not.toThrow();
    expect(() => decode({ from: { title: 'Pears' } })).toThrow('to');
    expect(() => decode({ from: { title: 'Pears' }, to: { label: 'From 2027' } })).toThrow('title');
  });

  it('holds a heading to two lines of the new state', () => {
    const title = 'x'.repeat(SHIFT_HEADING_MAX_CHARS + 1);
    expect(() => decode({ from: { title: 'Pears' }, to: { title } })).toThrow(
      `at most ${SHIFT_HEADING_MAX_CHARS} characters`,
    );
  });

  it('takes a figure as a number or as text, and shows both states at once by default', () => {
    expect(
      decode({ from: { title: 'Wait', value: 14 }, to: { title: 'Wait', value: '10 wk' } }),
    ).toMatchObject({ reveal: false, from: { value: 14 }, to: { value: '10 wk' } });
  });

  it('maps to a PowerPoint two-content slide with the title and the body', () => {
    expect(shiftLayoutContract.pptx?.type).toBe('two-content');
  });
});
