import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { BODY_SLOT } from '@deckster/engine/slots';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import catalog from '#catalog.ts';
import { codeLayoutContract } from '#layouts/code-layout.contract.ts';

/**
 * Decodes frontmatter as the build does: the fields every slide has plus the code layout's.
 *
 * @param frontmatter - The slide's fields without `layout`.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({ ...SlideFrontmatter.fields, ...codeLayoutContract.schema.fields });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'code', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the code layout contract', () => {
  it('is in the kit catalog', () => {
    expect(catalog.layouts.map((contract) => contract.name)).toContain('code');
  });

  it('says when to use it, with the line and column guidance', () => {
    expect(codeLayoutContract.description).toContain('12 lines');
    expect(codeLayoutContract.description).toContain('60 columns');
  });

  it('has an example whose frontmatter decodes and which fills the aside', () => {
    expect(() => decode(codeLayoutContract.example.frontmatter)).not.toThrow();
    expect(codeLayoutContract.example.body).toContain('<Aside>');
    expect(codeLayoutContract.example.body).toContain('```ts');
  });

  it('budgets only its own slots, in lines for the code', () => {
    const slots = new Set([...Object.keys(codeLayoutContract.slots), BODY_SLOT]);
    for (const slot of Object.keys(codeLayoutContract.budget)) {
      expect(slots.has(slot), slot).toBe(true);
    }

    expect(codeLayoutContract.budget['body']?.maxLines).toBeGreaterThan(0);
  });

  it('shows the page chrome by default, and accepts nothing it does not declare', () => {
    expect(decode({})).toMatchObject({ chrome: true });
    expect(() => decode({ colour: 'red' })).toThrow('Expected no excess property');
  });
});
