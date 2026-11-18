import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  DO_DONT_ITEM_MAX_CHARS,
  DO_DONT_LABEL_MAX_CHARS,
  doDontLayoutContract,
} from '#layouts/do-dont-layout.contract.ts';

/**
 * Two short examples per side, with the optional fields left out.
 */
const EXAMPLES = {
  do: ['Water the soil slowly', 'Keep the trunk clear'],
  dont: ['Spray the leaves', 'Heap mulch on the bark'],
};

/**
 * Decodes all slide fields and refuses fields the contract does not declare.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...doDontLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'do-dont', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the do-dont layout contract', () => {
  it('takes two to four examples independently on each side', () => {
    for (const field of ['do', 'dont']) {
      expect(() => decode({ ...EXAMPLES, [field]: ['One'] })).toThrow('at least 2 examples');
      expect(() => decode({ ...EXAMPLES, [field]: Array(5).fill('One') })).toThrow(
        'at most 4 examples',
      );
      expect(() => decode({ ...EXAMPLES, [field]: Array(4).fill('One') })).not.toThrow();
      expect(() => decode({ ...EXAMPLES, [field]: ['', 'Two'] })).toThrow(field);
    }
  });

  it("defaults the headings to Do and Don't, chrome on, and no reveal", () => {
    expect(decode(EXAMPLES)).toMatchObject({
      labels: { do: 'Do', dont: "Don't" },
      chrome: true,
      reveal: false,
    });
    expect(
      decode({ ...EXAMPLES, labels: { do: 'Follow', dont: 'Avoid' }, reveal: true, chrome: false }),
    ).toMatchObject({ labels: { do: 'Follow', dont: 'Avoid' }, reveal: true, chrome: false });
    expect(decode({ ...EXAMPLES, labels: { do: 'Follow' } })).toMatchObject({
      labels: { do: 'Follow', dont: "Don't" },
    });
    expect(() => decode({ ...EXAMPLES, doLabel: 'Old' })).toThrow('excess');
    expect(() => decode({ ...EXAMPLES, reveal: 'pairs' })).toThrow('reveal');
    expect(() => decode({ ...EXAMPLES, highlight: 1 })).toThrow('highlight');
  });

  it('accepts the character boundary and refuses one beyond it', () => {
    for (const field of ['do', 'dont']) {
      expect(() =>
        decode({ ...EXAMPLES, [field]: ['x'.repeat(DO_DONT_ITEM_MAX_CHARS), 'Two'] }),
      ).not.toThrow();
      expect(() =>
        decode({ ...EXAMPLES, [field]: ['x'.repeat(DO_DONT_ITEM_MAX_CHARS + 1), 'Two'] }),
      ).toThrow(`at most ${DO_DONT_ITEM_MAX_CHARS} characters`);
    }

    for (const field of ['do', 'dont']) {
      expect(() =>
        decode({ ...EXAMPLES, labels: { [field]: 'x'.repeat(DO_DONT_LABEL_MAX_CHARS) } }),
      ).not.toThrow();
      expect(() =>
        decode({ ...EXAMPLES, labels: { [field]: 'x'.repeat(DO_DONT_LABEL_MAX_CHARS + 1) } }),
      ).toThrow(`at most ${DO_DONT_LABEL_MAX_CHARS} characters`);
      expect(() => decode({ ...EXAMPLES, labels: { [field]: '' } })).toThrow(field);
    }
  });

  it('maps to a PowerPoint two-content slide with the title and the line of context', () => {
    expect(doDontLayoutContract.pptx).toMatchObject({
      type: 'two-content',
      placeholders: [{ kind: 'title' }, { kind: 'body' }],
    });
  });
});
