import type { AnyLayoutContract } from '@deckster/engine/layout';

import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { fieldLimitBreaches, slideFieldLimits } from '@deckster/engine/layout';
import { BODY_SLOT, slotTag } from '@deckster/engine/slots';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import catalog from '#catalog.ts';
import { agendaLayoutContract } from '#layouts/agenda-layout.contract.ts';
import { closingLayoutContract, qrProblems } from '#layouts/closing-layout.contract.ts';
import {
  comparisonLayoutContract,
  comparisonProblems,
} from '#layouts/comparison-layout.contract.ts';
import { imageLayoutContract } from '#layouts/image-layout.contract.ts';
import { LIMIT_CASES } from '#layouts/limit-cases.ts';
import { logosLayoutContract } from '#layouts/logos-layout.contract.ts';
import { stepsLayoutContract } from '#layouts/steps-layout.contract.ts';
import { teamLayoutContract } from '#layouts/team-layout.contract.ts';

/**
 * The layouts added after the six exemplars and the four technical ones.
 */
const LATER = [
  'agenda',
  'quote',
  'image',
  'cards',
  'steps',
  'comparison',
  'timeline',
  'table',
  'logos',
  'team',
  'bio',
  'closing',
] as const;

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

/**
 * The catalog's contract of a layout.
 *
 * @param name - The layout name.
 */
function contractOf(name: string): AnyLayoutContract {
  const contract = catalog.layouts.find((layout) => layout.name === name);
  if (contract === undefined) {
    throw new Error(`The kit catalog has no ${name} layout.`);
  }

  return contract;
}

describe('the later layout contracts', () => {
  it('follow the technical layouts in the catalog, in the order a deck uses them', () => {
    expect(catalog.layouts.slice(-LATER.length).map((contract) => contract.name)).toEqual([
      ...LATER,
    ]);
  });

  for (const name of LATER) {
    describe(`the ${name} layout`, () => {
      const contract = contractOf(name);

      it('says when to use it and when not to', () => {
        expect(contract.description.length).toBeGreaterThan(200);
        expect(contract.description).toMatch(/\buse\b/iu);
      });

      it('has an example that decodes, fills its required slots, needs no files and has notes', () => {
        expect(() => decode(contract, contract.example.frontmatter)).not.toThrow();
        const requiredTags = Object.entries(contract.slots)
          .filter(([slot, spec]) => spec.required === true && slot !== BODY_SLOT)
          .map(([slot]) => `<${slotTag(slot)}>`);
        for (const tag of requiredTags) {
          expect(contract.example.body).toContain(tag);
        }

        expect(contract.example.body).not.toMatch(/src=["'{]/u);
        expect(contract.example.body).toContain('<Notes>');
      });

      it('budgets only its own slots, in the base form and every variant', () => {
        const slots = new Set([...Object.keys(contract.slots), BODY_SLOT]);
        for (const budget of [contract.budget, ...(contract.variants ?? []).map((v) => v.budget)]) {
          for (const slot of Object.keys(budget)) {
            expect(slots.has(slot), slot).toBe(true);
          }
        }
      });

      it('maps to PowerPoint and has limit cases for the budget stress test', () => {
        expect(contract.pptx?.placeholders.length ?? 0).toBeGreaterThan(0);
        expect(LIMIT_CASES[name]?.length ?? 0).toBeGreaterThan(0);
      });

      it('rejects a field it does not have', () => {
        expect(() => decode(contract, { ...contract.example.frontmatter, colour: 'red' })).toThrow(
          'Expected no excess property',
        );
      });
    });
  }
});

describe('layout fields', () => {
  it('take an agenda of three to seven items and a current part by number', () => {
    const item = { title: 'Why Eastgate' };
    expect(() => decode(agendaLayoutContract, { items: [item, item] })).toThrow('at least 3');
    expect(() =>
      decode(agendaLayoutContract, { items: Array.from({ length: 8 }, () => item) }),
    ).toThrow('at most 7');
    expect(() => decode(agendaLayoutContract, { items: [item, item, item], current: 0 })).toThrow(
      'the number of an item',
    );
  });

  it('hold the detail of a dense agenda to one line, on a variant the build checks', () => {
    const items = Array.from({ length: 6 }, () => ({ title: 'Plant', detail: 'x'.repeat(40) }));
    const limits = slideFieldLimits(agendaLayoutContract, { frontmatter: { items }, filled: [] });
    expect(fieldLimitBreaches({ items }, limits)).toHaveLength(6);
    expect(
      fieldLimitBreaches(
        { items: items.slice(0, 4) },
        slideFieldLimits(agendaLayoutContract, {
          frontmatter: { items: items.slice(0, 4) },
          filled: [],
        }),
      ),
    ).toEqual([]);
  });

  it('take a team of three to eight with a focal point as a CSS position', () => {
    const member = { name: 'Dana Okafor', role: 'Programme lead' };
    const three = [member, member, member];
    expect(() => decode(teamLayoutContract, { members: [member, member] })).toThrow('at least 3');
    expect(() =>
      decode(teamLayoutContract, { members: [{ ...member, focal: 'center 30%' }, member, member] }),
    ).not.toThrow();
    expect(() =>
      decode(teamLayoutContract, { members: [{ ...member, focal: 'the face' }, ...three] }),
    ).toThrow('focal point');
  });

  it('take comparison values as text or a check, and three options at tighter limits', () => {
    const options = [{ name: 'Pear' }, { name: 'Plane', recommended: true }, { name: 'Oak' }];
    const rows = [
      { label: 'Cost', values: ['$1,900', '$4,600', 'x'.repeat(26)] },
      { label: 'Survives a drought', values: [false, true, true] },
    ];
    expect(() => decode(comparisonLayoutContract, { options, rows })).not.toThrow();
    const limits = slideFieldLimits(comparisonLayoutContract, {
      frontmatter: { options, rows },
      filled: [],
    });
    expect(fieldLimitBreaches({ options, rows }, limits).map((breach) => breach.path)).toEqual([
      'rows[0].values[2]',
    ]);
  });

  it('set logos in one color by default and take an optical scale', () => {
    const logos = [{ name: 'A' }, { name: 'B', scale: 1.2 }, { name: 'C' }];
    expect(decode(logosLayoutContract, { logos })).toMatchObject({ tone: 'mono' });
    expect(() =>
      decode(logosLayoutContract, { logos: [...logos, { name: 'D', scale: 3 }] }),
    ).toThrow('scale from 0.5 to 1.5');
  });

  it('put a full-bleed photo on the inverse surface without chrome, text at the bottom', () => {
    expect(imageLayoutContract.surface).toBe('inverse');
    expect(decode(imageLayoutContract, {})).toMatchObject({ text: 'bottom', chrome: false });
    expect(() => decode(imageLayoutContract, { text: 'top' })).toThrow('Expected "bottom"');
  });

  it('refuse a QR value that is not a web address, and a contact link that runs script', () => {
    expect(() => decode(closingLayoutContract, { qr: 'not a link' })).toThrow('web address');
    expect(() =>
      decode(closingLayoutContract, { qr: 'https://larkfield.example/canopy' }),
    ).not.toThrow();
    const contact = { label: 'Email', text: 'dana@larkfield.example' };
    expect(() =>
      decode(closingLayoutContract, { contacts: [{ ...contact, href: 'javascript:alert(1)' }] }),
    ).toThrow('http:, https:, mailto: or tel:');
    expect(() =>
      decode(closingLayoutContract, { contacts: [{ ...contact, href: 'mailto:dana@x.example' }] }),
    ).not.toThrow();
  });

  it('hold the address under a QR code to two lines broken at slashes and dots', () => {
    expect(qrProblems('https://larkfield.example/canopy')).toEqual([]);
    expect(qrProblems(`https://lark.example/${'a'.repeat(30)}`)[0]?.message).toContain(
      'has a part of 30 characters',
    );
    expect(qrProblems(`https://lark.example/${'a'.repeat(21)}`)).toEqual([]);
    expect(qrProblems(`https://www.${'ab.'.repeat(20)}example/x`)[0]?.message).toContain(
      'it takes at most 44',
    );
    expect(qrProblems(undefined)).toEqual([]);
  });

  it('check that comparison rows hold one value per option and one option is recommended', () => {
    const options = [{ name: 'Pear' }, { name: 'Plane' }, { name: 'Oak' }];
    const rows = [{ label: 'Cost', values: ['$1', '$2'] }];
    expect(comparisonProblems(options, rows)).toEqual([
      expect.objectContaining({
        path: 'rows[0].values',
        message: 'Row "Cost" has 2 values for 3 options.',
      }),
    ]);
    const two = [
      { name: 'Pear', recommended: true },
      { name: 'Plane', recommended: true },
    ];
    expect(comparisonProblems(two, [{ label: 'Cost', values: ['$1', '$2'] }])).toEqual([
      expect.objectContaining({ path: 'options' }),
    ]);
  });

  it('name the recommended option with a badge the slide can change', () => {
    const options = [{ name: 'A', recommended: true }, { name: 'B' }];
    const rows = [
      { label: 'Cost', values: ['$1', '$2'] },
      { label: 'Shade', values: [true, false] },
    ];
    expect(decode(comparisonLayoutContract, { options, rows })).toMatchObject({
      badge: 'Recommended',
    });
    expect(decode(comparisonLayoutContract, { options, rows, badge: 'Our pick' })).toMatchObject({
      badge: 'Our pick',
    });
  });

  it('check current against the items it counts, in steps, agenda and timeline', () => {
    const steps = [{ title: 'A' }, { title: 'B' }, { title: 'C' }];
    expect(
      stepsLayoutContract.checks?.({ steps, current: 5, reveal: false, chrome: true }),
    ).toEqual([expect.objectContaining({ path: 'current' })]);
    expect(
      stepsLayoutContract.checks?.({ steps, current: 3, reveal: false, chrome: true }),
    ).toEqual([]);
  });

  it('publish one variant per range, not one per count', () => {
    for (const contract of catalog.layouts) {
      const names = (contract.variants ?? []).map((variant) => variant.name);
      expect(
        names.filter((name) => /^\d+ (logos|items)$/u.test(name)),
        contract.name,
      ).toEqual([]);
    }
  });
});
