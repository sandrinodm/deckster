import type { AnyLayoutContract } from '@deckster/engine/layout';

import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { fieldLimitBreaches, slideFieldLimits } from '@deckster/engine/layout';
import { BODY_SLOT, slotTag } from '@deckster/engine/slots';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import catalog from '#catalog.ts';
import { contentLayoutContract } from '#layouts/content-layout.contract.ts';
import { sectionLayoutContract, sectionProblems } from '#layouts/section-layout.contract.ts';
import { splitLayoutContract } from '#layouts/split-layout.contract.ts';
import { statementLayoutContract } from '#layouts/statement-layout.contract.ts';
import { statsLayoutContract } from '#layouts/stats-layout.contract.ts';
import { titleLayoutContract } from '#layouts/title-layout.contract.ts';

const EXEMPLARS: readonly AnyLayoutContract[] = [
  titleLayoutContract,
  sectionLayoutContract,
  statementLayoutContract,
  contentLayoutContract,
  splitLayoutContract,
  statsLayoutContract,
];

const TWO_STATS = [
  { value: '9%', label: 'canopy cover in Eastgate' },
  { value: '34%', label: 'canopy cover in Riverside' },
];

/**
 * Decodes a slide's frontmatter as the build does: the fields every slide has plus the layout's.
 */
function decode(contract: AnyLayoutContract, frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({ ...SlideFrontmatter.fields, ...contract.schema.fields });
  return Schema.decodeUnknownSync(schema)(
    { layout: contract.name, ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the exemplar layout contracts', () => {
  it('are all in the kit catalog, in deck order after default, before the later layouts', () => {
    const exemplars = catalog.layouts.slice(0, EXEMPLARS.length + 1);
    expect(exemplars.map((contract) => contract.name)).toEqual([
      'default',
      'title',
      'section',
      'statement',
      'content',
      'split',
      'stats',
    ]);
  });

  for (const contract of EXEMPLARS) {
    describe(`the ${contract.name} layout`, () => {
      it('says when to use it in a sentence or more', () => {
        expect(contract.description.length).toBeGreaterThan(80);
      });

      it('has an example whose frontmatter decodes and whose body fills its required slots', () => {
        expect(() => decode(contract, contract.example.frontmatter)).not.toThrow();
        const requiredTags = Object.entries(contract.slots)
          .filter(([slot, spec]) => spec.required === true && slot !== BODY_SLOT)
          .map(([slot]) => `<${slotTag(slot)}>`);
        for (const tag of requiredTags) {
          expect(contract.example.body).toContain(tag);
        }
      });

      it('budgets only its own slots, body included', () => {
        const slots = new Set([...Object.keys(contract.slots), BODY_SLOT]);
        for (const slot of Object.keys(contract.budget)) {
          expect(slots.has(slot), slot).toBe(true);
        }
      });

      it('ends its example with speaker notes', () => {
        expect(contract.example.body).toContain('<Notes>');
      });

      it('has an example that needs no files: no image or media source path', () => {
        expect(contract.example.body).not.toMatch(/src=["'{]/u);
      });

      it('has an example whose title keeps to the layout title limit', () => {
        const title = contract.example.frontmatter['title'];
        const length = typeof title === 'string' ? title.length : Number.POSITIVE_INFINITY;
        expect(length).toBeLessThanOrEqual(contract.title?.maxChars ?? Number.MAX_SAFE_INTEGER);
      });

      it('budgets its variants only for its own slots', () => {
        const slots = new Set([...Object.keys(contract.slots), BODY_SLOT]);
        for (const variant of contract.variants ?? []) {
          for (const slot of Object.keys(variant.budget)) {
            expect(slots.has(slot), `${variant.name}: ${slot}`).toBe(true);
          }
        }
      });

      it('rejects an eyebrow longer than one short line', () => {
        expect(() =>
          decode(contract, { ...contract.example.frontmatter, eyebrow: 'x'.repeat(41) }),
        ).toThrow('at most 40 characters');
      });

      it('rejects a field it does not have', () => {
        expect(() => decode(contract, { ...contract.example.frontmatter, colour: 'red' })).toThrow(
          'Expected no excess property',
        );
      });
    });
  }
});

describe('layout defaults', () => {
  it('hide the page chrome on covers and section dividers, and show it elsewhere', () => {
    expect(decode(titleLayoutContract, {})).toMatchObject({ chrome: false });
    expect(decode(sectionLayoutContract, {})).toMatchObject({ chrome: false });
    expect(decode(statementLayoutContract, {})).toMatchObject({ chrome: true });
    expect(decode(contentLayoutContract, {})).toMatchObject({ chrome: true });
    expect(decode(statsLayoutContract, { stats: TWO_STATS })).toMatchObject({ chrome: true });
  });

  it('let a slide switch the chrome either way', () => {
    expect(decode(titleLayoutContract, { chrome: true })).toMatchObject({ chrome: true });
    expect(decode(contentLayoutContract, { chrome: false })).toMatchObject({ chrome: false });
  });

  it('put covers, dividers and statements on their own surfaces', () => {
    expect(titleLayoutContract.surface).toBe('gradient');
    expect(sectionLayoutContract.surface).toBe('accent');
    expect(statementLayoutContract.surface).toBe('inverse');
    expect(contentLayoutContract.surface).toBeUndefined();
    expect(splitLayoutContract.surface).toBeUndefined();
    expect(statsLayoutContract.surface).toBeUndefined();
  });
});

describe('split fields', () => {
  it('default to an even split with framed media on the right', () => {
    expect(decode(splitLayoutContract, {})).toMatchObject({
      ratio: '1:1',
      side: 'right',
      bleed: false,
    });
  });

  it('accept the three ratios and both sides, and nothing else', () => {
    for (const ratio of ['1:1', '5:7', '7:5']) {
      expect(() => decode(splitLayoutContract, { ratio, side: 'left', bleed: true })).not.toThrow();
    }

    expect(() => decode(splitLayoutContract, { ratio: '1:2' })).toThrow(
      'Expected "1:1" | "5:7" | "7:5"',
    );
    expect(() => decode(splitLayoutContract, { side: 'top' })).toThrow('Expected "left" | "right"');
  });
});

describe('stats fields', () => {
  it('take two to four stats', () => {
    const stat = { value: '1', label: 'one' };
    expect(() => decode(statsLayoutContract, { stats: [stat] })).toThrow('at least 2 stats');
    expect(() => decode(statsLayoutContract, { stats: [stat, stat, stat, stat, stat] })).toThrow(
      'at most 4 stats',
    );
    expect(() => decode(statsLayoutContract, { stats: [stat, stat, stat, stat] })).not.toThrow();
  });

  it('need a short value and a label, and accept a number as the value', () => {
    expect(() =>
      decode(statsLayoutContract, { stats: [{ value: '123,456,789', label: 'x' }, ...TWO_STATS] }),
    ).toThrow('at most 8 characters');
    expect(() => decode(statsLayoutContract, { stats: [{ value: '9%' }, ...TWO_STATS] })).toThrow(
      'Missing key',
    );
    expect(() =>
      decode(statsLayoutContract, { stats: [{ value: 42, label: 'blocks' }, ...TWO_STATS] }),
    ).not.toThrow();
  });

  it('accept a delta with a tone of positive, negative or neutral only', () => {
    const withTone = (tone: string) => [{ ...TWO_STATS[0], delta: '−31%', tone }, TWO_STATS[1]];
    expect(() => decode(statsLayoutContract, { stats: withTone('positive') })).not.toThrow();
    expect(() => decode(statsLayoutContract, { stats: withTone('good') })).toThrow(
      'Expected "positive" | "negative" | "neutral"',
    );
  });
});

describe('title and section fields', () => {
  it('take a byline and a date of a line each', () => {
    expect(() => decode(titleLayoutContract, { byline: 'x'.repeat(61) })).toThrow(
      'Expected a byline of at most 40 characters',
    );
    expect(() => decode(titleLayoutContract, { date: '18 November 2026' })).not.toThrow();
  });

  it('take a part number as a whole number or a short label', () => {
    expect(decode(sectionLayoutContract, { number: 2 })).toMatchObject({ number: 2 });
    expect(decode(sectionLayoutContract, { number: 'IV' })).toMatchObject({ number: 'IV' });
    expect(() => decode(sectionLayoutContract, { number: 'Part 4' })).toThrow('at most 3');
    expect(() => decode(sectionLayoutContract, { number: 1.5 })).toThrow('Expected an integer');
  });
});

describe('content fields', () => {
  it('default to the reading measure and accept the full width', () => {
    expect(decode(contentLayoutContract, {})).toMatchObject({ width: 'text' });
    expect(decode(contentLayoutContract, { width: 'full' })).toMatchObject({ width: 'full' });
    expect(() => decode(contentLayoutContract, { width: 'wide' })).toThrow(
      'Expected "text" | "full"',
    );
  });

  it('need a title on every content, split, stats, section and title slide, not a statement', () => {
    for (const contract of [contentLayoutContract, splitLayoutContract, statsLayoutContract]) {
      expect(contract.title?.required, contract.name).toBe(true);
    }

    expect(sectionLayoutContract.title?.required).toBe(true);
    expect(titleLayoutContract.title?.required).toBe(true);
    expect(statementLayoutContract.title).toBeUndefined();
  });
});

describe('split variants', () => {
  it('hold the narrow 5:7 text column to about thirty words', () => {
    const narrow = splitLayoutContract.variants?.find((variant) => variant.name === 'ratio 5:7');
    expect(narrow?.when).toEqual({ fields: { ratio: '5:7' } });
    expect(narrow?.budget.body?.maxWords).toBe(30);
  });

  it('take a brand image treatment by name', () => {
    expect(decode(splitLayoutContract, { treatment: 'plain' })).toMatchObject({
      treatment: 'plain',
    });
    expect(() => decode(splitLayoutContract, { treatment: 'Plain Photo' })).toThrow(
      'Expected a treatment name',
    );
  });
});

describe('stats limits', () => {
  it('hold labels in a row of four to a tighter limit, on a variant the build checks', () => {
    const label = 'x'.repeat(40);
    const four = Array.from({ length: 4 }, () => ({ value: '9%', label }));
    /**
     * The labels over the limits of the variants a row of stats matches.
     */
    const breaches = (stats: typeof four) =>
      fieldLimitBreaches(
        { stats },
        slideFieldLimits(statsLayoutContract, { frontmatter: { stats }, filled: [] }),
      );
    expect(() => decode(statsLayoutContract, { stats: four })).not.toThrow();
    expect(breaches(four)).toEqual(
      [0, 1, 2, 3].map((index) => ({ path: `stats[${index}].label`, length: 40, maxChars: 32 })),
    );
    expect(breaches(four.slice(0, 3))).toEqual([]);
  });

  it('take a trend for a delta without a sign, and a highlight', () => {
    const stats = [{ ...TWO_STATS[0], delta: '12 pts over target', trend: 'up', highlight: true }];
    expect(() => decode(statsLayoutContract, { stats: [...stats, TWO_STATS[1]] })).not.toThrow();
  });

  it('reject keys a stat does not have', () => {
    expect(() =>
      decode(statsLayoutContract, {
        stats: [{ ...TWO_STATS[0], tones: 'positive' }, TWO_STATS[1]],
      }),
    ).toThrow('Expected no excess property');
  });
});

describe('display layout options', () => {
  it('set the cover, divider and statement from the left unless a slide centres them', () => {
    for (const contract of [titleLayoutContract, sectionLayoutContract, statementLayoutContract]) {
      expect(decode(contract, {}), contract.name).toMatchObject({ align: 'left' });
      expect(decode(contract, { align: 'center' }), contract.name).toMatchObject({
        align: 'center',
      });
      expect(() => decode(contract, { align: 'right' }), contract.name).toThrow(
        'Expected "left" | "center"',
      );
    }
  });

  it('mark a statement’s emphasis with an underline only when the slide asks for it', () => {
    expect(decode(statementLayoutContract, {})).not.toHaveProperty('emphasis');
    expect(decode(statementLayoutContract, { emphasis: 'underline' })).toMatchObject({
      emphasis: 'underline',
    });
    expect(() => decode(statementLayoutContract, { emphasis: 'bold' })).toThrow(
      'Expected "underline"',
    );
  });

  it('set a divider’s number on the top line unless the slide asks for the large numeral', () => {
    expect(decode(sectionLayoutContract, { number: 2 })).not.toHaveProperty('numeral');
    expect(decode(sectionLayoutContract, { number: 2, numeral: 'large' })).toMatchObject({
      numeral: 'large',
    });
    expect(() => decode(sectionLayoutContract, { numeral: 'huge' })).toThrow(
      'Expected "small" | "large"',
    );
  });

  it('report a large numeral on a divider that has no number', () => {
    expect(sectionProblems({ numeral: 'large' })).toEqual([
      expect.objectContaining({ path: 'numeral' }),
    ]);
    expect(sectionProblems({ numeral: 'large', number: 'IV' })).toEqual([]);
    expect(sectionProblems({})).toEqual([]);
  });

  it('hold the summary of a divider beside a photo to fewer words, on a variant', () => {
    const variant = sectionLayoutContract.variants?.find((entry) => entry.name === 'with media');
    expect(variant?.budget.body?.maxWords).toBe(14);
  });

  it('take a photo on a divider, as on the cover', () => {
    expect(sectionLayoutContract.slots['media']?.accepts).toEqual(['image']);
    expect(decode(sectionLayoutContract, { treatment: 'plain' })).toMatchObject({
      treatment: 'plain',
    });
  });
});
