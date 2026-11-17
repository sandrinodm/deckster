import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  PROOF_LABEL_MAX_CHARS,
  PROOF_VALUE_MAX_CHARS,
  proofLayoutContract,
} from '#layouts/proof-layout.contract.ts';

/**
 * Decodes frontmatter as the build does: the fields every slide has plus the proof layout's.
 *
 * @param frontmatter - The slide's fields without `layout`.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...proofLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'proof', name: 'Priya Nair', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the proof layout contract', () => {
  const METRIC = { value: '3 days', from: '14 days', label: 'Median wait for a repair' };

  it('takes one to three metrics, each with a figure and a label', () => {
    expect(() => decode({ metrics: [METRIC] })).not.toThrow();
    expect(() => decode({ metrics: [] })).toThrow('at least 1 metric');
    expect(() => decode({ metrics: [METRIC, METRIC, METRIC, METRIC] })).toThrow(
      'at most 3 metrics',
    );
    expect(() => decode({ metrics: [{ value: '92%' }] })).toThrow('label');
  });

  it('holds figures and labels to the panel', () => {
    const value = 'x'.repeat(PROOF_VALUE_MAX_CHARS + 1);
    const label = 'x'.repeat(PROOF_LABEL_MAX_CHARS + 1);
    expect(() => decode({ metrics: [{ ...METRIC, from: value }] })).toThrow(
      `at most ${PROOF_VALUE_MAX_CHARS} characters`,
    );
    expect(() => decode({ metrics: [{ ...METRIC, label }] })).toThrow(
      `at most ${PROOF_LABEL_MAX_CHARS} characters`,
    );
  });

  it('takes figures as numbers or text, a logo without a file, and shows everything at once', () => {
    expect(
      decode({
        metrics: [{ value: 11, from: 37, label: 'Heat calls' }],
        logo: { name: 'Holloway Housing' },
      }),
    ).toMatchObject({ reveal: false, metrics: [{ value: 11, from: 37 }] });
  });

  it('needs the quote in the body and maps to a PowerPoint two-content slide', () => {
    expect(proofLayoutContract.slots.body.required).toBe(true);
    expect(proofLayoutContract.pptx?.type).toBe('two-content');
  });
});
