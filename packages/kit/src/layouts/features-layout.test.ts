import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { fieldLimitBreaches, slideFieldLimits } from '@deckster/engine/layout';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  FEATURE_DETAIL_MAX_CHARS,
  FEATURE_TITLE_MAX_CHARS,
  FEATURE_TITLE_MAX_CHARS_DENSE,
  featuresLayoutContract,
} from '#layouts/features-layout.contract.ts';
import { featureColumns } from '#layouts/features-layout.tsx';

/**
 * A capability with optional detail at the six-item limit.
 */
const FEATURE = { icon: 'leaf', title: 'Tree care', detail: 'Three summers of watering' };

/**
 * Decodes the common slide fields and the layout fields, rejecting unsupported input.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...featuresLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'features', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the features layout contract', () => {
  it('decodes its published example', () => {
    expect(() => decode(featuresLayoutContract.example.frontmatter)).not.toThrow();
  });

  it('chooses columns without leaving a single orphan', () => {
    const cases = [
      [6, 3],
      [7, 4],
      [8, 4],
      [9, 3],
      [10, 4],
      [12, 4],
    ] as const;
    for (const [count, columns] of cases) {
      expect(featureColumns(count)).toBe(columns);
    }
  });

  it('accepts every count from six to twelve and rejects either side', () => {
    for (let count = 6; count <= 12; count += 1) {
      expect(() =>
        decode({ features: Array(count).fill({ icon: 'leaf', title: 'Care' }) }),
      ).not.toThrow();
    }

    expect(() => decode({ features: Array(5).fill(FEATURE) })).toThrow('at least 6 features');
    expect(() => decode({ features: Array(13).fill({ icon: 'leaf', title: 'Care' }) })).toThrow(
      'at most 12 features',
    );
  });

  it('requires an icon and a nonempty title while detail is optional', () => {
    expect(decode({ features: Array(6).fill({ icon: 'leaf', title: 'Care' }) })).toMatchObject({
      chrome: true,
      reveal: false,
    });
    expect(() => decode({ features: Array(6).fill({ title: 'Care' }) })).toThrow(/icon/u);
    expect(() => decode({ features: Array(6).fill({ ...FEATURE, title: '' }) })).toThrow(/title/u);
    expect(() => decode({ features: Array(6).fill({ ...FEATURE, icon: '../leaf' }) })).toThrow(
      'Expected an icon name',
    );
    expect(() =>
      decode({ features: Array(6).fill({ ...FEATURE, icon: 'tabler:leaf' }) }),
    ).not.toThrow();
  });

  it('rejects titles and details one character beyond their limits', () => {
    for (const [field, maximum] of [
      ['title', FEATURE_TITLE_MAX_CHARS],
      ['detail', FEATURE_DETAIL_MAX_CHARS],
    ] as const) {
      expect(() =>
        decode({ features: Array(6).fill({ ...FEATURE, [field]: 'x'.repeat(maximum) }) }),
      ).not.toThrow();
      expect(() =>
        decode({ features: Array(6).fill({ ...FEATURE, [field]: 'x'.repeat(maximum + 1) }) }),
      ).toThrow(`at most ${maximum} characters`);
    }
  });

  it('shortens text at the nine-item detail boundary', () => {
    for (const count of [8, 9, 10, 11, 12]) {
      const features = Array(count).fill({
        ...FEATURE,
        title: 'x'.repeat(FEATURE_TITLE_MAX_CHARS_DENSE + 1),
      });
      const limits = slideFieldLimits(featuresLayoutContract, {
        frontmatter: { features },
        filled: [],
      });
      expect(fieldLimitBreaches({ features }, limits)).toHaveLength(count === 8 ? 0 : count);
    }
  });

  it('rejects the old label field before release', () => {
    expect(() => decode({ features: Array(6).fill({ icon: 'leaf', label: 'Care' }) })).toThrow(
      /title|label/u,
    );
  });

  it('allows details through nine items and rejects them throughout ten to twelve', () => {
    for (const count of [6, 7, 8, 9, 10, 11, 12]) {
      const features = Array(count).fill(FEATURE);
      const frontmatter = Schema.decodeUnknownSync(featuresLayoutContract.schema)({ features });
      expect(featuresLayoutContract.checks?.(frontmatter)).toHaveLength(count <= 9 ? 0 : 1);

      const titlesOnly = Schema.decodeUnknownSync(featuresLayoutContract.schema)({
        features: Array(count).fill({ icon: 'leaf', title: 'Care' }),
      });
      expect(titlesOnly.features).toHaveLength(count);
    }
  });

  it('maps the title and context to native PowerPoint placeholders', () => {
    expect(featuresLayoutContract.pptx).toMatchObject({
      type: 'title-only',
      placeholders: [{ kind: 'title' }, { kind: 'body' }],
    });
  });

  it('accepts details at their limit and rejects one extra character', () => {
    for (const count of [6, 7, 8, 9]) {
      const features = Array(count).fill({
        ...FEATURE,
        detail: 'x'.repeat(FEATURE_DETAIL_MAX_CHARS),
      });
      expect(() => decode({ features })).not.toThrow();
      const overLimit = features.map((feature) => ({ ...feature, detail: feature.detail + 'x' }));
      expect(() => decode({ features: overLimit })).toThrow(
        `at most ${FEATURE_DETAIL_MAX_CHARS} characters`,
      );
    }
  });
});
