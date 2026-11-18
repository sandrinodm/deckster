import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  RISK_MITIGATION_MAX_CHARS,
  RISK_NAME_MAX_CHARS,
  RISKS_HIGHLIGHT_LABEL_MAX_CHARS,
  RISKS_LABEL_MAX_CHARS,
  RISKS_LEVEL_LABEL_MAX_CHARS,
  risksLayoutContract,
  risksProblems,
} from '#layouts/risks-layout.contract.ts';

/**
 * A complete risk with two independent severity levels.
 */
const RISK = {
  name: 'Summer drought',
  likelihood: 'high',
  impact: 'medium',
  mitigation: 'Fund a weekly watering crew',
} as const;

/**
 * The English column heads, level words and highlight prefix used when `labels` is omitted.
 */
const DEFAULT_LABELS = {
  name: 'Risk',
  likelihood: 'Likelihood',
  impact: 'Impact',
  mitigation: 'Mitigation',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  highlight: 'Priority risk',
} as const;

/**
 * The limit of every label key, in characters.
 */
const LABEL_LIMITS = {
  name: RISKS_LABEL_MAX_CHARS,
  likelihood: RISKS_LABEL_MAX_CHARS,
  impact: RISKS_LABEL_MAX_CHARS,
  mitigation: RISKS_LABEL_MAX_CHARS,
  low: RISKS_LEVEL_LABEL_MAX_CHARS,
  medium: RISKS_LEVEL_LABEL_MAX_CHARS,
  high: RISKS_LEVEL_LABEL_MAX_CHARS,
  highlight: RISKS_HIGHLIGHT_LABEL_MAX_CHARS,
} as const;

/**
 * Decodes the shared slide fields and register fields with excess properties rejected.
 */
function decode(frontmatter: Record<string, unknown>) {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...risksLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'risks', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the risks layout contract', () => {
  it('takes three to five risks without changing their order', () => {
    const risks = [RISK, { ...RISK, name: 'Late stock' }, { ...RISK, name: 'Turnover' }];
    expect(decode({ risks })).toMatchObject({ risks });
    expect(() => decode({ risks: [RISK, RISK] })).toThrow('at least 3 risks');
    expect(() => decode({ risks: Array(5).fill(RISK) })).not.toThrow();
    expect(() => decode({ risks: Array(6).fill(RISK) })).toThrow('at most 5 risks');
  });

  it('requires a name, mitigation and categorical likelihood and impact on each row', () => {
    for (const field of ['name', 'mitigation', 'likelihood', 'impact'] as const) {
      const { [field]: omitted, ...risk } = RISK;
      expect(omitted).toBeDefined();
      expect(() => decode({ risks: [risk, RISK, RISK] })).toThrow(field);
    }

    for (const value of ['low', 'medium', 'high']) {
      expect(() =>
        decode({ risks: Array(3).fill({ ...RISK, likelihood: value, impact: value }) }),
      ).not.toThrow();
    }

    for (const field of ['likelihood', 'impact']) {
      expect(() => decode({ risks: [{ ...RISK, [field]: 'critical' }, RISK, RISK] })).toThrow(
        field,
      );
    }
  });

  it('bounds names and mitigations and refuses empty or unknown fields', () => {
    for (const [field, limit] of [
      ['name', RISK_NAME_MAX_CHARS],
      ['mitigation', RISK_MITIGATION_MAX_CHARS],
    ] as const) {
      expect(() =>
        decode({ risks: [{ ...RISK, [field]: 'x'.repeat(limit) }, RISK, RISK] }),
      ).not.toThrow();
      expect(() =>
        decode({ risks: [{ ...RISK, [field]: 'x'.repeat(limit + 1) }, RISK, RISK] }),
      ).toThrow(`at most ${limit} characters`);
      expect(() => decode({ risks: [{ ...RISK, [field]: '' }, RISK, RISK] })).toThrow(field);
    }

    expect(() => decode({ risks: [RISK, RISK, RISK], owner: 'Mara' })).toThrow('owner');
    expect(() => decode({ risks: [{ ...RISK, owner: 'Mara' }, RISK, RISK] })).toThrow('owner');
  });

  it('shows all rows and chrome by default, with optional reveal', () => {
    expect(decode({ risks: [RISK, RISK, RISK] })).toMatchObject({ reveal: false, chrome: true });
    expect(decode({ risks: [RISK, RISK, RISK], reveal: true, chrome: false })).toMatchObject({
      reveal: true,
      chrome: false,
    });
  });

  it('highlights at most one row without requiring a severity sort', () => {
    expect(risksProblems([RISK, { ...RISK, likelihood: 'low', highlight: true }, RISK])).toEqual(
      [],
    );
    expect(
      risksProblems([{ ...RISK, highlight: true }, RISK, { ...RISK, highlight: true }]),
    ).toEqual([expect.objectContaining({ path: 'risks', fix: expect.any(String) })]);
    const frontmatter = decode({
      risks: [{ ...RISK, highlight: true }, RISK, { ...RISK, highlight: true }],
    });
    expect(risksLayoutContract.checks?.(frontmatter)).toHaveLength(1);
  });

  it('keeps the English column heads and level words when labels is omitted', () => {
    expect(decode({ risks: [RISK, RISK, RISK] }).labels).toEqual(DEFAULT_LABELS);
  });

  it('keeps the English default of every label key that is not given', () => {
    const { labels } = decode({ risks: [RISK, RISK, RISK], labels: { name: 'Hazard' } });
    expect(labels).toEqual({ ...DEFAULT_LABELS, name: 'Hazard' });
  });

  it('accepts every label at its limit and refuses one over, naming the limit', () => {
    for (const [key, limit] of Object.entries(LABEL_LIMITS)) {
      const risks = [RISK, RISK, RISK];
      expect(() => decode({ risks, labels: { [key]: 'x'.repeat(limit) } })).not.toThrow();
      expect(() => decode({ risks, labels: { [key]: 'x'.repeat(limit + 1) } })).toThrow(
        `at most ${limit} characters`,
      );
      expect(() => decode({ risks, labels: { [key]: '' } })).toThrow(key);
    }
  });

  it('refuses a label key that does not exist', () => {
    expect(() => decode({ risks: [RISK, RISK, RISK], labels: { owner: 'Who' } })).toThrow('owner');
  });

  it('provides native title and context placeholders for PowerPoint', () => {
    expect(risksLayoutContract.pptx).toMatchObject({
      type: 'title-only',
      placeholders: [{ kind: 'title' }, { kind: 'body' }],
    });
  });
});
