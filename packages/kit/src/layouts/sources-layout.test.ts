import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { fieldLimitBreaches, slideFieldLimits } from '@deckster/engine/layout';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  MAX_SOURCES,
  MIN_SOURCES,
  SOURCE_AUTHOR_MAX_CHARS,
  SOURCE_CREDIT_MAX_CHARS_DENSE,
  SOURCE_PUBLISHER_MAX_CHARS,
  SOURCE_TITLE_MAX_CHARS,
  SOURCE_TITLE_MAX_CHARS_DENSE,
  SOURCE_URL_MAX_CHARS,
  SOURCE_YEAR_MAX_CHARS,
  sourcesLayoutContract,
} from '#layouts/sources-layout.contract.ts';

/**
 * A complete citation, including its destination rather than a shortened display label.
 */
const SOURCE = {
  title: 'Eastgate summer heat survey',
  author: 'Dana Okafor',
  publisher: 'Larkfield Council',
  year: '2026',
  url: 'https://larkfield.example/heat?season=summer#results',
};

/**
 * Decodes sources with the common slide fields and refuses unknown fields as the build does.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...sourcesLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'sources', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the sources layout contract', () => {
  it('takes three to eight sources, with only their titles required', () => {
    for (const count of [MIN_SOURCES, MAX_SOURCES]) {
      expect(
        decode({ sources: Array.from({ length: count }, () => ({ title: 'A local study' })) }),
      ).toMatchObject({ chrome: true });
    }

    expect(() => decode({ sources: Array(MIN_SOURCES - 1).fill(SOURCE) })).toThrow(
      'at least 3 sources',
    );
    expect(() => decode({ sources: Array(MAX_SOURCES + 1).fill(SOURCE) })).toThrow(
      'at most 8 sources',
    );
    expect(() => decode({ sources: [{ author: 'Dana' }, SOURCE, SOURCE] })).toThrow(/title/u);
  });

  it('limits each citation field independently', () => {
    const fields = {
      title: SOURCE_TITLE_MAX_CHARS,
      author: SOURCE_AUTHOR_MAX_CHARS,
      publisher: SOURCE_PUBLISHER_MAX_CHARS,
      year: SOURCE_YEAR_MAX_CHARS,
    };
    for (const [field, max] of Object.entries(fields)) {
      expect(() =>
        decode({ sources: [{ ...SOURCE, [field]: 'x'.repeat(max) }, SOURCE, SOURCE] }),
      ).not.toThrow();
      expect(() =>
        decode({ sources: [{ ...SOURCE, [field]: 'x'.repeat(max + 1) }, SOURCE, SOURCE] }),
      ).toThrow(`at most ${max} characters`);
    }
  });

  it('keeps full web destinations and refuses unsafe, invalid or overlong URLs', () => {
    expect(decode({ sources: [SOURCE, SOURCE, SOURCE] })).toMatchObject({
      sources: [{ url: SOURCE.url }, { url: SOURCE.url }, { url: SOURCE.url }],
    });
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,hello',
      'https://',
      'https://a b.test',
      'file:///tmp/a',
      'not a URL',
    ]) {
      expect(() => decode({ sources: [{ ...SOURCE, url }, SOURCE, SOURCE] })).toThrow(
        /web address/u,
      );
    }

    expect(() =>
      decode({
        sources: [
          { ...SOURCE, url: `https://example.com/${'x'.repeat(SOURCE_URL_MAX_CHARS)}` },
          SOURCE,
          SOURCE,
        ],
      }),
    ).toThrow(`at most ${SOURCE_URL_MAX_CHARS} characters`);
  });

  it('shortens title and credit limits only when the sources take two columns', () => {
    const fields = {
      title: SOURCE_TITLE_MAX_CHARS_DENSE,
      author: SOURCE_CREDIT_MAX_CHARS_DENSE,
      publisher: SOURCE_CREDIT_MAX_CHARS_DENSE,
    };
    for (const [field, max] of Object.entries(fields)) {
      const sources = Array.from({ length: 5 }, () => ({
        ...SOURCE,
        [field]: 'x'.repeat(max + 1),
      }));
      const limits = slideFieldLimits(sourcesLayoutContract, {
        frontmatter: { sources },
        filled: [],
      });
      expect(fieldLimitBreaches({ sources }, limits)).toHaveLength(5);

      const four = sources.slice(0, 4);
      expect(
        fieldLimitBreaches(
          { sources: four },
          slideFieldLimits(sourcesLayoutContract, { frontmatter: { sources: four }, filled: [] }),
        ),
      ).toEqual([]);
    }
  });

  it('shows all references together and rejects unknown citation fields', () => {
    expect(() => decode({ sources: [SOURCE, SOURCE, SOURCE], reveal: true })).toThrow(
      'Expected no excess property',
    );
    expect(() => decode({ sources: [{ ...SOURCE, text: 'A summary' }, SOURCE, SOURCE] })).toThrow(
      'Expected no excess property',
    );
    expect(sourcesLayoutContract.pptx).toMatchObject({
      type: 'title-only',
      placeholders: [{ kind: 'title' }, { kind: 'body' }],
    });
  });
});
